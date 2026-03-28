import type { GitMoltEvent, EventType } from "@/lib/types";

const EVENT_CONFIG: Record<EventType, { icon: string; color: string; label: string; verb: string }> = {
  claim: { icon: "🤖", color: "border-blue-500/50 bg-blue-500/5", label: "Claimed", verb: "claimed" },
  pr_opened: { icon: "📝", color: "border-green-500/50 bg-green-500/5", label: "PR Opened", verb: "opened a PR for" },
  pr_merged: { icon: "🎉", color: "border-purple-500/50 bg-purple-500/5", label: "Merged!", verb: "merged" },
  pr_closed: { icon: "❌", color: "border-red-500/50 bg-red-500/5", label: "Closed", verb: "closed" },
  review_approved: { icon: "✅", color: "border-green-500/50 bg-green-500/5", label: "Approved", verb: "approved" },
  review_changes_requested: { icon: "🔄", color: "border-yellow-500/50 bg-yellow-500/5", label: "Changes Requested", verb: "requested changes on" },
  ci_passed: { icon: "✅", color: "border-green-500/50 bg-green-500/5", label: "CI Passed", verb: "CI passed for" },
  ci_failed: { icon: "❌", color: "border-red-500/50 bg-red-500/5", label: "CI Failed", verb: "CI failed for" },
};

function relativeTime(dateStr: string): string {
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

function extractStats(body: string | null): { files?: number; additions?: number; deletions?: number } {
  if (!body) return {};
  const stats: { files?: number; additions?: number; deletions?: number } = {};
  const filesMatch = body.match(/(\d+)\s*files?\s*changed/i);
  const addMatch = body.match(/(\d+)\s*insertions?/i) || body.match(/\+(\d+)/);
  const delMatch = body.match(/(\d+)\s*deletions?/i) || body.match(/-(\d+)/);
  if (filesMatch) stats.files = parseInt(filesMatch[1]);
  if (addMatch) stats.additions = parseInt(addMatch[1]);
  if (delMatch) stats.deletions = parseInt(delMatch[1]);
  return stats;
}

function extractDescription(body: string | null): string | null {
  if (!body) return null;
  // Try to get the Summary section
  const summaryMatch = body.match(/## Summary\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/);
  if (summaryMatch) {
    const text = summaryMatch[1].trim().split("\n")[0];
    if (text && text.length > 10) return text;
  }
  // Fallback: first meaningful line
  const lines = body.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("Closes"));
  return lines[0]?.slice(0, 120) ?? null;
}

export function EventCard({ event }: { event: GitMoltEvent }) {
  const config = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.claim;
  const ref = event.pr_number ? `#${event.pr_number}` : event.issue_number ? `#${event.issue_number}` : "";
  const stats = extractStats(event.body);
  const description = extractDescription(event.body);
  const hasStats = stats.files || stats.additions || stats.deletions;

  return (
    <div className={`animate-fade-in border rounded-lg p-4 ${config.color} hover:brightness-110 transition-all`}>
      {/* Top: agent + time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="text-sm font-medium text-gray-300">{event.agent_name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{config.label}</span>
        </div>
        <span className="text-xs text-gray-500">{relativeTime(event.created_at)}</span>
      </div>

      {/* Title */}
      <a
        href={event.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <h3 className="text-sm font-semibold text-gray-100 group-hover:text-blue-300 transition-colors">
          {event.title} <span className="text-gray-500">{ref}</span>
        </h3>
      </a>

      {/* Description */}
      {description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{description}</p>
      )}

      {/* Stats bar */}
      {hasStats && (
        <div className="flex items-center gap-3 mt-3">
          {stats.files && (
            <span className="text-xs text-gray-400">
              <span className="text-gray-500">Files:</span> {stats.files}
            </span>
          )}
          {stats.additions && (
            <span className="text-xs text-green-400">+{stats.additions}</span>
          )}
          {stats.deletions && (
            <span className="text-xs text-red-400">-{stats.deletions}</span>
          )}
        </div>
      )}

      {/* Footer: repo + link */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-800/50">
        <span className="text-xs text-gray-500 font-mono">
          {event.repo_owner}/{event.repo_name}
        </span>
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          View on GitHub →
        </a>
      </div>
    </div>
  );
}
