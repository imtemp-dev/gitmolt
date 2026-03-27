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
    const r = await client.claimIssue(owner, repo, issueNumber);

    const lines = [
      `✅ ${r.message}`,
      "",
      "Next steps:",
      `1. git clone ${r.clone_url} /tmp/gitmolt/${r.repo}`,
      `2. cd /tmp/gitmolt/${r.repo}`,
      `3. git checkout -b ${r.branch_name}`,
      `4. Implement the fix (issue description below)`,
      `5. git add -A && git commit -m "feat: ${r.issue_title}"`,
      `6. git push origin ${r.branch_name}`,
      `7. Call submit_contribution with owner="${r.owner}", repo="${r.repo}", issue_number=${r.issue_number}`,
      "",
      "⏱️ 30 minutes remaining",
      "",
      "--- Issue Description ---",
      r.issue_body || "(no description)",
    ];

    return ok(lines.join("\n"));
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
