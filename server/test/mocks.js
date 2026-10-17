import { vi } from "vitest";

// Every Prisma model/method the server uses, as vi.fn()s. Tests set return values
// per case with e.g. prismaMock.table.findFirst.mockResolvedValue(table).
const MODELS = ["profile", "userRole", "category", "product", "floor", "table", "session", "order", "orderItem", "payment", "pOSConfig"];
const METHODS = ["findUnique", "findFirst", "findMany", "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "count", "aggregate"];

export const prismaMock = {};
for (const model of MODELS) {
  prismaMock[model] = Object.fromEntries(METHODS.map((method) => [method, vi.fn()]));
}
prismaMock.$queryRaw = vi.fn();
prismaMock.$executeRaw = vi.fn();
prismaMock.$disconnect = vi.fn();
// Interactive transactions get the same mock as `tx`; array transactions just run.
prismaMock.$transaction = vi.fn();

export const supabaseMock = {
  auth: {
    getUser: vi.fn(),
    admin: { createUser: vi.fn(), deleteUser: vi.fn() },
  },
};

// Bearer tokens that log in as each role. "no-role-token" is a valid login with
// no staff role assigned.
export const STAFF = {
  admin: { token: "admin-token", userId: "00000000-0000-4000-8000-00000000a001" },
  cashier: { token: "cashier-token", userId: "00000000-0000-4000-8000-00000000c001" },
  kitchen: { token: "kitchen-token", userId: "00000000-0000-4000-8000-00000000b001" },
  none: { token: "no-role-token", userId: "00000000-0000-4000-8000-00000000d001" },
};

export function authHeader(role) {
  return { Authorization: `Bearer ${STAFF[role].token}` };
}

function installAuth() {
  supabaseMock.auth.getUser.mockImplementation(async (token) => {
    const entry = Object.values(STAFF).find((staff) => staff.token === token);
    return entry
      ? { data: { user: { id: entry.userId, email: `${entry.userId}@test.local` } }, error: null }
      : { data: { user: null }, error: { message: "invalid token" } };
  });

  prismaMock.userRole.findFirst.mockImplementation(async ({ where } = {}) => {
    const entry = Object.entries(STAFF).find(([, staff]) => staff.userId === where?.user_id);
    const role = entry && entry[0] !== "none" ? entry[0] : null;
    if (!role) return null;
    const wanted = where?.role?.in ?? (where?.role ? [where.role] : null);
    if (wanted && !wanted.includes(role)) return null;
    return { role };
  });
}

// Puts every mock back to safe empty defaults. Call in beforeEach.
export function resetMocks() {
  for (const model of MODELS) {
    for (const method of METHODS) prismaMock[model][method].mockReset();
    prismaMock[model].findMany.mockResolvedValue([]);
    prismaMock[model].findFirst.mockResolvedValue(null);
    prismaMock[model].findUnique.mockResolvedValue(null);
    prismaMock[model].count.mockResolvedValue(0);
    prismaMock[model].updateMany.mockResolvedValue({ count: 0 });
    prismaMock[model].deleteMany.mockResolvedValue({ count: 0 });
    prismaMock[model].aggregate.mockResolvedValue({ _sum: { total_amount: null } });
  }
  prismaMock.$queryRaw.mockReset().mockResolvedValue([]);
  prismaMock.$executeRaw.mockReset().mockResolvedValue(1);
  prismaMock.$transaction.mockReset().mockImplementation(async (arg) =>
    typeof arg === "function" ? arg(prismaMock) : Promise.all(arg)
  );
  supabaseMock.auth.getUser.mockReset();
  supabaseMock.auth.admin.createUser.mockReset();
  supabaseMock.auth.admin.deleteUser.mockReset();
  installAuth();
}

// Test data shaped like Prisma rows.
export const ids = {
  table: "11111111-1111-4111-8111-111111111111",
  order: "22222222-2222-4222-8222-222222222222",
  product: "33333333-3333-4333-8333-333333333333",
  product2: "33333333-3333-4333-8333-333333333334",
  session: "44444444-4444-4444-8444-444444444444",
  floor: "55555555-5555-4555-8555-555555555555",
  payment: "66666666-6666-4666-8666-666666666666",
};

export function makeTable(overrides = {}) {
  return {
    id: ids.table,
    floor_id: ids.floor,
    table_number: "T1",
    seats: 4,
    qr_token: "qr-token-t1",
    active: true,
    status: "available",
    customer_session_token: "session-token-t1",
    customer_session_started_at: new Date(),
    ...overrides,
  };
}

export function makeProduct(overrides = {}) {
  return { id: ids.product, name: "Latte", category_id: null, price: 200, active: true, image: null, description: null, ...overrides };
}

export function makeOrder(overrides = {}) {
  return {
    id: ids.order,
    invoice_number: "INV-1",
    table_id: ids.table,
    session_id: ids.session,
    source: "customer",
    status: "pending_confirmation",
    kitchen_status: "to_cook",
    payment_status: "unpaid",
    subtotal: 200,
    discount: 0,
    taxable_amount: 200,
    cgst_rate: 2.5,
    sgst_rate: 2.5,
    cgst_amount: 5,
    sgst_amount: 5,
    total_amount: 210,
    created_at: new Date(),
    customer_name: "Asha",
    customer_email: "asha@example.com",
    customer_phone: "9999999999",
    items: [],
    ...overrides,
  };
}

export function makeSession(overrides = {}) {
  return { id: ids.session, opened_at: new Date(), closed_at: null, total_sales: 0, orders_count: 0, is_active: true, ...overrides };
}
