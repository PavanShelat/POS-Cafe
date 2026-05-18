import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import https from "node:https";
import { prisma } from "./prisma.js";
import { buildInvoicePdf } from "./pdf.js";
import { buildInvoiceNumber, calculateOrderTotals, roundCurrency } from "./tax.js";
import { buildGstReportWorkbook } from "./xlsx.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

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

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toIso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function mapCategory(category) {
  return {
    id: category.id,
    name: category.name,
    icon: category.icon ?? undefined,
  };
}

function mapProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category_id,
    price: toNumber(product.price) || 0,
    active: product.active,
    image: product.image ?? undefined,
    description: product.description ?? undefined,
  };
}

function mapFloor(floor) {
  return {
    id: floor.id,
    name: floor.name,
  };
}

function mapTable(table) {
  return {
    id: table.id,
    floor_id: table.floor_id,
    table_number: table.table_number,
    seats: table.seats,
    qr_token: table.qr_token,
    active: table.active,
    status: table.status,
    customer_session_token: table.customer_session_token ?? null,
  };
}

function mapSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    opened_at: toIso(session.opened_at),
    closed_at: session.closed_at ? toIso(session.closed_at) : null,
    total_sales: toNumber(session.total_sales) || 0,
    orders_count: session.orders_count,
    is_active: session.is_active,
  };
}

function mapOrderItem(item) {
  return {
    id: item.id,
    order_id: item.order_id,
    product_id: item.product_id,
    product: item.product ? mapProduct(item.product) : undefined,
    quantity: item.quantity,
    price: toNumber(item.price) || 0,
    notes: item.notes ?? undefined,
  };
}

function mapOrder(order) {
  return {
    id: order.id,
    invoice_number: order.invoice_number,
    table_id: order.table_id,
    session_id: order.session_id,
    source: order.source,
    status: order.status,
    kitchen_status: order.kitchen_status,
    payment_status: order.payment_status,
    subtotal: toNumber(order.subtotal) || 0,
    discount: toNumber(order.discount) || 0,
    taxable_amount: toNumber(order.taxable_amount) || 0,
    cgst_rate: toNumber(order.cgst_rate) || 0,
    sgst_rate: toNumber(order.sgst_rate) || 0,
    cgst_amount: toNumber(order.cgst_amount) || 0,
    sgst_amount: toNumber(order.sgst_amount) || 0,
    total_amount: toNumber(order.total_amount) || 0,
    items: (order.items || []).map(mapOrderItem),
    created_at: toIso(order.created_at),
    customer_name: order.customer_name ?? undefined,
    customer_email: order.customer_email ?? undefined,
    customer_phone: order.customer_phone ?? undefined,
  };
}

function mapConfig(config) {
  if (!config) return null;
  return {
    restaurant_name: config.restaurant_name,
    gstin: config.gstin ?? undefined,
    upi_id: config.upi_id ?? undefined,
    currency: config.currency,
    tax_rate: toNumber(config.tax_rate) || 0,
  };
}

function isValidEmail(value) {
  if (!value || typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getRazorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const err = new Error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
    err.status = 500;
    throw err;
  }
  return { keyId, keySecret };
}

function toPaise(amount) {
  const value = Number(amount || 0);
  return Math.round(value * 100);
}

function razorpayRequestJson({ method, path, body }) {
  const { keyId, keySecret } = getRazorpayKeys();
  const payload = body ? JSON.stringify(body) : "";
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.razorpay.com",
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Basic ${auth}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const status = Number(res.statusCode || 0);
          const parsed = data ? safeJsonParse(data) : null;
          if (status >= 200 && status < 300) return resolve(parsed);
          const message =
            status === 401
              ? "Razorpay authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
              : parsed?.error?.description || parsed?.error?.message || `Razorpay request failed (${status})`;
          const err = new Error(message);
          err.status = status || 502;
          return reject(err);
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function getTableAutoReleaseHours() {
  const raw = process.env.TABLE_AUTO_RELEASE_HOURS;
  const value = raw ? Number(raw) : 24;
  if (!Number.isFinite(value) || value <= 0) return 24;
  return value;
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
  const wasPaid = order.payment_status === "paid";

  const [updatedOrder] = await prisma.$transaction(async (tx) => {
    const newOrder = wasPaid
      ? order
      : await tx.order.update({
        where: { id: order.id },
        data: { payment_status: "paid" },
      });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "completed",
        provider_payment_id: providerPaymentId ? String(providerPaymentId) : payment.provider_payment_id,
        provider_signature: providerSignature ? String(providerSignature) : payment.provider_signature,
      },
    });

    if (!wasPaid) {
      await tx.session.update({
        where: { id: order.session_id },
        data: { total_sales: { increment: Number(order.total_amount || 0) } },
      });
    }

    return [newOrder];
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

function buildInvoiceEmailHtml({ restaurantName, customerName, invoiceNumber, totalAmount, currency }) {
  const amount = `${currency || "Rs "}${Number(totalAmount || 0).toFixed(2)}`;
  return `
  <div style="font-family: Arial, sans-serif; background:#f7f8fa; padding:24px; color:#111827;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
      <div style="background:#0f172a; color:#ffffff; padding:20px 24px;">
        <h1 style="margin:0; font-size:20px;">${restaurantName || "POS Cafe"}</h1>
        <p style="margin:6px 0 0; font-size:13px; opacity:0.9;">Payment Confirmation & Tax Invoice</p>
      </div>
      <div style="padding:24px;">
        <p style="margin-top:0;">Hi ${customerName || "Customer"},</p>
        <p>Thank you for your order. We have received your payment successfully.</p>
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:14px; margin:16px 0;">
          <p style="margin:0 0 6px;"><strong>Invoice:</strong> ${invoiceNumber}</p>
          <p style="margin:0;"><strong>Paid Amount:</strong> ${amount}</p>
        </div>
        <p>Your invoice PDF is attached to this email.</p>
        <p style="margin-bottom:0;">Regards,<br/>${restaurantName || "POS Cafe"} Team</p>
      </div>
    </div>
  </div>`;
}

async function sendInvoiceEmailForOrder(orderId) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
  const smtpFromName = process.env.SMTP_FROM_NAME || "POS Cafe";

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFromEmail) {
    console.warn("Invoice email skipped: SMTP env vars are not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM_EMAIL).");
    return { sent: false, reason: "email_not_configured" };
  }

  const [order, config] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
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

  if (!order || order.payment_status !== "paid" || !isValidEmail(order.customer_email)) {
    return { sent: false, reason: "order_not_eligible" };
  }

  const mappedOrder = mapOrder(order);
  const mappedConfig = mapConfig(config) || { restaurant_name: "POS Cafe", gstin: "", currency: "Rs " };
  const mappedTable = mapTable(order.table);
  const pdfBuffer = buildInvoicePdf({
    config: mappedConfig,
    order: mappedOrder,
    table: mappedTable,
  });

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: `${smtpFromName} <${smtpFromEmail}>`,
    to: order.customer_email,
    subject: `Invoice ${order.invoice_number} from ${mappedConfig.restaurant_name || "POS Cafe"}`,
    html: buildInvoiceEmailHtml({
      restaurantName: mappedConfig.restaurant_name,
      customerName: order.customer_name,
      invoiceNumber: order.invoice_number,
      totalAmount: order.total_amount,
      currency: mappedConfig.currency,
    }),
    attachments: [
      {
        filename: `${order.invoice_number}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  return { sent: true };
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
  const safeStart = typeof startDate === "string" && startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
  const safeEnd = typeof endDate === "string" && endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

  if (!safeStart || Number.isNaN(safeStart.getTime()) || !safeEnd || Number.isNaN(safeEnd.getTime())) {
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

function getRangeStart(daysBack) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return date;
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

  const lastDay = orders.filter(order => new Date(order.created_at) >= getRangeStart(1));
  const lastWeek = orders.filter(order => new Date(order.created_at) >= getRangeStart(7));
  const lastMonth = orders.filter(order => new Date(order.created_at) >= getRangeStart(30));

  return {
    generatedAt: now.toISOString(),
    config: mapConfig(config),
    activeSession: mapSession(session),
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
      customer_name: order.customer_name,
      customer_email: order.customer_email,
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

async function seedIfEmpty() {
  const productCount = await prisma.product.count();
  if (productCount > 0) return;

  const categories = [
    { name: "Coffee", icon: "coffee" },
    { name: "Tea", icon: "tea" },
    { name: "Snacks", icon: "snacks" },
    { name: "Desserts", icon: "desserts" },
    { name: "Beverages", icon: "beverages" },
    { name: "Sandwiches", icon: "sandwiches" },
  ];

  await prisma.category.createMany({ data: categories });
  const createdCategories = await prisma.category.findMany();
  const categoryMap = new Map(createdCategories.map(cat => [cat.name, cat.id]));

  const products = [
    { name: "Espresso", category: "Coffee", price: 120, active: true, description: "Rich and bold single shot" },
    { name: "Americano", category: "Coffee", price: 150, active: true, description: "Espresso with hot water" },
    { name: "Cappuccino", category: "Coffee", price: 180, active: true, description: "Espresso with steamed milk foam" },
    { name: "Latte", category: "Coffee", price: 200, active: true, description: "Espresso with creamy steamed milk" },
    { name: "Masala Chai", category: "Tea", price: 80, active: true, description: "Spiced Indian tea" },
    { name: "Green Tea", category: "Tea", price: 100, active: true, description: "Light and refreshing" },
    { name: "Croissant", category: "Snacks", price: 150, active: true, description: "Buttery, flaky pastry" },
    { name: "Muffin", category: "Snacks", price: 120, active: true, description: "Blueberry or chocolate chip" },
    { name: "Chocolate Cake", category: "Desserts", price: 180, active: true, description: "Rich chocolate layers" },
    { name: "Cheesecake", category: "Desserts", price: 220, active: true, description: "Creamy New York style" },
    { name: "Fresh Lime Soda", category: "Beverages", price: 90, active: true, description: "Refreshing lime drink" },
    { name: "Mango Smoothie", category: "Beverages", price: 180, active: true, description: "Creamy mango blend" },
    { name: "Grilled Cheese", category: "Sandwiches", price: 180, active: true, description: "Melted cheese on sourdough" },
    { name: "Club Sandwich", category: "Sandwiches", price: 250, active: true, description: "Triple-decker classic" },
  ];

  await prisma.product.createMany({
    data: products.map(p => ({
      name: p.name,
      category_id: categoryMap.get(p.category) || null,
      price: p.price,
      active: p.active,
      description: p.description,
    })),
  });

  await prisma.floor.createMany({
    data: [
      { name: "Ground Floor" },
      { name: "Terrace" },
    ],
  });

  const floors = await prisma.floor.findMany();
  const floorMap = new Map(floors.map(f => [f.name, f.id]));

  const tables = [
    { floor: "Ground Floor", table_number: "T1", seats: 2, qr_token: "qr-t1-abc123" },
    { floor: "Ground Floor", table_number: "T2", seats: 4, qr_token: "qr-t2-def456" },
    { floor: "Ground Floor", table_number: "T3", seats: 4, qr_token: "qr-t3-ghi789" },
    { floor: "Ground Floor", table_number: "T4", seats: 6, qr_token: "qr-t4-jkl012" },
    { floor: "Ground Floor", table_number: "T5", seats: 2, qr_token: "qr-t5-mno345" },
    { floor: "Ground Floor", table_number: "T6", seats: 4, qr_token: "qr-t6-pqr678" },
    { floor: "Terrace", table_number: "T7", seats: 4, qr_token: "qr-t7-stu901" },
    { floor: "Terrace", table_number: "T8", seats: 6, qr_token: "qr-t8-vwx234" },
    { floor: "Terrace", table_number: "T9", seats: 8, qr_token: "qr-t9-yza567" },
    { floor: "Terrace", table_number: "T10", seats: 2, qr_token: "qr-t10-bcd890" },
  ];

  await prisma.table.createMany({
    data: tables.map(t => ({
      floor_id: floorMap.get(t.floor),
      table_number: t.table_number,
      seats: t.seats,
      qr_token: t.qr_token,
      active: true,
      status: "available",
    })),
  });

  await prisma.pOSConfig.create({
    data: {
      restaurant_name: "Bean & Brew Cafe",
      gstin: "29ABCDE1234F1Z5",
      upi_id: "beanbrewcafe@upi",
      currency: "Rs ",
      tax_rate: 5,
    },
  });

  const activeSession = await prisma.session.findFirst({ where: { is_active: true } });
  if (!activeSession) {
    await prisma.session.create({ data: { is_active: true, total_sales: 0, orders_count: 0 } });
  }
}

async function requireAdmin(req) {
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

  const userId = data.user.id;
  const isAdmin = await prisma.userRole.findFirst({
    where: { user_id: userId, role: "admin" },
  });

  if (!isAdmin) {
    const err = new Error("Admin role required");
    err.status = 403;
    throw err;
  }

  return { userId };
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

app.get("/api/bootstrap", async (req, res) => {
  try {
    await seedIfEmpty();

    const [categories, products, floors, tables, session, orders, config] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.product.findMany({ orderBy: { name: 'asc' } }),
      prisma.floor.findMany({ orderBy: { name: 'asc' } }),
      prisma.table.findMany({ orderBy: { table_number: 'asc' } }),
      prisma.session.findFirst({ where: { is_active: true }, orderBy: { opened_at: 'desc' } }),
      prisma.order.findMany({
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
      session: mapSession(session),
      orders: orders.map(mapOrder),
      config: mapConfig(config),
    });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
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
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
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
      order: mapOrder(order),
      table: mapTable(order.table),
      config: mapConfig(config) || { restaurant_name: "POS Cafe", gstin: "", currency: "Rs ", tax_rate: 0 },
    });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/reports/chat", async (req, res) => {
  try {
    await requireAuthenticatedUser(req);

    const { question } = req.body || {};
    if (!question || typeof question !== "string") {
      return sendError(res, 400, "question is required");
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return sendError(res, 400, "Missing GROQ_API_KEY in server environment");
    }

    const analyticsContext = await buildAnalyticsContext();
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            content: `Database context:\n${JSON.stringify(analyticsContext, null, 2)}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    const payload = await groqResponse.json();
    if (!groqResponse.ok) {
      return sendError(res, groqResponse.status, payload?.error?.message || "Groq request failed");
    }

    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return sendError(res, 500, "Empty response from Groq");
    }

    return res.json({ answer });
  } catch (err) {
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.get("/api/reports/gst", async (req, res) => {
  try {
    await requireAdmin(req);

    const startDate = typeof req.query.start_date === "string" ? req.query.start_date : "";
    const endDate = typeof req.query.end_date === "string" ? req.query.end_date : "";
    const report = await fetchGstReportData(startDate, endDate);
    return res.json(report);
  } catch (err) {
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.get("/api/reports/gst/export", async (req, res) => {
  try {
    await requireAdmin(req);

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
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.post("/api/setup-admin", async (req, res) => {
  try {
    const { email, password, full_name } = req.body || {};
    if (!email || !password || !full_name) {
      return sendError(res, 400, "email, password, and full_name are required");
    }

    const existingAdmin = await prisma.userRole.findFirst({ where: { role: "admin" } });
    if (existingAdmin) {
      return sendError(res, 400, "Admin already exists");
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error || !data?.user) {
      return sendError(res, 400, error?.message || "Failed to create admin user");
    }

    await prisma.userRole.create({
      data: { user_id: data.user.id, role: "admin" },
    });

    await prisma.profile.upsert({
      where: { user_id: data.user.id },
      update: { full_name, email },
      create: { user_id: data.user.id, full_name, email },
    });

    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/manage-staff", async (req, res) => {
  try {
    await requireAdmin(req);

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
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    return res.json(products.map(mapProduct));
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/products", async (req, res) => {
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
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/products/import", async (req, res) => {
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
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id, price, active, description, image } = req.body || {};
    const product = await prisma.product.update({
      where: { id },
      data: { name, category_id, price, active, description, image },
    });
    return res.json({ product: mapProduct(product) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.get("/api/tables", async (req, res) => {
  try {
    const tables = await prisma.table.findMany({ orderBy: { table_number: 'asc' } });
    return res.json(tables.map(mapTable));
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.get("/api/floors", async (req, res) => {
  try {
    const floors = await prisma.floor.findMany({ orderBy: { name: "asc" } });
    return res.json(floors.map(mapFloor));
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/floors", async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) {
      return sendError(res, 400, "name is required");
    }
    const floor = await prisma.floor.create({ data: { name } });
    return res.json({ floor: mapFloor(floor) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.put("/api/floors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    const floor = await prisma.floor.update({
      where: { id },
      data: { name },
    });
    return res.json({ floor: mapFloor(floor) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.delete("/api/floors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tableCount = await prisma.table.count({ where: { floor_id: id } });
    if (tableCount > 0) {
      return sendError(res, 400, "Cannot delete floor with existing tables");
    }
    await prisma.floor.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/tables", async (req, res) => {
  try {
    const { floor_id, table_number, seats, qr_token, active = true, status = "available" } = req.body || {};
    if (!floor_id || !table_number || !seats || !qr_token) {
      return sendError(res, 400, "floor_id, table_number, seats, and qr_token are required");
    }
    const table = await prisma.table.create({
      data: { floor_id, table_number, seats, qr_token, active, status },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.put("/api/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { floor_id, table_number, seats, qr_token, active, status } = req.body || {};
    const table = await prisma.table.update({
      where: { id },
      data: { floor_id, table_number, seats, qr_token, active, status },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.delete("/api/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.table.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.patch("/api/tables/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return sendError(res, 400, "status is required");
    }
    const table = await prisma.table.update({
      where: { id },
      data: { status },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

// ── Customer session toggle ────────────────────────────────────────────────
// Unlock: generates a fresh session token so customers can order via QR
app.post("/api/tables/:id/open-customer-session", async (req, res) => {
  try {
    const { id } = req.params;
    const token = crypto.randomUUID();
    const table = await prisma.table.update({
      where: { id },
      data: { customer_session_token: token },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

// Lock: clears the session token so QR ordering is blocked
app.post("/api/tables/:id/close-customer-session", async (req, res) => {
  try {
    const { id } = req.params;
    const table = await prisma.table.update({
      where: { id },
      data: { customer_session_token: null },
    });
    return res.json({ table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
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
    return res.json({ valid: true, table: mapTable(table), customer_session_token: table.customer_session_token });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});
// ──────────────────────────────────────────────────────────────────────────

app.get("/api/config", async (req, res) => {
  try {
    const config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });
    return res.json({ config: mapConfig(config) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.put("/api/config", async (req, res) => {
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
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: { include: { product: true } } },
      orderBy: { created_at: 'desc' },
    });
    return res.json(orders.map(mapOrder));
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
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

    let order = null;
    if (orderId) {
      order = await prisma.order.findFirst({
        where: {
          id: orderId,
          table_id: table.id,
          source: "customer",
        },
        include: { items: { include: { product: true } } },
      });
    }

    if (!order) {
      order = await prisma.order.findFirst({
        where: {
          table_id: table.id,
          source: "customer",
        },
        include: { items: { include: { product: true } } },
        orderBy: { created_at: "desc" },
      });
    }

    return res.json({
      table: mapTable(table),
      order: order ? mapOrder(order) : null,
    });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.put("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, kitchen_status, payment_status, customer_name, customer_email } = req.body || {};
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return sendError(res, 404, "Order not found");
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
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return sendError(res, 404, "Order not found");
    }

    await prisma.payment.deleteMany({ where: { order_id: id } });
    await prisma.orderItem.deleteMany({ where: { order_id: id } });
    await prisma.order.delete({ where: { id } });

    const sessionUpdateData = {
      orders_count: { decrement: 1 },
    };
    if (existingOrder.payment_status === "paid" && existingOrder.status !== "cancelled") {
      sessionUpdateData.total_sales = { decrement: Number(existingOrder.total_amount || 0) };
    }

    await prisma.session.update({
      where: { id: existingOrder.session_id },
      data: sessionUpdateData,
    });

    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/orders", async (req, res) => {
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

    if (source === "pos") {
      await requireAuthenticatedUser(req);
    }

    if (!customer_name || !String(customer_name).trim()) {
      return sendError(res, 400, "customer_name is required");
    }
    if (!isValidEmail(customer_email)) {
      return sendError(res, 400, "Valid customer_email is required");
    }

    // Validate customer session token for QR orders
    if (source === "customer") {
      const tableForValidation = await prisma.table.findUnique({ where: { id: table_id } });
      if (!tableForValidation?.customer_session_token) {
        return sendError(res, 403, "Table ordering session is not active. Please ask a staff member to unlock your table.");
      }
      if (tableForValidation.customer_session_token !== customer_session_token) {
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
    }

    const totals = calculateOrderTotals({
      items,
      productMap,
      discount,
      gstRate: Number(config?.tax_rate || 0),
    });
    const resolvedPaymentStatus = payment_status || "unpaid";
    const resolvedPaymentMethod = payment_method || (source === "customer" ? "upi" : "cash");
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

    const table = await prisma.table.update({
      where: { id: table_id },
      data: { status: source === "customer" ? "pending_confirmation" : "occupied" },
    });

    const sessionData = {
      orders_count: { increment: 1 },
    };
    if (resolvedPaymentStatus === "paid") {
      sessionData.total_sales = { increment: totals.totalAmount };
    }

    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: sessionData,
    });

    if (resolvedPaymentStatus === "paid") {
      try {
        await sendInvoiceEmailForOrder(order.id);
      } catch (emailErr) {
        console.error(`Invoice email send failed for order ${order.id}:`, emailErr?.message || emailErr);
      }
    }

    return res.json({
      order: mapOrder(order),
      table: mapTable(table),
      session: mapSession(updatedSession),
    });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/payments/razorpay/order", async (req, res) => {
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

    const existingPayment = await prisma.payment.findFirst({
      where: {
        order_id: order.id,
        provider: "razorpay",
        status: "pending",
      },
      orderBy: { created_at: "desc" },
    });

    if (existingPayment?.provider_order_id) {
      if (String(existingPayment.method) !== String(method)) {
        return sendError(res, 400, "A payment attempt is already in progress for a different method");
      }

      const config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });
      const { keyId } = getRazorpayKeys();

      return res.json({
        keyId,
        razorpayOrderId: existingPayment.provider_order_id,
        amountPaise,
        currency: "INR",
        name: config?.restaurant_name || "POS Cafe",
      });
    }

    if (order.source === "pos" && isPosOrderQrPaymentExpired(order)) {
      return sendError(
        res,
        400,
        `Payment session expired (>${getPosQrPaymentTtlMinutes()} minutes). Please ask staff to recreate the order.`
      );
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

    await prisma.payment.create({
      data: {
        order_id: order.id,
        method,
        amount: Number(order.total_amount || 0),
        status: "pending",
        provider: "razorpay",
        provider_order_id: razorpayOrder?.id || null,
      },
    });

    const config = await prisma.pOSConfig.findFirst({ orderBy: { created_at: "desc" } });
    const { keyId } = getRazorpayKeys();

    return res.json({
      keyId,
      razorpayOrderId: razorpayOrder?.id,
      amountPaise,
      currency: "INR",
      name: config?.restaurant_name || "POS Cafe",
    });
  } catch (err) {
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.post("/api/payments/razorpay/verify", async (req, res) => {
  try {
    const {
      orderId,
      order_id,
      customer_session_token,
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

    if (order.source === "customer") {
      await requireValidCustomerSessionForTableId(order.table_id, customer_session_token);
    }

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
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== String(razorpay_signature)) {
      return sendError(res, 400, "Invalid payment signature");
    }

    const { updatedOrder } = await completePaymentForOrder({
      order,
      payment,
      providerPaymentId: razorpay_payment_id,
      providerSignature: razorpay_signature,
    });

    return res.json({ ok: true, order: mapOrder(updatedOrder) });
  } catch (err) {
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
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

    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expected !== String(signature)) {
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
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.get("/api/orders/:id/invoice", async (req, res) => {
  try {
    await requireAuthenticatedUser(req);

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
    const status = err?.status || 500;
    return sendError(res, status, err?.message || "Server error");
  }
});

app.patch("/api/orders/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params;
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
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.patch("/api/orders/:id/reject", async (req, res) => {
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

    const table = await prisma.table.update({
      where: { id: order.table_id },
      data: { status: "available" },
    });

    if (existingOrder.payment_status === "paid" && existingOrder.status !== "cancelled") {
      await prisma.session.update({
        where: { id: existingOrder.session_id },
        data: {
          total_sales: { decrement: Number(existingOrder.total_amount || 0) },
        },
      });
    }

    return res.json({ order: mapOrder(order), table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.patch("/api/orders/:id/kitchen-status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return sendError(res, 400, "status is required");
    }

    const order = await prisma.order.update({
      where: { id },
      data: { kitchen_status: status },
      include: { items: { include: { product: true } } },
    });

    let table = await prisma.table.findUnique({ where: { id: order.table_id } });

    if (status === "completed") {
      const windowStart = new Date(Date.now() - getTableAutoReleaseHours() * 60 * 60 * 1000);
      const remaining = await prisma.order.count({
        where: {
          table_id: order.table_id,
          status: "confirmed",
          payment_status: "paid",
          kitchen_status: { not: "completed" },
          created_at: { gte: windowStart },
        },
      });

      if (remaining === 0) {
        table = await prisma.table.update({
          where: { id: order.table_id },
          data: { status: "available" },
        });
      }
    }

    return res.json({ order: mapOrder(order), table: mapTable(table) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/sessions/open", async (req, res) => {
  try {
    let session = await prisma.session.findFirst({ where: { is_active: true } });
    if (!session) {
      session = await prisma.session.create({ data: { is_active: true, total_sales: 0, orders_count: 0 } });
    }
    return res.json({ session: mapSession(session) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

app.post("/api/sessions/close", async (req, res) => {
  try {
    const { session_id } = req.body || {};
    const session = await prisma.session.update({
      where: { id: session_id },
      data: { is_active: false, closed_at: new Date() },
    });
    return res.json({ session: mapSession(session) });
  } catch (err) {
    return sendError(res, 500, err?.message || "Server error");
  }
});

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8787);
app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
