import type { GitMoltClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";
import { handleBrowseIssues } from "./browse.js";
import { classifyError } from "../github/errors.js";

export async function handleContribute(
  args: Record<string, unknown>,
  client: GitMoltClient
): Promise<ToolResponse> {
  const issueNumber = args.issue_number as number | undefined;
  const owner = args.owner as string | undefined;
  const repo = args.repo as string | undefined;

  // Path B: specific issue
  if (issueNumber) {
    if (!owner || !repo) {
      return err(
        "Provide owner and repo with issue_number (e.g., contribute with owner='foo', repo='bar', issue_number=42)."
      );
    }

    try {
      const issue = await client.getIssue(owner, repo, issueNumber);
      const effortTag = issue.effort ? ` [effort:${issue.effort}]` : "";
      const claimedTag = issue.isClaimed ? " ⚠️ CLAIMED" : "";

      return ok(
        `Issue: ${owner}/${repo}#${issueNumber}${effortTag}${claimedTag}\n\n` +
          `Title: ${issue.title}\n\n` +
          `${issue.body}\n\n` +
          `Labels: ${issue.labels.join(", ")}\n` +
          `URL: ${issue.url}\n\n` +
          `To work on this issue, call claim_issue with owner="${owner}", repo="${repo}", issue_number=${issueNumber}.`
      );
    } catch (raw) {
      const error = classifyError(raw);
      return err(`Failed to fetch issue: ${error.message}`);
    }
  }

  // Path A: discovery mode
  return handleBrowseIssues(args, client);
}
