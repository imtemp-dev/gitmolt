import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleBrowseIssues(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const repos = (args.repos as string[] | undefined) ?? [];
  const effort = args.effort as "small" | "medium" | "large" | undefined;
  const language = args.language as string | undefined;
  const limit = args.limit as number | undefined;

  const isGlobal = repos.length === 0;

  try {
    const issues = await client.searchIssues({ repos, effort, language, limit });

    if (issues.length === 0) {
      if (isGlobal) {
        return ok("No ai-welcome issues found across GitHub. Try again later or specify repos.");
      }
      return ok("No ai-welcome issues found matching your criteria.");
    }

    const header = isGlobal
      ? `Found ${issues.length} ai-welcome issue(s) across GitHub:\n`
      : `Found ${issues.length} ai-welcome issue(s):\n`;

    const lines = [header];
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const effortTag = issue.effort ? `[effort:${issue.effort}]` : "";
      lines.push(
        `${i + 1}. ${effortTag} ${issue.title}\n   ${issue.owner}/${issue.repo}#${issue.number} — ${issue.url}\n`
      );
    }
    return ok(lines.join("\n"));
  } catch (e) {
    return err(`Failed to search issues: ${(e as Error).message}`);
  }
}
