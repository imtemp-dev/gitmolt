import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleSubmitContribution(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const issueNumber = args.issue_number as number;
  const branchName = args.branch_name as string | undefined;
  const title = args.title as string | undefined;
  const body = args.body as string | undefined;

  if (!owner || !repo || !issueNumber) {
    return err("Required: owner, repo, issue_number");
  }

  try {
    const pr = await client.submitContribution({
      owner, repo, issueNumber, branchName, title, body,
    });
    return ok(
      `Draft PR created: ${pr.url}\n\nBranch: ${pr.branch}\nPR: #${pr.number}\n\nPush your code to the branch and use contribution_status to track CI/review.`
    );
  } catch (e) {
    return err((e as Error).message);
  }
}
