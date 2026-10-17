# POS Cafe

## Project info

<!-- **Project URL**: Replace with your deployed app URL -->

## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Running the tests

```sh
npm test            # run everything once
npm run test:watch  # re-run on save
npx vitest run --project server   # API only
npx vitest run --project web      # frontend only
```

The API tests mock Prisma and Supabase, so they never touch a real database and need no `.env`. Test files are grouped by feature:

| File | Covers |
|---|---|
| `server/test/auth.test.js` | Login and role checks on every staff route, public routes, security headers |
| `server/test/public.test.js` | Public menu/order endpoints never expose tokens or contact details; order status needs the order's id |
| `server/test/orders.test.js` | Order validation (source, quantity, inactive products), QR orders forced unpaid, second rounds, reject/delete, computed sales totals, bootstrap |
| `server/test/payments.test.js` | Razorpay order reuse and method switching, `/verify`, webhook signatures, payment counted once |
| `server/test/admin.test.js` | First-admin setup secret, table QR tokens and unlock times, AI chat limits and privacy |
| `server/test/*.test.js` (others) | Tax maths, IST dates, email escaping, signatures, CORS, error mapping, table re-lock |
| `src/lib/api.test.ts` | Readable errors for HTML responses and network failures |
| `src/lib/pendingOrder.test.ts` | Reusing an order after a cancelled checkout only when the cart is unchanged |
| `src/pages/customer/CustomerMenu.test.tsx` | Customer menu: locked table, auto-unlock, retry on errors, second rounds, token encoding |

## How can I deploy this project?

Deploy the backend to Render and the frontend to Vercel using the steps below.

## Deploy (Render backend + Vercel frontend)

### Backend (Render)

- Create a new **Web Service** from this repo.
- **Build Command:** `npm ci && npm run prisma:generate`
- **Start Command:** `npm start`
- **Before each deploy with schema changes:** `npx prisma migrate deploy`
- **Environment variables (required):**
  - `DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Environment variables (optional / feature-based):**
  - `SUPABASE_JWT_SECRET` (not currently used by the server)
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
  - `CORS_ORIGIN` (comma-separated; `*` wildcards allowed for Vercel previews. Set it in production: if omitted the API allows all origins)
  - `POS_QR_PAYMENT_TTL_MINUTES`
  - `TABLE_AUTO_RELEASE_HOURS` (QR ordering re-locks this many hours after a table is unlocked; default 12)
  - `ADMIN_SETUP_SECRET` (only while creating the first admin; remove afterwards)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`

Render will provide `PORT` automatically (the server reads `PORT` first).

### Frontend (Vercel)

- Import the repo into Vercel as a frontend project.
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment variables (required):**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_API_BASE_URL` (your Render service URL, e.g. `https://<service>.onrender.com`)

### Razorpay Webhook URL

Set Razorpay webhook to: `https://<render-service>/api/webhooks/razorpay`

## Can I connect a custom domain?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Configure the domain in your hosting provider's settings and point it to the deployed app.
