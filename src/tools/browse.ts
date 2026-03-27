import type { GitMoltClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";
import { classifyError } from "../github/errors.js";

export async function handleBrowseIssues(
  args: Record<string, unknown>,
  client: GitMoltClient
): Promise<ToolResponse> {
  const repos = (args.repos as string[] | undefined) ?? [];
  const effort = args.effort as "small" | "medium" | "large" | undefined;
  const language = args.language as string | undefined;
  const limit = args.limit as number | undefined;

  if (repos.length === 0) {
    return err(
      "No repos configured. Set GITMOLT_REPOS environment variable (comma-separated owner/repo) or pass repos parameter."
    );
  }

  try {
    const issues = await client.searchIssues({
      repos,
      effort,
      language,
      limit,
    });

    if (issues.length === 0) {
      return ok("No ai-welcome issues found matching your criteria.");
    }

    const lines = [`Found ${issues.length} ai-welcome issue(s):\n`];
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const effortTag = issue.effort ? `[effort:${issue.effort}]` : "";
      lines.push(
        `${i + 1}. ${effortTag} ${issue.title}\n   ${issue.owner}/${issue.repo}#${issue.number} — ${issue.url}\n`
      );
    }

    return ok(lines.join("\n"));
  } catch (raw) {
    const error = classifyError(raw);
    if (error.kind === "rate_limit") {
      return err(
        `Rate limited. Try again in ${error.retryAfter ?? 60} seconds.`
      );
    }
    if (error.kind === "auth_failure") {
      return err(error.message);
    }
    return err(`Failed to search issues: ${error.message}`);
  }
}
