-- Add lines_deleted column to events table for tracking PR merge stats
ALTER TABLE events ADD COLUMN IF NOT EXISTS lines_deleted INTEGER;
