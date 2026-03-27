import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { ok, err } from "../types.js";

export async function handleCILogs(
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  const owner = args.owner as string;
  const repo = args.repo as string;
  const prNumber = args.pr_number as number;

  if (!owner || !repo || !prNumber) {
    return err("Required: owner, repo, pr_number");
  }

  try {
    const result = await client.getCILogs(owner, repo, prNumber);

    const lines: string[] = [
      `CI Status: ${result.overall} (${result.failed}/${result.total} failed)`,
      "",
    ];

    for (const check of result.checks) {
      const icon = check.conclusion === "success" ? "✅" :
        check.conclusion === "failure" ? "❌" :
        check.status === "completed" ? "⚪" : "⏳";
      lines.push(`${icon} ${check.name}: ${check.conclusion ?? check.status}`);
      if (check.output_title) lines.push(`   ${check.output_title}`);
    }

    // Show annotations (error details) for failed checks
    const annotationEntries = Object.entries(result.annotations);
    if (annotationEntries.length > 0) {
      lines.push("", "--- Error Details ---");
      for (const [checkName, annots] of annotationEntries) {
        lines.push(`\n${checkName}:`);
        for (const a of annots.slice(0, 10)) {
          lines.push(`  ${a.path}:${a.start_line} — ${a.message}`);
        }
        if (annots.length > 10) {
          lines.push(`  ... and ${annots.length - 10} more`);
        }
      }
    }

    return ok(lines.join("\n"));
  } catch (e) {
    return err((e as Error).message);
  }
}
