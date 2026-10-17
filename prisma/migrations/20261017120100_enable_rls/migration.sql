-- The Supabase anon key ships in the frontend bundle, so every table in the
-- public schema is reachable through the REST API unless RLS is on.
-- RLS with no policies blocks the anon and authenticated roles entirely.
-- The server connects through DATABASE_URL as the table owner, which bypasses
-- RLS, so the app keeps working. Enabling RLS twice is a no-op.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "floors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
-- Left behind by an earlier table-session migration that is no longer in the repo.
ALTER TABLE IF EXISTS "table_sessions" ENABLE ROW LEVEL SECURITY;
