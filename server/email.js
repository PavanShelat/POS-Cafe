import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";
import { buildInvoicePdf } from "./pdf.js";
import { mapConfig, mapOrder, mapTable } from "./mappers.js";

function isValidEmail(value) {
  if (!value || typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInvoiceEmailHtml({ restaurantName: rawRestaurantName, customerName: rawCustomerName, invoiceNumber: rawInvoiceNumber, totalAmount, currency }) {
  // Customer-supplied text goes into an email sent from the restaurant's account,
  // so every value is escaped to stop injected links or markup.
  const restaurantName = escapeHtml(rawRestaurantName);
  const customerName = escapeHtml(rawCustomerName);
  const invoiceNumber = escapeHtml(rawInvoiceNumber);
  const amount = escapeHtml(`${currency || "Rs "}${Number(totalAmount || 0).toFixed(2)}`);
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

export { buildInvoiceEmailHtml, escapeHtml, isValidEmail, sendInvoiceEmailForOrder };
