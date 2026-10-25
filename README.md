# ☕ POS-Cafe — Cafe Point of Sale System

A modern, web-based **Point of Sale system** purpose-built for cafes and restaurants. POS-Cafe handles everything from table management and staff-side ordering to customer self-ordering via QR codes, real-time kitchen coordination, GST-compliant invoicing, and session-based sales reporting — all in one unified platform.

---

## ✨ Key Features

### 🪑 Table & Floor Management
- Visual floor plan with interactive table cards
- Real-time table status — **Available**, **Occupied**, **Pending Confirmation**
- Auto-generated QR codes per table for customer self-ordering
- Configurable auto-release timers for table sessions

### 🛒 Dual Ordering Channels
| Channel | Flow |
|---|---|
| **POS (Staff)** | Cashier picks a table → builds order from catalog → collects payment → sends to kitchen |
| **QR (Customer)** | Customer scans table QR → browses menu → adds to cart → pays digitally → order awaits staff confirmation |

### 💳 Payment Processing
- Supports **Cash**, **Card/Digital**, and **UPI** payment methods
- Integrated **Razorpay** gateway for online payments (webhook-verified)
- Payment-first flow for customer QR orders; pay-after-order for POS manual orders

### 👨‍🍳 Kitchen Display System (KDS)
- Real-time ticket board showing only confirmed & paid orders
- Three-stage kitchen workflow: **To Cook** → **Preparing** → **Completed**
- Live status updates synced across all interfaces

### 🧾 GST-Compliant Taxation & Invoicing
- Automatic GST calculation (CGST 2.5% + SGST 2.5%)
- Discounts applied before tax
- PDF invoice generation with full tax breakdown
- Admin-configurable GST rates (applied to future orders only)

### 📊 Reports & Analytics
- Session-based and date-range sales reports
- Total sales, order count, tax collected summaries
- Excel (.xlsx) export for GST filing
- Covers both POS and customer QR orders

### 👥 Role-Based Access
| Role | Capabilities |
|---|---|
| **Admin** | Full system access — staff management, settings, products, tables, reports, sessions |
| **Cashier** | POS terminal, floor view, order creation, payment collection, QR order confirmation |
| **Kitchen Staff** | Kitchen display — view confirmed orders, update preparation status |
| **Customer** | QR menu browsing, cart, payment, order status tracking (no login required) |

### 📧 Email Notifications
- SMTP-based email support for order confirmations and alerts
- Configurable sender identity

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ POS      │  │ Kitchen      │  │ Customer QR App   │  │
│  │ Terminal │  │ Display (KDS)│  │ (Mobile Browser)  │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│       └───────────┬────┴──────────────────┘              │
└───────────────────┼──────────────────────────────────────┘
                    │  REST API + WebSocket
┌───────────────────┼──────────────────────────────────────┐
│            Backend (Express + Prisma)                    │
│  ┌────────────────┼─────────────────────────────────┐    │
│  │  Routes: orders, products, tables, sessions,     │    │
│  │  payments, reports, staff, tax, webhooks          │    │
│  └────────────────┬─────────────────────────────────┘    │
└───────────────────┼──────────────────────────────────────┘
                    │
┌───────────────────┼──────────────────────────────────────┐
│               Supabase                                   │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  │
│  │PostgreSQL│  │  Auth   │  │ Realtime │  │ Storage  │  │
│  │ Database │  │ Service │  │ Subs     │  │          │  │
│  └──────────┘  └─────────┘  └──────────┘  └──────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite |
| **UI Components** | shadcn/ui (Radix UI primitives) |
| **Styling** | Tailwind CSS |
| **Routing** | React Router v6 |
| **State/Data** | TanStack React Query |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Backend** | Node.js, Express |
| **ORM** | Prisma |
| **Database** | PostgreSQL (via Supabase) |
| **Auth** | Supabase Auth |
| **Realtime** | Supabase Realtime Subscriptions |
| **Payments** | Razorpay |
| **QR Codes** | qrcode.react |
| **Forms** | React Hook Form + Zod validation |
| **Testing** | Vitest, Testing Library, Supertest |
| **Email** | Nodemailer |

---

## 📂 Project Structure

```
POS-Cafe/
├── src/                    # Frontend source
│   ├── pages/              # Route pages
│   │   ├── LoginPage.tsx
│   │   ├── FloorView.tsx
│   │   ├── OrdersPage.tsx
│   │   ├── KitchenDisplay.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── StaffManagementPage.tsx
│   │   ├── PublicOrderPayment.tsx
│   │   ├── PublicOrderTracking.tsx
│   │   └── customer/       # Customer QR ordering pages
│   ├── components/         # Reusable UI components
│   ├── context/            # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities & API client
│   ├── types/              # TypeScript type definitions
│   └── integrations/       # Third-party integrations
├── server/                 # Backend API
│   ├── app.js              # Express app & all routes
│   ├── index.js            # Server entry point
│   ├── seed.js             # Database seeder
│   ├── razorpay.js         # Razorpay integration
│   ├── tax.js              # GST calculation logic
│   ├── email.js            # SMTP email service
│   ├── pdf.js              # Invoice PDF generation
│   ├── xlsx.js             # Excel report export
│   ├── security.js         # Auth middleware
│   └── test/               # API tests
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── migrations/         # Migration files
├── docs/                   # Project documentation
│   ├── PROJECT_OVERVIEW.md
│   ├── PRD.md              # Product Requirements Document
│   ├── HLD.md              # High Level Design
│   ├── Tax.md              # GST taxation system spec
│   └── ...                 # Weekly reports & more
├── public/                 # Static assets
└── supabase/               # Supabase configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+) & **npm**
- A **Supabase** project (for PostgreSQL, Auth, and Realtime)
- A **Razorpay** account (optional — for online payments)

### Installation

```sh
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd POS-Cafe

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your Supabase, database, and Razorpay credentials

# 4. Generate Prisma client
npm run prisma:generate

# 5. Run database migrations
npx prisma migrate deploy

# 6. Seed the database (optional — adds sample menu data)
npm run seed

# 7. Start both frontend and backend
npm run dev:all
```

This starts:
- **Frontend** at `http://localhost:5173` (Vite dev server)
- **Backend API** at `http://localhost:3000` (Express server)

You can also run them separately:
```sh
npm run dev          # Frontend only
npm run dev:server   # Backend only
```

### Environment Variables

Copy `.env.example` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `VITE_SUPABASE_URL` | ✅ | Supabase URL (frontend) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon key (frontend) |
| `VITE_API_BASE_URL` | ✅ | Backend API URL |
| `RAZORPAY_KEY_ID` | ❌ | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | ❌ | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | ❌ | Razorpay webhook secret |
| `CORS_ORIGIN` | ❌ | Allowed origins (comma-separated) |
| `ADMIN_SETUP_SECRET` | ❌ | Secret for first admin creation |
| `TABLE_AUTO_RELEASE_HOURS` | ❌ | Auto-release table after N hours (default: 12) |
| `POS_QR_PAYMENT_TTL_MINUTES` | ❌ | QR payment TTL |
| `SMTP_HOST`, `SMTP_PORT`, etc. | ❌ | Email notification config |

---

## 🧪 Testing

```sh
npm test              # Run all tests once
npm run test:watch    # Re-run on file changes
npx vitest run --project server   # API tests only
npx vitest run --project web      # Frontend tests only
```

API tests mock Prisma and Supabase — no real database or `.env` required.

| Test File | Coverage |
|---|---|
| `server/test/auth.test.js` | Login, role checks, public routes, security headers |
| `server/test/public.test.js` | Public menu/order endpoints, data privacy |
| `server/test/orders.test.js` | Order validation, QR orders, second rounds, reject/delete, sales totals |
| `server/test/payments.test.js` | Razorpay order reuse, method switching, webhook signatures |
| `server/test/admin.test.js` | First-admin setup, table QR tokens, unlock times |
| `src/lib/api.test.ts` | Error handling for HTML responses and network failures |
| `src/lib/pendingOrder.test.ts` | Order reuse logic after cancelled checkouts |
| `src/pages/customer/CustomerMenu.test.tsx` | Customer menu: locked table, auto-unlock, retry, token encoding |

---

## 🔄 Order Lifecycle

```
┌─────────────┐     ┌─────────────┐
│  POS Staff   │     │  Customer   │
│  creates     │     │  scans QR   │
│  order       │     │  & orders   │
└──────┬───────┘     └──────┬──────┘
       │                    │
       ▼                    ▼
 ┌───────────┐      ┌─────────────┐
 │  Payment  │      │  Payment    │
 │  collected│      │  via UPI /  │
 │  (Cash/   │      │  Card       │
 │   Card)   │      │             │
 └─────┬─────┘      └──────┬──────┘
       │                    │
       │              ┌─────▼──────┐
       │              │  Pending   │
       │              │  Staff     │
       │              │  Confirm   │
       │              └─────┬──────┘
       │                    │
       ▼                    ▼
 ┌──────────────────────────────┐
 │     Confirmed & Paid         │
 │     → Kitchen Display        │
 └──────────────┬───────────────┘
                │
    ┌───────────▼───────────┐
    │  To Cook → Preparing  │
    │       → Completed     │
    └───────────┬───────────┘
                │
        ┌───────▼───────┐
        │    Reports    │
        │    & Totals   │
        └───────────────┘
```

---

## 🌐 Deployment

### Backend → Render

| Setting | Value |
|---|---|
| **Build Command** | `npm ci && npm run prisma:generate` |
| **Start Command** | `npm start` |
| **Pre-deploy** (schema changes) | `npx prisma migrate deploy` |

Set the required environment variables (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) plus any optional ones listed above.

### Frontend → Vercel

| Setting | Value |
|---|---|
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_BASE_URL` (pointing to your Render service URL).

### Razorpay Webhook

Set your Razorpay webhook URL to:
```
https://<your-render-service>.onrender.com/api/webhooks/razorpay
```

---

## 📄 Documentation

Detailed documentation lives in the [`docs/`](docs/) folder:

| Document | Description |
|---|---|
| [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Role-based activities and core operational flow |
| [PRD.md](docs/PRD.md) | Full Product Requirements Document |
| [HLD.md](docs/HLD.md) | High Level Design with architecture diagrams |
| [Tax.md](docs/Tax.md) | GST taxation system specification |
| [smart-inventory-management.md](docs/smart-inventory-management.md) | AI-powered inventory management spec (proposed) |
| Weekly Reports | `Week-1.pdf` through `Week-12.pdf` — sprint progress |

---

## 📜 License

This project is private and not licensed for public distribution.
