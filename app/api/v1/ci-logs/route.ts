import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface CILogsRequest {
  owner: string;
  repo: string;
  pr_number: number;
}

export async function POST(request: Request) {
  const body = await parseBody<CILogsRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["owner", "repo", "pr_number"]);
  if (err) return apiError(400, err);

  const { owner, repo, pr_number } = body;

  try {
    const octokit = await getInstallationOctokit(owner, repo);

    // Get PR head SHA
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pr_number });
    const headSha = pr.head.sha;

    // Get check runs
    const { data: checks } = await octokit.rest.checks.listForRef({ owner, repo, ref: headSha });

    const results = checks.check_runs.map((run) => {
      const annotations: { path: string; line: number; message: string }[] = [];

      // Check run annotations contain error details (file, line, message)
      // Note: annotations are only available if the CI system provides them
      // For GitHub Actions, they appear as annotations on the check run

      return {
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        started_at: run.started_at,
        completed_at: run.completed_at,
        output_title: run.output?.title ?? null,
        output_summary: run.output?.summary ? run.output.summary.slice(0, 500) : null,
        output_text: run.output?.text ? run.output.text.slice(0, 1000) : null,
        annotations_count: run.output?.annotations_count ?? 0,
        html_url: run.html_url,
      };
    });

    // Also fetch annotations for failed checks
    const failedChecks = checks.check_runs.filter(
      (r) => r.conclusion === "failure" || r.conclusion === "timed_out"
    );

    const annotationsMap: Record<string, any[]> = {};
    for (const check of failedChecks) {
      try {
        const { data: annots } = await octokit.rest.checks.listAnnotations({
          owner, repo, check_run_id: check.id,
        });
        annotationsMap[check.name] = annots.map((a) => ({
          path: a.path,
          start_line: a.start_line,
          end_line: a.end_line,
          annotation_level: a.annotation_level,
          message: a.message,
          title: a.title,
        }));
      } catch {
        // Annotations not available
      }
    }

    // Overall status
    const hasFailure = checks.check_runs.some(
      (r) => r.conclusion === "failure" || r.conclusion === "timed_out"
    );
    const hasPending = checks.check_runs.some(
      (r) => r.status === "in_progress" || r.status === "queued"
    );
    const overall = checks.check_runs.length === 0
      ? "none"
      : hasFailure ? "failure" : hasPending ? "pending" : "success";

    return apiOk({
      overall,
      total: checks.check_runs.length,
      failed: failedChecks.length,
      head_sha: headSha,
      checks: results,
      annotations: annotationsMap,
    });
  } catch (e: any) {
    if (e.status === 404) return apiError(404, `PR #${pr_number} not found`);
    if (e.message?.includes("not installed")) return apiError(400, e.message);
    return apiError(500, e.message ?? "Failed to fetch CI logs");
  }
}
