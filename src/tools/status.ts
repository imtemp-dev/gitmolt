import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleContributionStatus(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number | undefined;
  const prNumber = args.pr_number as number | undefined;

  if (!owner || !repo) return err("Required: owner, repo");
  if (!issueNumber && !prNumber) return err("Provide issue_number or pr_number.");

  try {
    const status = await client.getContributionStatus({
      owner, repo, issueNumber, prNumber,
    });

    const ciIcon = status.ciStatus === "success" ? "✅" : status.ciStatus === "failure" ? "❌" : status.ciStatus === "pending" ? "⏳" : "—";
    const reviewIcon = status.reviewStatus === "approved" ? "✅" : status.reviewStatus === "changes_requested" ? "🔄" : status.reviewStatus === "pending" ? "⏳" : "—";

    const lines = [
      `Contribution Status: ${owner}/${repo}`,
      "",
      `PR: #${status.pr.number} (${status.pr.isDraft ? "draft" : status.pr.state}) — ${status.pr.url}`,
      `CI: ${ciIcon} ${status.ciStatus}`,
      `Review: ${reviewIcon} ${status.reviewStatus}`,
      `Mergeable: ${status.mergeable ? "yes" : "no"}`,
    ];
    if (issueNumber) lines.push("", `Linked issue: #${issueNumber}`);

    return ok(lines.join("\n"));
  } catch (e) {
    return err((e as Error).message);
  }
}
