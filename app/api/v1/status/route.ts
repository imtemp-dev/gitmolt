import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody } from "@/lib/api-utils";

interface StatusRequest {
  owner: string;
  repo: string;
  issue_number?: number;
  pr_number?: number;
}

export async function POST(request: Request) {
  const body = await parseBody<StatusRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");
  if (!body.owner || !body.repo) return apiError(400, "Missing owner or repo");
  if (!body.issue_number && !body.pr_number) return apiError(400, "Provide issue_number or pr_number");

  const { owner, repo } = body;

  try {
    const octokit = await getInstallationOctokit(owner, repo);

    // Resolve PR number
    let prNumber = body.pr_number;
    if (!prNumber && body.issue_number) {
      const { data: prs } = await octokit.rest.pulls.list({
        owner, repo, state: "all", per_page: 30, sort: "created", direction: "desc",
      });
      const match = prs.find(
        (p) => p.head.ref.startsWith(`gitmolt/issue-${body.issue_number}-`) ||
               (p.body ?? "").includes(`Closes #${body.issue_number}`)
      );
      if (!match) return apiError(404, `No contribution PR found for issue #${body.issue_number}`);
      prNumber = match.number;
    }

    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber! });

    // CI status
    let ciStatus = "none";
    try {
      const { data: checks } = await octokit.rest.checks.listForRef({ owner, repo, ref: pr.head.sha });
      const runs = checks.check_runs;
      if (runs.length === 0) ciStatus = "none";
      else if (runs.some((c) => c.conclusion === "failure" || c.conclusion === "timed_out")) ciStatus = "failure";
      else if (runs.some((c) => c.status === "in_progress" || c.status === "queued")) ciStatus = "pending";
      else if (runs.every((c) => c.status === "completed")) ciStatus = "success";
      else ciStatus = "pending";
    } catch {}

    // Review status
    let reviewStatus = "none";
    try {
      const { data: reviews } = await octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber! });
      if (reviews.some((r) => r.state === "APPROVED")) reviewStatus = "approved";
      else if (reviews.some((r) => r.state === "CHANGES_REQUESTED")) reviewStatus = "changes_requested";
      else if (reviews.length > 0) reviewStatus = "pending";
    } catch {}

    return apiOk({
      status: {
        pr: {
          number: pr.number, title: pr.title, url: pr.html_url,
          isDraft: pr.draft ?? false,
          state: pr.merged ? "merged" : pr.state,
        },
        ciStatus,
        reviewStatus,
        mergeable: pr.mergeable ?? false,
      },
    });
  } catch (e: any) {
    if (e.status === 404) return apiError(404, `PR not found`);
    return apiError(500, e.message ?? "Failed to get status");
  }
}
