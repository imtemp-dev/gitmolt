import type { GitMoltClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";
import { classifyError } from "../github/errors.js";
import type { Comment } from "../github/types.js";

const CLAIM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLAIM_SETTLE_MS = 2000; // 2 seconds for race condition window

function isClaimStale(comments: Comment[], hasClaimedLabel: boolean): boolean {
  const claimComment = comments
    .filter(
      (c) =>
        c.user?.login?.endsWith("[bot]") &&
        c.body.includes("Claimed by gitmolt")
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

  // Ghost state: claim comment exists but no label
  if (claimComment && !hasClaimedLabel) return true;

  if (!claimComment) return true;

  const claimAge = Date.now() - new Date(claimComment.created_at).getTime();
  return claimAge > CLAIM_TIMEOUT_MS;
}

export async function handleClaimIssue(
  args: Record<string, unknown>,
  client: GitMoltClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number;

  if (!owner || !repo || !issueNumber) {
    return err("Required: owner, repo, issue_number");
  }

  try {
    const issue = await client.getIssue(owner, repo, issueNumber);

    if (issue.labels.includes("closed")) {
      return err(`Issue ${owner}/${repo}#${issueNumber} is already closed.`);
    }

    // Check if already claimed
    if (issue.isClaimed) {
      const comments = await client.listComments(owner, repo, issueNumber);
      const hasLabel = issue.labels.includes("ai-claimed");
      if (!isClaimStale(comments, hasLabel)) {
        const claimComment = comments.find(
          (c) => c.body.includes("Claimed by gitmolt")
        );
        const age = claimComment
          ? Math.round(
              (Date.now() - new Date(claimComment.created_at).getTime()) /
                60000
            )
          : "?";
        return err(
          `Issue is claimed by another agent (claimed ${age} minutes ago).`
        );
      }
      // Stale claim — proceed to re-claim
    }

    // Post claim comment and capture comment ID
    const { id: commentId } = await client.addComment(
      owner,
      repo,
      issueNumber,
      `🤖 Claimed by gitmolt-agent\n\n⏱️ Timeout: 30 minutes. If no PR is created, this claim will expire.`
    );

    // Wait for concurrent claims to settle
    await new Promise((r) => setTimeout(r, CLAIM_SETTLE_MS));

    // Verify our claim is the most recent
    const latestComments = await client.listComments(owner, repo, issueNumber);
    const claimComments = latestComments.filter(
      (c) => c.body.includes("Claimed by gitmolt")
    );
    const mostRecent = claimComments[0];

    if (mostRecent && mostRecent.id !== commentId) {
      // Another agent claimed after us — back off
      try {
        await client.deleteComment(owner, repo, commentId);
      } catch {
        // Best effort cleanup
      }
      return err("Issue was just claimed by another agent.");
    }

    // Add label — with rollback on failure
    try {
      await client.addLabels(owner, repo, issueNumber, ["ai-claimed"]);
    } catch {
      // Retry once
      try {
        await client.addLabels(owner, repo, issueNumber, ["ai-claimed"]);
      } catch {
        // Rollback: delete our comment to prevent ghost state
        try {
          await client.deleteComment(owner, repo, commentId);
        } catch {
          // Best effort
        }
        return err(
          "Failed to complete claim (network issue). Try again."
        );
      }
    }

    return ok(
      `Claimed ${owner}/${repo}#${issueNumber}: ${issue.title}\n\nYou have 30 minutes to create a PR. Use submit_contribution when ready.`
    );
  } catch (raw) {
    const error = classifyError(raw);
    if (error.kind === "not_found") {
      return err(`Issue ${owner}/${repo}#${issueNumber} not found.`);
    }
    if (error.kind === "not_installed") {
      return err(error.message);
    }
    return err(`Failed to claim issue: ${error.message}`);
  }
}

export async function handleUnclaimIssue(
  args: Record<string, unknown>,
  client: GitMoltClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number;
  const reason = (args.reason as string) || "Available for others to work on.";

  if (!owner || !repo || !issueNumber) {
    return err("Required: owner, repo, issue_number");
  }

  try {
    await client.removeLabel(owner, repo, issueNumber, "ai-claimed");
    await client.addComment(
      owner,
      repo,
      issueNumber,
      `🤖 Released claim. ${reason}`
    );
    return ok(`Released claim on ${owner}/${repo}#${issueNumber}.`);
  } catch (raw) {
    const error = classifyError(raw);
    return err(`Failed to unclaim: ${error.message}`);
  }
}
