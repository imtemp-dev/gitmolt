import type { GitMoltClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";
import { classifyError } from "../github/errors.js";

export async function handleContributionStatus(
  args: Record<string, unknown>,
  client: GitMoltClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number | undefined;
  const prNumber = args.pr_number as number | undefined;

  if (!owner || !repo) {
    return err("Required: owner, repo");
  }
  if (!issueNumber && !prNumber) {
    return err("Provide issue_number or pr_number.");
  }

  try {
    // Resolve PR number
    let resolvedPR: number | undefined = prNumber;
    if (!resolvedPR && issueNumber) {
      resolvedPR = (await client.findPRForIssue(owner, repo, issueNumber)) ?? undefined;
      if (!resolvedPR) {
        return err(
          `No contribution PR found for issue #${issueNumber}.`
        );
      }
    }

    const status = await client.getPRStatus(owner, repo, resolvedPR!);
    const ciIcon =
      status.ciStatus === "success"
        ? "✅"
        : status.ciStatus === "failure"
          ? "❌"
          : status.ciStatus === "pending"
            ? "⏳"
            : "—";
    const reviewIcon =
      status.reviewStatus === "approved"
        ? "✅"
        : status.reviewStatus === "changes_requested"
          ? "🔄"
          : status.reviewStatus === "pending"
            ? "⏳"
            : "—";

    const lines = [
      `Contribution Status: ${owner}/${repo}`,
      "",
      `PR: #${status.pr.number} (${status.pr.isDraft ? "draft" : status.pr.state}) — ${status.pr.url}`,
      `CI: ${ciIcon} ${status.ciStatus}`,
      `Review: ${reviewIcon} ${status.reviewStatus}`,
      `Mergeable: ${status.mergeable ? "yes" : "no"}`,
    ];

    if (issueNumber) {
      lines.push("", `Linked issue: #${issueNumber}`);
    }

    return ok(lines.join("\n"));
  } catch (raw) {
    const error = classifyError(raw);
    if (error.kind === "not_found") {
      return err(`PR #${prNumber ?? "?"} not found in ${owner}/${repo}.`);
    }
    return err(`Failed to get status: ${error.message}`);
  }
}
