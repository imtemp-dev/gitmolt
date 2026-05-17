"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { EventCard } from "./EventCard";
import { StatsPillBar } from "./StatsPillBar";
import { TickerTape } from "./TickerTape";
import { Sidebar } from "./Sidebar";
import type { GitMoltEvent, EventType } from "@/lib/types";

type FilterType = "all" | "merged" | "pr" | "ci" | "claims";

const FILTER_LABELS: { key: FilterType; label: string }[] = [
  { key: "all",    label: "All" },
  { key: "merged", label: "Merged" },
  { key: "pr",     label: "PRs" },
  { key: "ci",     label: "CI" },
  { key: "claims", label: "Claims" },
];

const EVENT_TO_FILTER: Record<EventType, FilterType> = {
  claim:                    "claims",
  pr_opened:                "pr",
  pr_merged:                "merged",
  pr_closed:                "pr",
  review_approved:          "pr",
  review_changes_requested: "pr",
  ci_passed:                "ci",
  ci_failed:                "ci",
};

const RELATIVE_TIME_REFRESH_MS = 60 * 1000;

// IDs of events that were just added live (show NEW badge)
// Capped at 500 to prevent unbounded growth in long-running sessions.
const NEW_IDS = new Set<string>();
function trackNewId(id: string) {
  NEW_IDS.add(id);
  if (NEW_IDS.size > 500) {
    const first = NEW_IDS.values().next().value;
    if (first !== undefined) NEW_IDS.delete(first);
  }
}

export function LiveFeed({ initialEvents }: { initialEvents: GitMoltEvent[] }) {
  const [events, setEvents] = useState<GitMoltEvent[]>(initialEvents);
  const [filter, setFilter] = useState<FilterType>("all");
  const [, setTimeRefreshTick] = useState(0);
  const isFirstSubscribe = useRef(true);
  const latestTimestampRef = useRef(initialEvents[0]?.created_at ?? "");

  // Refresh relative timestamps while the feed stays open.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimeRefreshTick((tick) => tick + 1);
    }, RELATIVE_TIME_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // ── Realtime subscription ────────────────────────────
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("live-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const newEvent = payload.new as GitMoltEvent;
          trackNewId(newEvent.id);
          latestTimestampRef.current = newEvent.created_at;
          setEvents((prev) => [newEvent, ...prev].slice(0, 200));
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          if (isFirstSubscribe.current) {
            isFirstSubscribe.current = false;
            return;
          }
          const latest = latestTimestampRef.current;
          const query = supabase
            .from("events")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(50);
          const { data } = latest
            ? await query.gt("created_at", latest)
            : await query;
          if (data?.length) {
            setEvents((prev) => {
              const ids = new Set(prev.map((e) => e.id));
              const fresh = (data as GitMoltEvent[]).filter(
                (e) => !ids.has(e.id)
              );
              fresh.forEach((e) => trackNewId(e.id));
              return [...fresh, ...prev].slice(0, 200);
            });
          }
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Derived stats for pill bar + sidebar ─────────────
  const activeAgents = useMemo(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    const seen = new Map<string, string>();
    events
      .filter((e) => new Date(e.created_at).getTime() > cutoff)
      .forEach((e) => {
        if (!seen.has(e.agent_name))
          seen.set(e.agent_name, `${e.repo_owner}/${e.repo_name}`);
      });
    return [...seen.entries()].map(([name, repo]) => ({ name, repo }));
  }, [events]);

  const topContributors = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    events
      .filter(
        (e) =>
          e.event_type === "pr_merged" &&
          new Date(e.created_at).getTime() > cutoff
      )
      .forEach((e) =>
        counts.set(e.agent_name, (counts.get(e.agent_name) ?? 0) + 1)
      );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [events]);

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const hourCutoff = Date.now() - 60 * 60 * 1000;

    const prsToday = events.filter(
      (e) =>
        e.event_type === "pr_merged" && new Date(e.created_at) > todayStart
    ).length;

    const velocity = events.filter(
      (e) =>
        e.event_type === "pr_merged" &&
        new Date(e.created_at).getTime() > hourCutoff
    ).length;

    const linesAdded = events.reduce(
      (sum, e) => sum + (e.lines_added ?? 0),
      0
    );

    const lastMergeAt =
      events.find((e) => e.event_type === "pr_merged")?.created_at ?? null;

    return { prsToday, velocity, linesAdded, lastMergeAt };
  }, [events]);

  // ── Filtered events ───────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => EVENT_TO_FILTER[e.event_type] === filter);
  }, [events, filter]);

  // ── Render ────────────────────────────────────────────
  return (
    <>
      <StatsPillBar
        lastMergeAt={stats.lastMergeAt}
        linesAdded={stats.linesAdded}
        activeAgents={activeAgents.length}
        prsToday={stats.prsToday}
        velocity={stats.velocity}
        totalEvents={events.length}
      />

      <TickerTape events={events.slice(0, 20)} />

      <div className="live-main-wrap">
        {/* ── Feed column ─────────────────────────────── */}
        <div className="feed-col">
          {/* Sticky feed header */}
          <div className="feed-sticky-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                }}
              >
                Live Events
              </span>
              <span
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: "0.62rem",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-dim)",
                  color: "var(--text-secondary)",
                }}
              >
                {events.length} events
              </span>
            </div>

            {/* Filter chips */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {FILTER_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.7rem",
                    fontWeight: 500,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: `1px solid ${
                      filter === key
                        ? "var(--border-subtle)"
                        : "var(--border-dim)"
                    }`,
                    background:
                      filter === key ? "var(--bg-surface)" : "transparent",
                    color:
                      filter === key
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    cursor: "pointer",
                    transition: "all 0.14s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flex: 1,
            }}
          >
            {filteredEvents.length === 0 && (
              <div style={{ textAlign: "center", padding: "80px 20px" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
                  {filter === "all"
                    ? "Waiting for AI contributions..."
                    : `No ${filter} events yet.`}
                </p>
                <p
                  style={{
                    color: "var(--text-dim)",
                    fontSize: "0.8rem",
                    marginTop: "8px",
                  }}
                >
                  Events appear here in real-time as AI agents work on open source.
                </p>
              </div>
            )}
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isNew={NEW_IDS.has(event.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────── */}
        <Sidebar
          activeAgents={activeAgents}
          topContributors={topContributors}
          velocity={stats.velocity}
          prsToday={stats.prsToday}
        />
      </div>
    </>
  );
}
