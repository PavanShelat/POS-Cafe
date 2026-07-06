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

## How can I deploy this project?

Deploy the backend to Render and the frontend to Vercel using the steps below.

## Deploy (Render backend + Vercel frontend)

### Backend (Render)

- Create a new **Web Service** from this repo.
- **Build Command:** `npm ci && npm run prisma:generate`
- **Start Command:** `node server/index.js`
- **Environment variables (required):**
  - `DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Environment variables (optional / feature-based):**
  - `SUPABASE_JWT_SECRET` (not currently used by the server)
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
  - `CORS_ORIGIN` (set to your Vercel domain; if omitted the API allows all origins)
  - `POS_QR_PAYMENT_TTL_MINUTES`
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
