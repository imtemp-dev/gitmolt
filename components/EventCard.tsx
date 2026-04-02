import type { GitMoltEvent, EventType } from "@/lib/types";

const EVENT_CONFIG: Record<
  EventType,
  { icon: string; accentClass: string; label: string }
> = {
  claim:                      { icon: "🤖", accentClass: "accent-claim",   label: "Claimed" },
  pr_opened:                  { icon: "📝", accentClass: "accent-opened",  label: "PR Opened" },
  pr_merged:                  { icon: "🎉", accentClass: "accent-merged",  label: "Merged" },
  pr_closed:                  { icon: "❌", accentClass: "accent-closed",  label: "Closed" },
  review_approved:            { icon: "✅", accentClass: "accent-approve", label: "Approved" },
  review_changes_requested:   { icon: "🔄", accentClass: "accent-changes", label: "Changes Requested" },
  ci_passed:                  { icon: "✅", accentClass: "accent-ci",      label: "CI Passed" },
  ci_failed:                  { icon: "❌", accentClass: "accent-closed",  label: "CI Failed" },
};

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function extractStats(
  body: string | null
): { files?: number } {
  if (!body) return {};
  const stats: { files?: number } = {};
  const filesMatch = body.match(/(\d+)\s*files?\s*changed/i);
  if (filesMatch) stats.files = parseInt(filesMatch[1]);
  return stats;
}

function extractDescription(body: string | null): string | null {
  if (!body) return null;
  const summaryMatch = body.match(
    /## Summary\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/
  );
  if (summaryMatch) {
    const text = summaryMatch[1].trim().split("\n")[0];
    if (text && text.length > 10) return text;
  }
  const lines = body
    .split("\n")
    .filter(
      (l) =>
        l.trim() &&
        !l.startsWith("#") &&
        !l.startsWith("-") &&
        !l.startsWith("Closes")
    );
  return lines[0]?.slice(0, 120) ?? null;
}

export function EventCard({
  event,
  isNew,
}: {
  event: GitMoltEvent;
  isNew?: boolean;
}) {
  const config = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.claim;
  const ref = event.pr_number
    ? `#${event.pr_number}`
    : event.issue_number
    ? `#${event.issue_number}`
    : "";
  const stats = extractStats(event.body);
  const description = extractDescription(event.body);
  const additions = event.lines_added ?? null;
  const deletions = event.lines_deleted ?? null;
  const hasStats = stats.files || additions != null || deletions != null;
  const isMerged = event.event_type === "pr_merged";

  return (
    <div
      className={`event-card-gm ${config.accentClass} ${isMerged ? "is-merged" : ""}`}
    >
      {isNew && <span className="new-badge-gm">NEW</span>}

      {/* Top: icon + agent + badge + time */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "7px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid var(--border-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.88rem",
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-data)",
            }}
          >
            {event.agent_name}
          </span>
          <span
            style={{
              fontSize: "0.6rem",
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid var(--border-dim)",
              color: "var(--card-accent)",
              letterSpacing: "0.02em",
              fontFamily: "var(--font-data)",
            }}
          >
            {config.label}
          </span>
        </div>
        <span
          style={{
            fontSize: "0.66rem",
            color: "var(--text-muted)",
            fontFamily: "var(--font-data)",
            flexShrink: 0,
          }}
        >
          {relativeTime(event.created_at)}
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          lineHeight: 1.45,
          marginBottom: description || hasStats ? "5px" : "0",
        }}
      >
        {event.title}{" "}
        {ref && (
          <span
            style={{
              fontFamily: "var(--font-data)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            {ref}
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p
          style={{
            fontSize: "0.74rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginBottom: hasStats ? "8px" : "0",
          }}
        >
          {description}
        </p>
      )}

      {/* Stats */}
      {hasStats && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          {stats.files != null && (
            <span
              style={{
                fontSize: "0.7rem",
                fontFamily: "var(--font-data)",
                color: "var(--text-muted)",
              }}
            >
              {stats.files} files
            </span>
          )}
          {additions != null && (
            <span
              style={{
                fontSize: "0.7rem",
                fontFamily: "var(--font-data)",
                color: "#4ade80",
              }}
            >
              +{additions}
            </span>
          )}
          {deletions != null && (
            <span
              style={{
                fontSize: "0.7rem",
                fontFamily: "var(--font-data)",
                color: "#f87171",
              }}
            >
              -{deletions}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "8px",
          borderTop: "1px solid var(--border-dim)",
          marginTop: description || hasStats ? "0" : "8px",
        }}
      >
        <span
          style={{
            fontSize: "0.67rem",
            fontFamily: "var(--font-data)",
            color: "var(--text-muted)",
          }}
        >
          {event.repo_owner}/{event.repo_name}
        </span>
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "0.67rem",
            color: "var(--c-opened)",
            textDecoration: "none",
            opacity: 0.65,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.65")}
        >
          View on GitHub →
        </a>
      </div>
    </div>
  );
}
