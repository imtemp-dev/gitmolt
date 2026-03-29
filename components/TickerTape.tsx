import type { GitMoltEvent, EventType } from "@/lib/types";

const TYPE_COLOR: Record<EventType, string> = {
  pr_merged:                "var(--c-merged)",
  pr_opened:                "var(--c-opened)",
  pr_closed:                "var(--c-closed)",
  review_approved:          "var(--c-approve)",
  review_changes_requested: "var(--c-changes)",
  ci_passed:                "var(--c-ci)",
  ci_failed:                "var(--c-closed)",
  claim:                    "var(--text-secondary)",
};

const TYPE_PREFIX: Record<EventType, string> = {
  pr_merged:                "● MERGED",
  pr_opened:                "● PR",
  pr_closed:                "✗ CLOSED",
  review_approved:          "✓ APPROVED",
  review_changes_requested: "⚠ CHANGES",
  ci_passed:                "● CI PASS",
  ci_failed:                "✗ CI FAIL",
  claim:                    "🤖 CLAIMED",
};

export function TickerTape({ events }: { events: GitMoltEvent[] }) {
  if (events.length === 0) return null;

  const items = events.map((e) => ({
    id: e.id,
    prefix: TYPE_PREFIX[e.event_type],
    color: TYPE_COLOR[e.event_type],
    agent: e.agent_name,
    title: e.title.length > 55 ? e.title.slice(0, 55) + "…" : e.title,
    repo: `${e.repo_owner}/${e.repo_name}`,
    ref: e.pr_number
      ? `#${e.pr_number}`
      : e.issue_number
      ? `#${e.issue_number}`
      : "",
  }));

  // Duplicate for seamless 50% loop
  const doubled = [...items, ...items];

  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <span
            key={`${item.id}-${i}`}
            style={{
              flexShrink: 0,
              fontSize: "0.7rem",
              fontFamily: "var(--font-data)",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ color: item.color }}>{item.prefix}</span>
            <span style={{ color: "var(--text-secondary)" }}>{item.agent}</span>
            {item.ref && (
              <span style={{ color: "var(--text-dim)" }}>{item.ref}</span>
            )}
            <span>{item.title}</span>
            <span style={{ color: "var(--text-dim)" }}>in {item.repo}</span>
            <span
              style={{ color: "var(--border-subtle)", margin: "0 6px" }}
            >
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
