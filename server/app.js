import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { buildInvoicePdf } from "./pdf.js";
import { buildInvoiceNumber, calculateOrderTotals, roundCurrency } from "./tax.js";
import { getBusinessDayStart, parseBusinessDate } from "./time.js";
import { buildGstReportWorkbook } from "./xlsx.js";
import { createCorsOriginCheck } from "./cors.js";
import { sendError, sendServerError } from "./errors.js";
import { isValidRazorpayPaymentSignature, isValidRazorpayWebhookSignature, safeEqual } from "./security.js";
import { getRazorpayKeys, razorpayRequestJson, toPaise } from "./razorpay.js";
import { isValidEmail, sendInvoiceEmailForOrder } from "./email.js";
import {
  mapCategory,
  mapConfig,
  mapFloor,
  mapOrder,
  mapProduct,
  mapPublicOrder,
  mapPublicTable,
  mapSession,
  mapTable,
  toIso,
  toNumber,
} from "./mappers.js";

const app = express();
// Render puts one proxy in front of the app; rate limits need the real client IP.
app.set("trust proxy", 1);
// The API only serves JSON and file downloads to the frontend on another origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: createCorsOriginCheck(process.env.CORS_ORIGIN), credentials: true }));
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Limits are per client IP. Disabled under tests so suites can hit routes freely.
function createLimiter(limit, windowMs = 60 * 1000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: { error: "Too many requests. Please wait a moment and try again." },
  });
}

app.use("/api", createLimiter(300));
const orderLimiter = createLimiter(20);
const paymentLimiter = createLimiter(20);
const chatLimiter = createLimiter(10);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const validRoles = new Set(["admin", "cashier", "kitchen"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEM_QUANTITY = 99;
const TABLE_STATUSES = ["available", "occupied", "pending_confirmation"];
const ORDER_STATUSES = ["pending_confirmation", "confirmed", "cancelled"];
const KITCHEN_STATUSES = ["to_cook", "preparing", "completed"];
const PAYMENT_STATUSES = ["paid", "unpaid"];
const MAX_CHAT_QUESTION_LENGTH = 500;
const GROQ_TIMEOUT_MS = 30000;
// Staff bootstrap carries a year of orders: enough for the Reports page's longest
// range ("Last Year") without shipping the whole history every 3 seconds.
const BOOTSTRAP_ORDER_DAYS = 366;
// A QR order is created when the customer taps Pay, before Razorpay opens. Until
// the payment completes it isn't a real order, so staff screens never see it.
const STAFF_VISIBLE_ORDERS = { NOT: { source: "customer", payment_status: "unpaid" } };

// Sales are summed from the orders rather than kept as a running total, so paying,
// rejecting or deleting an order can never leave the figure out of step.
async function mapSessionWithSales(session) {
  if (!session) return null;
  const { _sum } = await prisma.order.aggregate({
    where: { session_id: session.id, payment_status: "paid", status: { not: "cancelled" } },
    _sum: { total_amount: true },
  });
  return { ...mapSession(session), total_sales: roundCurrency(toNumber(_sum.total_amount) || 0) };
}

function getPosQrPaymentTtlMinutes() {
  const raw = process.env.POS_QR_PAYMENT_TTL_MINUTES;
  const value = raw ? Number(raw) : 10;
  if (!Number.isFinite(value) || value <= 0) return 10;
  return value;
}

function isPosOrderQrPaymentExpired(order) {
  if (!order?.created_at) return false;
  const ttlMs = getPosQrPaymentTtlMinutes() * 60 * 1000;
  return Date.now() - new Date(order.created_at).getTime() > ttlMs;
}

async function requireValidCustomerSessionForTableId(tableId, customerSessionToken) {
  if (!customerSessionToken) {
    const err = new Error("Missing customer_session_token");
    err.status = 403;
    throw err;
  }

  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table?.customer_session_token) {
    const err = new Error("Table ordering session is not active. Please ask a staff member to unlock your table.");
    err.status = 403;
    throw err;
  }
  if (table.customer_session_token !== customerSessionToken) {
    const err = new Error("Invalid or expired session token.");
    err.status = 403;
    throw err;
  }
}

async function completePaymentForOrder({ order, payment, providerPaymentId, providerSignature }) {
  // /verify and the webhook usually arrive together. The conditional update means
  // only the first one to commit flips the order to paid; the other sees count 0.
  const { updatedOrder, wasPaid } = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, payment_status: "unpaid" },
      data: { payment_status: "paid" },
    });
    const alreadyPaid = count !== 1;

    // A QR order only reaches the POS once it's paid, so this is the moment the
    // table starts waiting for staff. An occupied table (second round) stays occupied.
    if (!alreadyPaid && order.source === "customer") {
      await tx.table.updateMany({
        where: { id: order.table_id, status: "available" },
        data: { status: "pending_confirmation" },
      });
      await tx.session.update({
        where: { id: order.session_id },
        data: { orders_count: { increment: 1 } },
      });
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "completed",
        provider_payment_id: providerPaymentId ? String(providerPaymentId) : payment.provider_payment_id,
        provider_signature: providerSignature ? String(providerSignature) : payment.provider_signature,
      },
    });

    const newOrder = await tx.order.findUnique({ where: { id: order.id } });
    return { updatedOrder: newOrder, wasPaid: alreadyPaid };
  });

  if (!wasPaid) {
    try {
      await sendInvoiceEmailForOrder(order.id);
    } catch (emailErr) {
      console.error(`Invoice email send failed for order ${order.id}:`, emailErr?.message || emailErr);
    }
  }

  return { updatedOrder, wasPaid };
}

async function createUniqueInvoiceNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = buildInvoiceNumber();
    const existingOrder = await prisma.order.findUnique({
      where: { invoice_number: invoiceNumber },
      select: { id: true },
    });

    if (!existingOrder) {
      return invoiceNumber;
    }
  }

  throw new Error("Failed to generate a unique invoice number");
}

function parseDateRange({ startDate, endDate }) {
  const safeStart = parseBusinessDate(startDate);
  const safeEnd = parseBusinessDate(endDate, true);

  if (!safeStart || !safeEnd) {
    return null;
  }

  return { start: safeStart, end: safeEnd };
}

async function fetchGstReportData(startDate, endDate) {
  const range = parseDateRange({ startDate, endDate });
  if (!range) {
    const err = new Error("Valid start_date and end_date are required");
    err.status = 400;
    throw err;
  }

  const orders = await prisma.order.findMany({
    where: {
      created_at: {
        gte: range.start,
        lte: range.end,
      },
      payment_status: "paid",
      status: {
        not: "cancelled",
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      table: true,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const totals = orders.reduce(
    (acc, order) => {
      acc.total_sales += Number(order.taxable_amount || 0);
      acc.total_cgst += Number(order.cgst_amount || 0);
      acc.total_sgst += Number(order.sgst_amount || 0);
      acc.total_orders += 1;
      return acc;
    },
    { total_sales: 0, total_cgst: 0, total_sgst: 0, total_orders: 0 }
  );

  return {
    start_date: startDate,
    end_date: endDate,
    total_sales: roundCurrency(totals.total_sales),
    total_cgst: roundCurrency(totals.total_cgst),
    total_sgst: roundCurrency(totals.total_sgst),
    total_orders: totals.total_orders,
    orders: orders.map(mapOrder),
  };
}

function summarizeRange(orders) {
  const paidOrders = orders.filter(order => order.payment_status === "paid");
  const sourceBreakdown = orders.reduce((acc, order) => {
    acc[order.source] = (acc[order.source] || 0) + 1;
    return acc;
  }, {});
  const categorySales = new Map();
  const productSales = new Map();
  const paymentBreakdown = new Map();

  for (const order of paidOrders) {
    for (const payment of order.payments || []) {
      paymentBreakdown.set(payment.method, (paymentBreakdown.get(payment.method) || 0) + Number(payment.amount || 0));
    }

    for (const item of order.items || []) {
      const itemRevenue = Number(item.price || 0) * item.quantity;
      const productKey = item.product?.name || item.product_id;
      const categoryKey = item.product?.category?.name || "Uncategorized";

      const productEntry = productSales.get(productKey) || { name: productKey, quantity: 0, sales: 0 };
      productEntry.quantity += item.quantity;
      productEntry.sales += itemRevenue;
      productSales.set(productKey, productEntry);

      const categoryEntry = categorySales.get(categoryKey) || { name: categoryKey, quantity: 0, sales: 0 };
      categoryEntry.quantity += item.quantity;
      categoryEntry.sales += itemRevenue;
      categorySales.set(categoryKey, categoryEntry);
    }
  }

  return {
    orderCount: orders.length,
    paidOrderCount: paidOrders.length,
    totalSales: paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
    averageOrderValue: paidOrders.length
      ? paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) / paidOrders.length
      : 0,
    sourceBreakdown,
    paymentBreakdown: Array.from(paymentBreakdown.entries()).map(([method, amount]) => ({ method, amount })),
    topProducts: Array.from(productSales.values()).sort((a, b) => b.sales - a.sales).slice(0, 5),
    categorySales: Array.from(categorySales.values()).sort((a, b) => b.sales - a.sales),
  };
}

async function buildAnalyticsContext() {
  const now = new Date();
  const [config, session, orders] = await Promise.all([
    prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } }),
    prisma.session.findFirst({ where: { is_active: true }, orderBy: { opened_at: "desc" } }),
    prisma.order.findMany({
      where: STAFF_VISIBLE_ORDERS,
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        payments: true,
        table: true,
      },
      orderBy: { created_at: "desc" },
      take: 250,
    }),
  ]);

  const lastDay = orders.filter(order => new Date(order.created_at) >= getBusinessDayStart(1));
  const lastWeek = orders.filter(order => new Date(order.created_at) >= getBusinessDayStart(7));
  const lastMonth = orders.filter(order => new Date(order.created_at) >= getBusinessDayStart(30));

  return {
    generatedAt: now.toISOString(),
    config: mapConfig(config),
    activeSession: await mapSessionWithSales(session),
    ranges: {
      day: summarizeRange(lastDay),
      week: summarizeRange(lastWeek),
      month: summarizeRange(lastMonth),
      overall: summarizeRange(orders),
    },
    latestOrders: orders.slice(0, 12).map((order) => ({
      id: order.id,
      created_at: toIso(order.created_at),
      total_amount: Number(order.total_amount || 0),
      source: order.source,
      status: order.status,
      kitchen_status: order.kitchen_status,
      payment_status: order.payment_status,
      table_number: order.table?.table_number || null,
      items: (order.items || []).map((item) => ({
        product: item.product?.name || item.product_id,
        category: item.product?.category?.name || "Uncategorized",
        quantity: item.quantity,
        price: Number(item.price || 0),
      })),
    })),
  };
}

async function requireAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const err = new Error("Missing access token");
    err.status = 401;
    throw err;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error("Invalid access token");
    err.status = 401;
    throw err;
  }

  return data.user;
}

// Throws 401 without a valid token, 403 when the user has none of `roles`.
async function authorizeRole(req, roles) {
  const user = await requireAuthenticatedUser(req);
  const roleRecord = await prisma.userRole.findFirst({
    where: { user_id: user.id, role: { in: roles } },
    select: { role: true },
  });

  if (!roleRecord) {
    const err = new Error("You do not have permission to do this");
    err.status = 403;
    throw err;
  }

  return { user, role: roleRecord.role };
}

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const { user, role } = await authorizeRole(req, roles);
      req.user = user;
      req.userRole = role;
      return next();
    } catch (err) {
      return sendServerError(res, err);
    }
  };
}

const requireAdmin = requireRole("admin");
const requireCashier = requireRole("admin", "cashier");
const requireStaff = requireRole("admin", "cashier", "kitchen");

app.get("/api/bootstrap", requireStaff, async (req, res) => {
  try {
    const [categories, products, floors, tables, session, orders, config] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.product.findMany({ orderBy: { name: 'asc' } }),
      prisma.floor.findMany({ orderBy: { name: 'asc' } }),
      prisma.table.findMany({ orderBy: { table_number: 'asc' } }),
      prisma.session.findFirst({ where: { is_active: true }, orderBy: { opened_at: 'desc' } }),
      prisma.order.findMany({
        where: { created_at: { gte: getBusinessDayStart(BOOTSTRAP_ORDER_DAYS) }, ...STAFF_VISIBLE_ORDERS },
        include: { items: { include: { product: true } } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.pOSConfig.findFirst({ orderBy: { created_at: 'desc' } }),
    ]);

    return res.json({
      categories: categories.map(mapCategory),
      products: products.map(mapProduct),
      floors: floors.map(mapFloor),
      tables: tables.map(mapTable),
      session: await mapSessionWithSales(session),
      orders: orders.map(mapOrder),
      config: mapConfig(config),
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/auth/role", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    const roleRecord = await prisma.userRole.findFirst({
      where: { user_id: user.id },
      select: { role: true },
    });

    return res.json({ role: roleRecord?.role || null });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/health", (_req, res) => {
  return res.json({
    ok: true,
    service: "pos-cafe-api",
    time: new Date().toISOString(),
  });
});

app.get("/api/public/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [order, config] = await Promise.all([
      prisma.order.findUnique({
        where: { id },
        include: { items: { include: { product: true } }, table: true },
      }),
      prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } }),
    ]);

    if (!order) return sendError(res, 404, "Order not found");

    return res.json({
      order: mapPublicOrder(order),
      table: mapPublicTable(order.table),
      config: mapConfig(config) || { restaurant_name: "POS Cafe", gstin: "", currency: "Rs ", tax_rate: 0 },
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

// Public: everything a customer page needs for one table's QR menu.
app.get("/api/public/menu/:qrToken", async (req, res) => {
  try {
    const { qrToken } = req.params;

    const table = await prisma.table.findFirst({
      where: { qr_token: qrToken, active: true },
    });
    if (!table) return sendError(res, 404, "Table not found");

    const [categories, products, config] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } }),
    ]);

    return res.json({
      table: mapPublicTable(table),
      categories: categories.map(mapCategory),
      products: products.map(mapProduct),
      config: mapConfig(config) || { restaurant_name: "POS Cafe", gstin: "", currency: "Rs ", tax_rate: 0 },
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/reports/chat", chatLimiter, requireAdmin, async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || typeof question !== "string" || !question.trim()) {
      return sendError(res, 400, "question is required");
    }
    if (question.length > MAX_CHAT_QUESTION_LENGTH) {
      return sendError(res, 400, `Please keep the question under ${MAX_CHAT_QUESTION_LENGTH} characters`);
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return sendError(res, 400, "Missing GROQ_API_KEY in server environment");
    }

    const analyticsContext = await buildAnalyticsContext();
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a POS analytics assistant for a cafe. Use only the provided database context. Answer clearly and concisely. If the data is insufficient, say that directly. Mention actual figures where possible and do not invent missing metrics.",
          },
          {
            role: "user",
            content: `Database context:\n${JSON.stringify(analyticsContext, null, 2)}\n\nQuestion: ${question.trim()}`,
          },
        ],
      }),
    }).catch((err) => {
      if (err?.name === "TimeoutError") {
        const timeoutErr = new Error("The AI assistant took too long to answer. Please try again.");
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    });

    const payload = await groqResponse.json().catch(() => null);
    if (!groqResponse.ok) {
      // Groq's own 401/429 would look like the user's session failing, so report
      // every upstream failure as a bad gateway.
      return sendError(res, 502, payload?.error?.message || "Groq request failed");
    }

    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return sendError(res, 500, "Empty response from Groq");
    }

    return res.json({ answer });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/reports/gst", requireAdmin, async (req, res) => {
  try {
    const startDate = typeof req.query.start_date === "string" ? req.query.start_date : "";
    const endDate = typeof req.query.end_date === "string" ? req.query.end_date : "";
    const report = await fetchGstReportData(startDate, endDate);
    return res.json(report);
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/reports/gst/export", requireAdmin, async (req, res) => {
  try {
    const startDate = typeof req.query.start_date === "string" ? req.query.start_date : "";
    const endDate = typeof req.query.end_date === "string" ? req.query.end_date : "";
    const [report, config] = await Promise.all([
      fetchGstReportData(startDate, endDate),
      prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } }),
    ]);

    const workbook = buildGstReportWorkbook({
      config: mapConfig(config) || { restaurant_name: "POS Cafe", gstin: "" },
      summary: report,
      orders: report.orders,
      startDate,
      endDate,
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="gst-report-${startDate}-to-${endDate}.xlsx"`);
    return res.send(workbook);
  } catch (err) {
    return sendServerError(res, err);
  }
});

// One-time bootstrap for the first admin. Disabled unless ADMIN_SETUP_SECRET is
// set; unset it again once the admin exists.
app.post("/api/setup-admin", async (req, res) => {
  try {
    const setupSecret = process.env.ADMIN_SETUP_SECRET;
    if (!setupSecret) {
      return sendError(res, 404, "Admin setup is disabled");
    }

    const { email, password, full_name, setup_secret } = req.body || {};
    if (!safeEqual(setup_secret || "", setupSecret)) {
      return sendError(res, 403, "Invalid setup secret");
    }
    if (!email || !password || !full_name) {
      return sendError(res, 400, "email, password, and full_name are required");
    }

    await prisma.$transaction(async (tx) => {
      // Serialises setup attempts so two concurrent requests can't both pass the
      // "no admin yet" check. The lock is released when the transaction ends.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727073)`;

      const existingAdmin = await tx.userRole.findFirst({ where: { role: "admin" } });
      if (existingAdmin) {
        const err = new Error("Admin already exists");
        err.status = 400;
        throw err;
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (error || !data?.user) {
        const err = new Error(error?.message || "Failed to create admin user");
        err.status = 400;
        throw err;
      }

      try {
        await tx.userRole.create({
          data: { user_id: data.user.id, role: "admin" },
        });

        await tx.profile.upsert({
          where: { user_id: data.user.id },
          update: { full_name, email },
          create: { user_id: data.user.id, full_name, email },
        });
      } catch (dbErr) {
        await supabaseAdmin.auth.admin.deleteUser(data.user.id);
        throw dbErr;
      }
    }, { timeout: 15000 });

    return res.json({ ok: true });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/manage-staff", requireAdmin, async (req, res) => {
  try {
    const { action } = req.body || {};

    if (action === "list_staff") {
      const staff = await prisma.$queryRaw`
        SELECT p.user_id, p.full_name, p.email, r.role
        FROM public.profiles p
        JOIN public.user_roles r ON r.user_id = p.user_id
        ORDER BY p.full_name ASC;
      `;
      return res.json(staff);
    }

    if (action === "create_user") {
      const { email, password, full_name, role } = req.body || {};
      if (!email || !password || !full_name || !validRoles.has(role)) {
        return sendError(res, 400, "Invalid or missing user fields");
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (error || !data?.user) {
        return sendError(res, 400, error?.message || "Failed to create user");
      }

      await prisma.userRole.create({
        data: { user_id: data.user.id, role },
      });

      await prisma.profile.upsert({
        where: { user_id: data.user.id },
        update: { full_name, email },
        create: { user_id: data.user.id, full_name, email },
      });

      return res.json({ ok: true });
    }

    if (action === "delete_user") {
      const { user_id } = req.body || {};
      if (!user_id) {
        return sendError(res, 400, "user_id is required");
      }

      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { user_id } });
        await tx.profile.deleteMany({ where: { user_id } });
      });

      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error && !error.message?.toLowerCase().includes("user not found")) {
        return sendError(res, 400, error.message || "Failed to delete user");
      }

      return res.json({ ok: true });
    }

    return sendError(res, 400, "Unsupported action");
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    return res.json(products.map(mapProduct));
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/products", requireAdmin, async (req, res) => {
  try {
    const { name, category_id, price, active = true, description, image } = req.body || {};
    if (!name || price === undefined) {
      return sendError(res, 400, "name and price are required");
    }
    const product = await prisma.product.create({
      data: { name, category_id, price, active, description, image },
    });
    return res.json({ product: mapProduct(product) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/products/import", requireAdmin, async (req, res) => {
  try {
    const incomingProducts = Array.isArray(req.body?.products) ? req.body.products : null;
    if (!incomingProducts || incomingProducts.length === 0) {
      return sendError(res, 400, "products array is required");
    }

    const parsedProducts = [];
    for (let i = 0; i < incomingProducts.length; i += 1) {
      const row = incomingProducts[i] || {};
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const category = typeof row.category === "string" ? row.category.trim() : "";
      const price = Number(row.price);

      if (!name || !category || !Number.isFinite(price) || price < 0) {
        return sendError(res, 400, `Invalid product data at row ${i + 1}`);
      }

      parsedProducts.push({ name, category, price });
    }

    const existingCategories = await prisma.category.findMany();
    const categoryLookup = new Map(
      existingCategories.map((category) => [category.name.trim().toLowerCase(), category])
    );

    let createdCategories = 0;
    for (const item of parsedProducts) {
      const categoryKey = item.category.toLowerCase();
      if (!categoryLookup.has(categoryKey)) {
        const createdCategory = await prisma.category.create({
          data: { name: item.category },
        });
        categoryLookup.set(categoryKey, createdCategory);
        createdCategories += 1;
      }
    }

    await prisma.product.createMany({
      data: parsedProducts.map((item) => ({
        name: item.name,
        category_id: categoryLookup.get(item.category.toLowerCase())?.id || null,
        price: item.price,
        active: true,
      })),
    });

    return res.json({
      imported_count: parsedProducts.length,
      created_categories: createdCategories,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.put("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id, price, active, description, image } = req.body || {};
    const product = await prisma.product.update({
      where: { id },
      data: { name, category_id, price, active, description, image },
    });
    return res.json({ product: mapProduct(product) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/tables", requireCashier, async (req, res) => {
  try {
    const tables = await prisma.table.findMany({ orderBy: { table_number: 'asc' } });
    return res.json(tables.map(mapTable));
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/floors", async (req, res) => {
  try {
    const floors = await prisma.floor.findMany({ orderBy: { name: "asc" } });
    return res.json(floors.map(mapFloor));
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/floors", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) {
      return sendError(res, 400, "name is required");
    }
    const floor = await prisma.floor.create({ data: { name } });
    return res.json({ floor: mapFloor(floor) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.put("/api/floors/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    const floor = await prisma.floor.update({
      where: { id },
      data: { name },
    });
    return res.json({ floor: mapFloor(floor) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.delete("/api/floors/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tableCount = await prisma.table.count({ where: { floor_id: id } });
    if (tableCount > 0) {
      return sendError(res, 400, "Cannot delete floor with existing tables");
    }
    await prisma.floor.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/tables", requireAdmin, async (req, res) => {
  try {
    const { floor_id, table_number, seats, qr_token, active = true, status = "available" } = req.body || {};
    if (!floor_id || !table_number || !seats) {
      return sendError(res, 400, "floor_id, table_number, and seats are required");
    }
    if (!TABLE_STATUSES.includes(status)) {
      return sendError(res, 400, "Invalid table status");
    }
    const table = await prisma.table.create({
      data: {
        floor_id,
        table_number,
        seats,
        // Unguessable by default; printed QR codes are only as private as this token.
        qr_token: typeof qr_token === "string" && qr_token.trim() ? qr_token.trim() : crypto.randomUUID(),
        active,
        status,
      },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.put("/api/tables/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { floor_id, table_number, seats, qr_token, active, status } = req.body || {};
    if (qr_token !== undefined && (typeof qr_token !== "string" || !qr_token.trim())) {
      return sendError(res, 400, "qr_token cannot be empty");
    }
    if (status !== undefined && !TABLE_STATUSES.includes(status)) {
      return sendError(res, 400, "Invalid table status");
    }
    const table = await prisma.table.update({
      where: { id },
      data: { floor_id, table_number, seats, qr_token, active, status },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.delete("/api/tables/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.table.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.patch("/api/tables/:id/status", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!TABLE_STATUSES.includes(status)) {
      return sendError(res, 400, "Invalid table status");
    }
    const table = await prisma.table.update({
      where: { id },
      data: { status },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/tables/:id/release", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const table = await prisma.table.update({
      where: { id },
      data: { status: "available", customer_session_token: null, customer_session_started_at: null },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

// ── Customer session toggle ────────────────────────────────────────────────
// Unlock: generates a fresh session token so customers can order via QR
app.post("/api/tables/:id/open-customer-session", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const token = crypto.randomUUID();
    const table = await prisma.table.update({
      where: { id },
      data: { customer_session_token: token, customer_session_started_at: new Date() },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

// Lock: clears the session token so QR ordering is blocked
app.post("/api/tables/:id/close-customer-session", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const table = await prisma.table.update({
      where: { id },
      data: { customer_session_token: null, customer_session_started_at: null },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

// Public: customer app calls this to check if QR ordering is currently allowed
app.get("/api/customer/validate-session", async (req, res) => {
  try {
    const qrToken = typeof req.query.qr_token === "string" ? req.query.qr_token : null;
    if (!qrToken) return sendError(res, 400, "qr_token is required");

    const table = await prisma.table.findFirst({
      where: { qr_token: qrToken, active: true },
    });
    if (!table) return sendError(res, 404, "Table not found");

    if (!table.customer_session_token) {
      return res.json({ valid: false, reason: "Table is locked for ordering" });
    }
    // Handing the session token to whoever holds the QR is the point of unlocking
    // the table; it is the only unauthenticated response that carries it.
    return res.json({ valid: true, table: mapPublicTable(table), customer_session_token: table.customer_session_token });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/customer/release-table", async (req, res) => {
  try {
    const { tableToken, table_token, customer_session_token } = req.body || {};
    const qrToken = tableToken || table_token;
    if (!qrToken) return sendError(res, 400, "tableToken is required");

    const table = await prisma.table.findFirst({ where: { qr_token: String(qrToken), active: true } });
    if (!table) return sendError(res, 404, "Table not found");

    if (!customer_session_token || table.customer_session_token !== String(customer_session_token)) {
      return sendError(res, 403, "Invalid or expired session token.");
    }

    const updated = await prisma.table.update({
      where: { id: table.id },
      data: { status: "available", customer_session_token: null, customer_session_started_at: null },
    });

    return res.json({ ok: true, table: mapPublicTable(updated) });
  } catch (err) {
    return sendServerError(res, err);
  }
});
// ──────────────────────────────────────────────────────────────────────────

app.get("/api/config", async (req, res) => {
  try {
    const config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });
    return res.json({ config: mapConfig(config) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.put("/api/config", requireAdmin, async (req, res) => {
  try {
    const { restaurant_name, gstin, upi_id, currency, tax_rate } = req.body || {};
    let config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });

    if (!config) {
      config = await prisma.pOSConfig.create({
        data: {
          restaurant_name: restaurant_name || "POS Cafe",
          gstin: gstin || null,
          upi_id: upi_id || null,
          currency: currency || "Rs ",
          tax_rate: tax_rate ?? 0,
        },
      });
    } else {
      config = await prisma.pOSConfig.update({
        where: { id: config.id },
        data: {
          restaurant_name: restaurant_name ?? config.restaurant_name,
          gstin: gstin ?? config.gstin,
          upi_id: upi_id ?? config.upi_id,
          currency: currency ?? config.currency,
          tax_rate: tax_rate ?? config.tax_rate,
        },
      });
    }

    return res.json({ config: mapConfig(config) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/orders", requireStaff, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: STAFF_VISIBLE_ORDERS,
      include: { items: { include: { product: true } } },
      orderBy: { created_at: 'desc' },
    });
    return res.json(orders.map(mapOrder));
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/customer/order-status/:tableToken", async (req, res) => {
  try {
    const { tableToken } = req.params;
    const orderId = typeof req.query.order_id === "string" ? req.query.order_id : null;

    const table = await prisma.table.findFirst({
      where: { qr_token: tableToken, active: true },
    });

    if (!table) {
      return sendError(res, 404, "Table not found");
    }

    // Only the phone that placed the order knows its id, so requiring it keeps one
    // diner from seeing another's order through the shared table QR. There is
    // deliberately no "latest order at this table" fallback.
    let order = null;
    if (orderId && UUID_PATTERN.test(orderId)) {
      order = await prisma.order.findFirst({
        where: {
          id: orderId,
          table_id: table.id,
          source: "customer",
        },
        include: { items: { include: { product: true } } },
      });
    }

    return res.json({
      table: mapPublicTable(table),
      order: order ? mapPublicOrder(order) : null,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.put("/api/orders/:id", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, kitchen_status, payment_status, customer_name, customer_email } = req.body || {};
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return sendError(res, 404, "Order not found");
    }

    if (status !== undefined && !ORDER_STATUSES.includes(status)) {
      return sendError(res, 400, "Invalid order status");
    }
    if (kitchen_status !== undefined && !KITCHEN_STATUSES.includes(kitchen_status)) {
      return sendError(res, 400, "Invalid kitchen status");
    }
    if (payment_status !== undefined && !PAYMENT_STATUSES.includes(payment_status)) {
      return sendError(res, 400, "Invalid payment status");
    }
    if (customer_name !== undefined && !String(customer_name).trim()) {
      return sendError(res, 400, "customer_name is required");
    }
    if (customer_email !== undefined && !isValidEmail(String(customer_email))) {
      return sendError(res, 400, "Valid customer_email is required");
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status, kitchen_status, payment_status, customer_name, customer_email },
      include: { items: { include: { product: true } } },
    });

    const shouldSendInvoiceEmail = existingOrder.payment_status !== "paid" && order.payment_status === "paid";
    if (shouldSendInvoiceEmail) {
      try {
        await sendInvoiceEmailForOrder(order.id);
      } catch (emailErr) {
        console.error(`Invoice email send failed for order ${order.id}:`, emailErr?.message || emailErr);
      }
    }

    return res.json({ order: mapOrder(order) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.delete("/api/orders/:id", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return sendError(res, 404, "Order not found");
    }

    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { order_id: id } }),
      prisma.orderItem.deleteMany({ where: { order_id: id } }),
      prisma.order.delete({ where: { id } }),
      prisma.session.update({
        where: { id: existingOrder.session_id },
        data: { orders_count: { decrement: 1 } },
      }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/orders", orderLimiter, async (req, res) => {
  try {
    const {
      table_id,
      items,
      source,
      customer_name,
      customer_email,
      customer_phone,
      discount,
      payment_status,
      payment_method,
      customer_session_token,
    } = req.body || {};

    if (!table_id || !Array.isArray(items) || items.length === 0 || !source) {
      return sendError(res, 400, "table_id, items, and source are required");
    }

    if (source !== "customer" && source !== "pos") {
      return sendError(res, 400, "source must be customer or pos");
    }

    if (source === "pos") {
      await authorizeRole(req, ["admin", "cashier"]);
    }

    for (const item of items) {
      if (typeof item?.product_id !== "string" || !UUID_PATTERN.test(item.product_id)) {
        return sendError(res, 400, "Invalid product in order");
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY) {
        return sendError(res, 400, `Item quantity must be a whole number between 1 and ${MAX_ITEM_QUANTITY}`);
      }
    }

    // QR customers always start unpaid with no discount; only Razorpay can mark
    // their order paid. Staff may set both.
    let resolvedPaymentStatus = "unpaid";
    let resolvedDiscount = 0;
    let resolvedPaymentMethod = "upi";
    if (source === "pos") {
      if (payment_status !== undefined && !PAYMENT_STATUSES.includes(payment_status)) {
        return sendError(res, 400, "payment_status must be paid or unpaid");
      }
      if (payment_method !== undefined && !["cash", "digital", "upi"].includes(payment_method)) {
        return sendError(res, 400, "Invalid payment_method");
      }
      resolvedPaymentStatus = payment_status || "unpaid";
      resolvedDiscount = discount; // calculateOrderTotals clamps it to [0, subtotal]
      resolvedPaymentMethod = payment_method || "cash";
    }

    if (!customer_name || !String(customer_name).trim()) {
      return sendError(res, 400, "customer_name is required");
    }
    if (!isValidEmail(customer_email)) {
      return sendError(res, 400, "Valid customer_email is required");
    }

    // Validate customer session token for QR orders
    let customerTable = null;
    if (source === "customer") {
      customerTable = await prisma.table.findUnique({ where: { id: table_id } });
      if (!customerTable?.customer_session_token) {
        return sendError(res, 403, "Table ordering session is not active. Please ask a staff member to unlock your table.");
      }
      if (customerTable.customer_session_token !== customer_session_token) {
        return sendError(res, 403, "Invalid or expired session token.");
      }
    }

    const session = await prisma.session.findFirst({ where: { is_active: true } });
    const sessionId = session?.id || (await prisma.session.create({ data: { is_active: true } })).id;
    const config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });

    const productIds = items.map(item => item.product_id);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) {
        return sendError(res, 400, "Invalid product in order");
      }
      if (!product.active) {
        return sendError(res, 400, `${product.name} is not available right now`);
      }
    }

    const totals = calculateOrderTotals({
      items,
      productMap,
      discount: resolvedDiscount,
      gstRate: Number(config?.tax_rate || 0),
    });
    const invoiceNumber = await createUniqueInvoiceNumber();

    const order = await prisma.order.create({
      data: {
        invoice_number: invoiceNumber,
        table_id,
        session_id: sessionId,
        source,
        status: source === "customer" ? "pending_confirmation" : "confirmed",
        kitchen_status: "to_cook",
        payment_status: resolvedPaymentStatus,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxable_amount: totals.taxableAmount,
        cgst_rate: totals.cgstRate,
        sgst_rate: totals.sgstRate,
        cgst_amount: totals.cgstAmount,
        sgst_amount: totals.sgstAmount,
        total_amount: totals.totalAmount,
        customer_name: customer_name || null,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        items: {
          create: items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: Number(productMap.get(item.product_id).price),
            notes: item.notes || null,
          })),
        },
        payments: resolvedPaymentStatus === "paid"
          ? {
            create: {
              method: resolvedPaymentMethod,
              amount: totals.totalAmount,
              status: "completed",
            },
          }
          : undefined,
      },
      include: { items: { include: { product: true } } },
    });

    // A QR order isn't real until it's paid, so the table only changes when payment
    // completes (see completePaymentForOrder). Staff orders occupy the table now.
    const table = source === "pos"
      ? await prisma.table.update({ where: { id: table_id }, data: { status: "occupied" } })
      : customerTable;

    // QR orders are counted when their payment completes, like the table change.
    const updatedSession = source === "pos"
      ? await prisma.session.update({ where: { id: sessionId }, data: { orders_count: { increment: 1 } } })
      : null;

    if (resolvedPaymentStatus === "paid") {
      try {
        await sendInvoiceEmailForOrder(order.id);
      } catch (emailErr) {
        console.error(`Invoice email send failed for order ${order.id}:`, emailErr?.message || emailErr);
      }
    }

    return res.json({
      order: mapOrder(order),
      table: source === "pos" ? mapTable(table) : mapPublicTable(table),
      session: source === "pos" ? await mapSessionWithSales(updatedSession) : null,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/payments/razorpay/order", paymentLimiter, async (req, res) => {
  try {
    const { orderId, order_id, customer_session_token, payment_method } = req.body || {};
    const id = orderId || order_id;
    if (!id) return sendError(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return sendError(res, 404, "Order not found");
    if (!["customer", "pos"].includes(String(order.source))) return sendError(res, 403, "Unsupported order source");
    if (order.status === "cancelled") return sendError(res, 400, "Order is cancelled");

    if (order.source === "customer") {
      await requireValidCustomerSessionForTableId(order.table_id, customer_session_token);
    }

    if (order.payment_status === "paid") {
      return sendError(res, 400, "Order is already paid");
    }

    const method = payment_method || "digital";
    if (!["upi", "digital"].includes(String(method))) {
      return sendError(res, 400, "Invalid payment_method");
    }

    const amountPaise = toPaise(order.total_amount);
    if (!amountPaise || amountPaise < 100) {
      return sendError(res, 400, "Invalid order amount");
    }

    // Row-lock the order so concurrent clicks on Pay queue up here: the first one
    // creates the Razorpay order and the rest reuse it.
    const razorpayOrderId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;

      const existingPayment = await tx.payment.findFirst({
        where: {
          order_id: order.id,
          provider: "razorpay",
          status: "pending",
        },
        orderBy: { created_at: "desc" },
      });

      if (
        existingPayment?.provider_order_id &&
        String(existingPayment.method) === String(method) &&
        toPaise(existingPayment.amount) === amountPaise
      ) {
        return existingPayment.provider_order_id;
      }

      // A different method means the customer closed the earlier checkout and
      // switched (e.g. UPI to card). Retire that attempt so it can't block this one.
      // If the old one does get paid after all, /verify and the webhook still find it.
      if (existingPayment) {
        await tx.payment.updateMany({
          where: { order_id: order.id, provider: "razorpay", status: "pending" },
          data: { status: "failed" },
        });
      }

      if (order.source === "pos" && isPosOrderQrPaymentExpired(order)) {
        const err = new Error(
          `Payment session expired (>${getPosQrPaymentTtlMinutes()} minutes). Please ask staff to recreate the order.`
        );
        err.status = 400;
        throw err;
      }

      const razorpayOrder = await razorpayRequestJson({
        method: "POST",
        path: "/v1/orders",
        body: {
          amount: amountPaise,
          currency: "INR",
          receipt: order.invoice_number,
          notes: {
            order_id: order.id,
            table_id: order.table_id,
            source: order.source,
          },
        },
      });

      await tx.payment.create({
        data: {
          order_id: order.id,
          method,
          amount: Number(order.total_amount || 0),
          status: "pending",
          provider: "razorpay",
          provider_order_id: razorpayOrder?.id || null,
        },
      });

      return razorpayOrder?.id;
    }, { timeout: 20000 });

    const config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });
    const { keyId } = getRazorpayKeys();

    return res.json({
      keyId,
      razorpayOrderId,
      amountPaise,
      currency: "INR",
      name: config?.restaurant_name || "POS Cafe",
    });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/payments/razorpay/verify", async (req, res) => {
  try {
    const {
      orderId,
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    const id = orderId || order_id;
    if (!id) return sendError(res, 400, "orderId is required");
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return sendError(res, 400, "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required");
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return sendError(res, 404, "Order not found");
    if (!["customer", "pos"].includes(String(order.source))) return sendError(res, 403, "Unsupported order source");
    if (order.status === "cancelled") return sendError(res, 400, "Order is cancelled");

    // No customer session check here: staff may lock or release the table while the
    // customer is in checkout, and the signature below already proves the payment.
    const payment = await prisma.payment.findFirst({
      where: {
        order_id: order.id,
        provider: "razorpay",
        provider_order_id: String(razorpay_order_id),
      },
      orderBy: { created_at: "desc" },
    });

    if (!payment) {
      return sendError(res, 400, "No pending Razorpay payment found for this order");
    }

    const { keySecret } = getRazorpayKeys();
    const signatureOk = isValidRazorpayPaymentSignature({
      keySecret,
      razorpayOrderId: String(razorpay_order_id),
      razorpayPaymentId: String(razorpay_payment_id),
      signature: String(razorpay_signature),
    });
    if (!signatureOk) {
      return sendError(res, 400, "Invalid payment signature");
    }

    const { updatedOrder } = await completePaymentForOrder({
      order,
      payment,
      providerPaymentId: razorpay_payment_id,
      providerSignature: razorpay_signature,
    });

    return res.json({ ok: true, order: mapPublicOrder(updatedOrder) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/webhooks/razorpay", async (req, res) => {
  try {
    const signatureHeader = req.headers["x-razorpay-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      return sendError(res, 500, "Missing RAZORPAY_WEBHOOK_SECRET");
    }
    if (!signature) {
      return sendError(res, 400, "Missing x-razorpay-signature header");
    }

    if (!isValidRazorpayWebhookSignature({ secret, rawBody: req.rawBody, signature: String(signature) })) {
      return sendError(res, 400, "Invalid webhook signature");
    }

    const payload = req.body || {};
    const event = payload?.event ? String(payload.event) : "";
    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;

    const providerOrderId = paymentEntity?.order_id || orderEntity?.id || null;
    const providerPaymentId = paymentEntity?.id || null;
    const providerPaymentStatus = paymentEntity?.status ? String(paymentEntity.status).toLowerCase() : "";

    const isSuccessfulPayment =
      event === "payment.captured" ||
      event === "order.paid" ||
      providerPaymentStatus === "captured";

    if (!providerOrderId) {
      return res.json({ ok: true, ignored: true });
    }

    if (!isSuccessfulPayment) {
      return res.json({ ok: true, ignored: true });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        provider: "razorpay",
        provider_order_id: String(providerOrderId),
      },
      orderBy: { created_at: "desc" },
    });

    if (!payment) {
      return res.json({ ok: true, ignored: true });
    }

    if (payment.status === "completed") {
      return res.json({ ok: true });
    }

    const order = await prisma.order.findUnique({ where: { id: payment.order_id } });
    if (!order || order.status === "cancelled") {
      return res.json({ ok: true, ignored: true });
    }

    await completePaymentForOrder({
      order,
      payment,
      providerPaymentId,
      providerSignature: null,
    });

    return res.json({ ok: true });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.get("/api/orders/:id/invoice", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const [order, config] = await Promise.all([
      prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          table: true,
        },
      }),
      prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } }),
    ]);

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    const pdfBuffer = buildInvoicePdf({
      config: mapConfig(config) || { restaurant_name: "POS Cafe", gstin: "", currency: "Rs " },
      order: mapOrder(order),
      table: mapTable(order.table),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${order.invoice_number}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.patch("/api/orders/:id/confirm", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return sendError(res, 404, "Order not found");
    }
    if (existingOrder.source === "customer" && existingOrder.payment_status !== "paid") {
      return sendError(res, 400, "This order hasn't been paid yet");
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status: "confirmed" },
      include: { items: { include: { product: true } } },
    });

    const table = await prisma.table.update({
      where: { id: order.table_id },
      data: { status: "occupied" },
    });

    return res.json({ order: mapOrder(order), table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.patch("/api/orders/:id/reject", requireCashier, async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return sendError(res, 404, "Order not found");
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status: "cancelled" },
      include: { items: { include: { product: true } } },
    });

    // Free the table only if this was its first, still-unconfirmed order. Rejecting a
    // second round must not mark a table with seated guests as available.
    let table = await prisma.table.findUnique({ where: { id: order.table_id } });
    if (table.status === "pending_confirmation") {
      const otherPending = await prisma.order.count({
        where: { table_id: table.id, status: "pending_confirmation", id: { not: id } },
      });
      if (otherPending === 0) {
        table = await prisma.table.update({
          where: { id: table.id },
          data: { status: "available" },
        });
      }
    }

    return res.json({ order: mapOrder(order), table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.patch("/api/orders/:id/kitchen-status", requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!KITCHEN_STATUSES.includes(status)) {
      return sendError(res, 400, "Invalid kitchen status");
    }

    const order = await prisma.order.update({
      where: { id },
      data: { kitchen_status: status },
      include: { items: { include: { product: true } } },
    });

    let table = await prisma.table.findUnique({ where: { id: order.table_id } });

    if (status === "completed") {
      // Table release is handled explicitly by customer/staff actions.
      // Keeping this endpoint idempotent and not auto-flipping table status avoids
      // releasing a table while guests are still seated.
    }

    return res.json({ order: mapOrder(order), table: mapTable(table) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/sessions/open", requireCashier, async (req, res) => {
  try {
    let session = await prisma.session.findFirst({ where: { is_active: true } });
    if (!session) {
      session = await prisma.session.create({ data: { is_active: true, total_sales: 0, orders_count: 0 } });
    }
    return res.json({ session: await mapSessionWithSales(session) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

app.post("/api/sessions/close", requireCashier, async (req, res) => {
  try {
    const { session_id } = req.body || {};
    const session = await prisma.session.update({
      where: { id: session_id },
      data: { is_active: false, closed_at: new Date() },
    });
    return res.json({ session: await mapSessionWithSales(session) });
  } catch (err) {
    return sendServerError(res, err);
  }
});

export { app };
