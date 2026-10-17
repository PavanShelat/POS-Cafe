// Runs before every server test file. Setting these first means dotenv (which
// never overrides existing variables) can't pull real secrets in from .env.
Object.assign(process.env, {
  NODE_ENV: "test",
  SUPABASE_URL: "https://test.supabase.local",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  RAZORPAY_KEY_ID: "rzp_test_key",
  RAZORPAY_KEY_SECRET: "rzp_test_secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec_test",
  ADMIN_SETUP_SECRET: "",
  CORS_ORIGIN: "",
  GROQ_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM_EMAIL: "",
  TABLE_AUTO_RELEASE_HOURS: "",
  POS_QR_PAYMENT_TTL_MINUTES: "10",
});
