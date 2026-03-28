-- Disable RLS on all tables for service-role access
-- GitMolt API uses service_role key, RLS blocks reads otherwise
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE repos DISABLE ROW LEVEL SECURITY;
