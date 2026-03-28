-- GitMolt events table: tracks all contribution activity (claims, PRs, reviews, CI)
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  event_type TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  issue_number INTEGER,
  pr_number INTEGER,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  body TEXT,
  raw_action TEXT NOT NULL,
  delivery_id TEXT NOT NULL UNIQUE
);

-- Index for live feed queries (newest first)
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at DESC);

-- Enable Realtime for live feed
ALTER PUBLICATION supabase_realtime ADD TABLE events;
