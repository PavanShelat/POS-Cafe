import { formatCurrency, formatDateForInvoice } from "./tax.js";

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdfBuffer(lines) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const startY = 800;
  const lineHeight = 16;
  const commands = ["BT", "/F1 11 Tf"];

  lines.forEach((line, index) => {
    const y = startY - index * lineHeight;
    commands.push(`1 0 0 1 48 ${y} Tm (${sanitizePdfText(line)}) Tj`);
  });

  commands.push("ET");
  const content = commands.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildInvoicePdf({ config, order, table }) {
  const itemLines = order.items.flatMap((item, index) => [
    `${index + 1}. ${item.product?.name || "Item"}`,
    `   Qty ${item.quantity}  Price ${formatCurrency(item.price, config.currency)}  Line Total ${formatCurrency(item.price * item.quantity, config.currency)}`,
  ]);

  const lines = [
    config.restaurant_name || "POS Cafe",
    `GSTIN: ${config.gstin || "N/A"}`,
    `Invoice Number: ${order.invoice_number}`,
    `Invoice Date: ${formatDateForInvoice(order.created_at)}`,
    `Table: ${table?.table_number || "N/A"}`,
    `Customer Name: ${order.customer_name || "Walk-in"}`,
    `Customer Email: ${order.customer_email || "N/A"}`,
    `Customer Phone: ${order.customer_phone || "N/A"}`,
    "",
    "Items",
    ...itemLines,
    "",
    "Totals",
    `Subtotal: ${formatCurrency(order.subtotal, config.currency)}`,
    `Discount: ${formatCurrency(order.discount, config.currency)}`,
    `Taxable Amount: ${formatCurrency(order.taxable_amount, config.currency)}`,
    `CGST (${order.cgst_rate}%): ${formatCurrency(order.cgst_amount, config.currency)}`,
    `SGST (${order.sgst_rate}%): ${formatCurrency(order.sgst_amount, config.currency)}`,
    `Final Amount: ${formatCurrency(order.total_amount, config.currency)}`,
    "",
    "Tax is shown at the total level only.",
  ];

  return buildPdfBuffer(lines);
}

export { buildInvoicePdf };
