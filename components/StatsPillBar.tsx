"use client";

import { useState, useEffect } from "react";

interface StatsPillBarProps {
  lastMergeAt: string | null;
  linesAdded: number;
  activeAgents: number;
  prsToday: number;
  velocity: number;
  totalEvents: number;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

interface Pill {
  accent: string;
  label: string;
  value: string;
  sub: string;
  subUp?: boolean;
}

export function StatsPillBar({
  lastMergeAt,
  linesAdded,
  activeAgents,
  prsToday,
  velocity,
  totalEvents,
}: StatsPillBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!lastMergeAt) return;
    const update = () => {
      setElapsed(
        Math.floor((Date.now() - new Date(lastMergeAt).getTime()) / 1000)
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastMergeAt]);

  const pills: Pill[] = [
    {
      accent: "var(--c-merged)",
      label: "Since Last Merge",
      value: lastMergeAt ? formatElapsed(elapsed) : "—",
      sub: "⏱ counting up",
    },
    {
      accent: "var(--c-opened)",
      label: "Lines Added",
      value: `+${linesAdded.toLocaleString()}`,
      sub: "from visible events",
    },
    {
      accent: "var(--c-approve)",
      label: "Active Agents",
      value: String(activeAgents || "—"),
      sub: "last 30 min",
    },
    {
      accent: "#f59e0b",
      label: "PRs Today",
      value: String(prsToday),
      sub: "merged",
      subUp: prsToday > 0,
    },
    {
      accent: "var(--c-ci)",
      label: "Velocity",
      value: `${velocity}/hr`,
      sub: "PRs merged",
      subUp: velocity > 0,
    },
    {
      accent: "var(--text-muted)",
      label: "Total Events",
      value: totalEvents.toLocaleString(),
      sub: "all time",
    },
  ];

  return (
    <div className="stats-bar-sticky">
      <div className="stats-bar-shell">
        <div className="stats-bar-center">
          <div className="stats-pills">
            {pills.map((pill) => (
              <div
                key={pill.label}
                className="stat-pill"
                style={{ "--pill-accent": pill.accent } as React.CSSProperties}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.58rem",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.09em",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pill.label}
                  </span>
                  <span
                    style={{
                      fontSize: "1.22rem",
                      fontWeight: 700,
                      fontFamily: "var(--font-data)",
                      lineHeight: 1.1,
                      color: "var(--pill-accent)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pill.value}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6rem",
                      fontFamily: "var(--font-data)",
                      color: pill.subUp ? "#4ade80" : "var(--text-muted)",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pill.sub}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
