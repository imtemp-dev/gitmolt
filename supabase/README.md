# Supabase Migrations

Run these in order on a new Supabase project via SQL Editor.

## Setup

1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor
3. Run each migration file in order:

```sql
-- 1. Events table (live feed)
-- Copy contents of migrations/001_events.sql

-- 2. Repos table (directory)
-- Copy contents of migrations/002_repos.sql
```

## Environment Variables

Add to Vercel:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Tables

- **events** — All GitMolt contribution activity. Realtime enabled for /live page.
- **repos** — Repos with GitMolt App installed. Updated via installation webhook.
