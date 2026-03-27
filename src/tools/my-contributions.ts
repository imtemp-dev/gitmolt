import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";
import type { Contribution } from "../github/types.js";

const STAGE_ICON: Record<string, string> = {
  claimed: "🤖",
  active: "📝",
  expired: "⚠️",
  merged: "🎉",
  closed: "❌",
};

const CI_ICON: Record<string, string> = {
  success: "✅",
  failure: "❌",
  pending: "⏳",
  none: "—",
};

const REVIEW_ICON: Record<string, string> = {
  approved: "✅",
  changes_requested: "🔄",
  pending: "⏳",
  none: "—",
};

function formatContribution(c: Contribution, index: number): string {
  const icon = STAGE_ICON[c.stage] ?? "?";
  const ref = `${c.owner}/${c.repo}#${c.issueNumber ?? "?"}`;
  const title = c.pr?.title ?? c.issueTitle ?? "Unknown";

  if (c.stage === "claimed" || c.stage === "expired") {
    const expiredTag = c.stage === "expired" ? " (⚠️ timeout expired)" : "";
    return `${index}. ${icon} ${ref} — "${title}"\n   Stage: Claimed → waiting for implementation${expiredTag}`;
  }

  const ci = CI_ICON[c.ciStatus] ?? "—";
  const review = REVIEW_ICON[c.reviewStatus] ?? "—";
  const prInfo = c.pr ? `PR #${c.pr.number} (${c.pr.isDraft ? "draft" : c.pr.state})` : "";
  const mergeInfo = c.stage === "merged" ? " 🎉" : "";

  return `${index}. ${icon} ${ref} — "${title}"\n   ${prInfo} → CI: ${ci} ${c.ciStatus} → Review: ${review} ${c.reviewStatus}${mergeInfo}\n   Branch: ${c.pr?.branch ?? "—"}`;
}

export async function handleMyContributions(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const repos = (args.repos as string[] | undefined) ?? [];

  if (repos.length === 0) {
    return err("No repos specified. Pass repos parameter (e.g., repos: [\"owner/repo\"]).");
  }

  try {
    const contributions = await client.listMyContributions(repos);

    if (contributions.length === 0) {
      return ok("No contributions found. Use browse_issues to find issues to work on.");
    }

    const active = contributions.filter((c) => c.stage === "claimed" || c.stage === "active");
    const completed = contributions.filter((c) => c.stage === "merged");
    const other = contributions.filter((c) => c.stage === "expired" || c.stage === "closed");

    const lines: string[] = [];

    if (active.length > 0) {
      lines.push(`Active Contributions (${active.length}):\n`);
      active.forEach((c, i) => lines.push(formatContribution(c, i + 1)));
      lines.push("");
    }

    if (completed.length > 0) {
      lines.push(`Completed (${completed.length}):`);
      completed.forEach((c) => {
        lines.push(`- ${c.owner}/${c.repo}#${c.issueNumber} — PR #${c.pr?.number} merged ✅`);
      });
      lines.push("");
    }

    if (other.length > 0) {
      lines.push(`Other (${other.length}):`);
      other.forEach((c) => {
        const tag = c.stage === "expired" ? "⚠️ expired" : "❌ closed";
        lines.push(`- ${c.owner}/${c.repo}#${c.issueNumber} — ${tag}`);
      });
    }

    return ok(lines.join("\n"));
  } catch (e) {
    return err(`Failed to fetch contributions: ${(e as Error).message}`);
  }
}
