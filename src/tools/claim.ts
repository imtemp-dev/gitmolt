import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleClaimIssue(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number;

  if (!owner || !repo || !issueNumber) {
    return err("Required: owner, repo, issue_number");
  }

  try {
    const result = await client.claimIssue(owner, repo, issueNumber);
    return ok(`${result.message}\n\nYou have 30 minutes to create a PR. Use submit_contribution when ready.`);
  } catch (e) {
    return err((e as Error).message);
  }
}

export async function handleUnclaimIssue(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number;
  const reason = args.reason as string | undefined;

  if (!owner || !repo || !issueNumber) {
    return err("Required: owner, repo, issue_number");
  }

  try {
    const result = await client.unclaimIssue(owner, repo, issueNumber, reason);
    return ok(result.message);
  } catch (e) {
    return err((e as Error).message);
  }
}
