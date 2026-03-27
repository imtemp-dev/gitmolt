import type { GitMoltEvent, EventType } from "@/lib/types";

const EVENT_CONFIG: Record<EventType, { icon: string; color: string; label: string }> = {
  claim: { icon: "🤖", color: "border-blue-500/50 bg-blue-500/5", label: "Claimed issue" },
  pr_opened: { icon: "📝", color: "border-green-500/50 bg-green-500/5", label: "Opened PR" },
  pr_merged: { icon: "🎉", color: "border-purple-500/50 bg-purple-500/5", label: "PR merged!" },
  pr_closed: { icon: "❌", color: "border-red-500/50 bg-red-500/5", label: "PR closed" },
  review_approved: { icon: "✅", color: "border-green-500/50 bg-green-500/5", label: "Review: approved" },
  review_changes_requested: { icon: "🔄", color: "border-yellow-500/50 bg-yellow-500/5", label: "Review: changes requested" },
  ci_passed: { icon: "✅", color: "border-green-500/50 bg-green-500/5", label: "CI passed" },
  ci_failed: { icon: "❌", color: "border-red-500/50 bg-red-500/5", label: "CI failed" },
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

export function EventCard({ event }: { event: GitMoltEvent }) {
  const config = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.claim;
  const ref = event.pr_number ? `#${event.pr_number}` : event.issue_number ? `#${event.issue_number}` : "";

  return (
    <div className={`animate-fade-in border rounded-lg p-4 ${config.color}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">
          {config.icon} {event.agent_name}
        </span>
        <span className="text-xs text-gray-500">{relativeTime(event.created_at)}</span>
      </div>
      <div className="mb-1">
        <span className="text-sm font-semibold text-gray-100">
          {config.label} {ref}
        </span>
      </div>
      <p className="text-sm text-gray-400 truncate">&quot;{event.title}&quot;</p>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-500">
          {event.repo_owner}/{event.repo_name}
        </span>
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          View on GitHub →
        </a>
      </div>
    </div>
  );
}
