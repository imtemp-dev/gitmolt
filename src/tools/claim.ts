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

    const isSmall = r.issue_labels.includes("effort:small");

    const lines = [
      `✅ ${r.message}`,
      "",
    ];

    if (isSmall) {
      // Small changes: use read_file + update_file (no git clone needed)
      lines.push(
        "Next steps (small change — no git clone needed):",
        `1. read_file owner="${r.owner}" repo="${r.repo}" path="<file>" branch="${r.branch_name}"`,
        `2. Analyze the code and decide what to change`,
        `3. update_file owner="${r.owner}" repo="${r.repo}" path="<file>" content="<new content>" branch="${r.branch_name}" message="feat: ${r.issue_title}"`,
        `4. submit_contribution owner="${r.owner}" repo="${r.repo}" issue_number=${r.issue_number} branch_name="${r.branch_name}"`,
        `5. get_ci_logs owner="${r.owner}" repo="${r.repo}" pr_number=<pr_number> (if CI fails)`,
      );
    } else {
      // Larger changes: use git clone
      lines.push(
        "Next steps (git clone for multi-file changes):",
        `1. git clone ${r.clone_url} /tmp/gitmolt/${r.repo}`,
        `2. cd /tmp/gitmolt/${r.repo} && git checkout -b ${r.branch_name}`,
        `3. Implement the fix`,
        `4. git add -A && git commit -m "feat: ${r.issue_title}" && git push origin ${r.branch_name}`,
        `5. submit_contribution owner="${r.owner}" repo="${r.repo}" issue_number=${r.issue_number}`,
        "",
        "Or for small edits within the change, use read_file + update_file tools.",
      );
    }

    lines.push(
      "",
      "⏱️ 30 minutes remaining",
      "💡 Save discoveries with context_save to pass knowledge to future agents.",
      "",
      "--- Issue Description ---",
      r.issue_body || "(no description)",
    );

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
