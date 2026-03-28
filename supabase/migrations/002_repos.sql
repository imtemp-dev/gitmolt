-- GitMolt repos table: tracks repos with GitMolt App installed
CREATE TABLE IF NOT EXISTS repos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  description TEXT,
  installed_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT true
);

-- Index for active repos listing
CREATE INDEX IF NOT EXISTS idx_repos_active ON repos (active, installed_at DESC);
