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

// Safe for unauthenticated responses: no QR or session tokens.
function mapPublicTable(table) {
  if (!table) return null;
  return {
    id: table.id,
    table_number: table.table_number,
    seats: table.seats,
    status: table.status,
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

// Safe for unauthenticated responses: no customer contact details.
function mapPublicOrder(order) {
  const { customer_email, customer_phone, ...publicOrder } = mapOrder(order);
  return publicOrder;
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

export {
  toNumber,
  toIso,
  mapCategory,
  mapProduct,
  mapFloor,
  mapTable,
  mapPublicTable,
  mapSession,
  mapOrderItem,
  mapOrder,
  mapPublicOrder,
  mapConfig,
};
