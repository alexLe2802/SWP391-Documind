-- Enable Row Level Security on the entitlement_transactions table.
-- This table is exposed to PostgREST and must have RLS enabled to prevent
-- unauthorized direct API access.
ALTER TABLE "entitlement_transactions" ENABLE ROW LEVEL SECURITY;

-- Deny all access by default (the application accesses this table
-- exclusively through the backend service role, which bypasses RLS).
-- No permissive policies are created for regular (anon/authenticated) roles.
