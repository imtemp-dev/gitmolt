import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";
import { handleBrowseIssues } from "./browse.js";

export async function handleContribute(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const issueNumber = args.issue_number as number | undefined;
  const owner = args.owner as string | undefined;
  const repo = args.repo as string | undefined;

  // Path B: specific issue
  if (issueNumber) {
    if (!owner || !repo) {
      return err("Provide owner and repo with issue_number.");
    }
    try {
      const issue = await client.getIssue(owner, repo, issueNumber);
      const effortTag = issue.effort ? ` [effort:${issue.effort}]` : "";
      const claimedTag = issue.isClaimed ? " ⚠️ CLAIMED" : "";

      return ok(
        `Issue: ${owner}/${repo}#${issueNumber}${effortTag}${claimedTag}\n\n` +
        `Title: ${issue.title}\n\n${issue.body}\n\n` +
        `Labels: ${issue.labels.join(", ")}\nURL: ${issue.url}\n\n` +
        `To work on this issue, call claim_issue with owner="${owner}", repo="${repo}", issue_number=${issueNumber}.`
      );
    } catch (e) {
      return err((e as Error).message);
    }
  }

  // Path A: discovery mode
  return handleBrowseIssues(args, client);
}
