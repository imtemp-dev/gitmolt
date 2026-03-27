import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

const CLAIM_SETTLE_MS = 2000;
const CLAIM_TIMEOUT_MS = 30 * 60 * 1000;

interface ClaimRequest {
  owner: string;
  repo: string;
  issue_number: number;
}

export async function POST(request: Request) {
  const body = await parseBody<ClaimRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["owner", "repo", "issue_number"]);
  if (err) return apiError(400, err);

  const { owner, repo, issue_number } = body;

  try {
    const octokit = await getInstallationOctokit(owner, repo);

    // Get issue
    const { data: issue } = await octokit.rest.issues.get({ owner, repo, issue_number });
    const labels = issue.labels.map((l: any) => (typeof l === "string" ? l : l.name ?? ""));

    // Check if already claimed
    if (labels.includes("ai-claimed")) {
      const { data: comments } = await octokit.rest.issues.listComments({
        owner, repo, issue_number, sort: "created", direction: "desc", per_page: 10,
      });
      const claimComment = comments.find(
        (c) => c.user?.login === "gitmolt-app[bot]" && c.body?.includes("Claimed by gitmolt")
      );
      if (claimComment) {
        const age = Date.now() - new Date(claimComment.created_at).getTime();
        if (age < CLAIM_TIMEOUT_MS) {
          return apiError(409, `Issue is claimed by another agent (${Math.round(age / 60000)} minutes ago)`);
        }
      }
    }

    // Post claim comment
    const { data: comment } = await octokit.rest.issues.createComment({
      owner, repo, issue_number,
      body: `🤖 Claimed by gitmolt-agent\n\n⏱️ Timeout: 30 minutes. If no PR is created, this claim will expire.`,
    });

    // Wait for concurrent claims to settle
    await new Promise((r) => setTimeout(r, CLAIM_SETTLE_MS));

    // Verify our claim is most recent
    const { data: latestComments } = await octokit.rest.issues.listComments({
      owner, repo, issue_number, sort: "created", direction: "desc", per_page: 5,
    });
    const claimComments = latestComments.filter(
      (c) => c.body?.includes("Claimed by gitmolt")
    );
    if (claimComments[0] && claimComments[0].id !== comment.id) {
      try { await octokit.rest.issues.deleteComment({ owner, repo, comment_id: comment.id }); } catch {}
      return apiError(409, "Issue was just claimed by another agent");
    }

    // Add label
    try {
      await octokit.rest.issues.addLabels({ owner, repo, issue_number, labels: ["ai-claimed"] });
    } catch {
      try { await octokit.rest.issues.addLabels({ owner, repo, issue_number, labels: ["ai-claimed"] }); } catch {
        try { await octokit.rest.issues.deleteComment({ owner, repo, comment_id: comment.id }); } catch {}
        return apiError(500, "Failed to complete claim (network issue). Try again.");
      }
    }

    // Compute branch name
    const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const branchName = `gitmolt/issue-${issue_number}-${slug}`;

    return apiOk({
      message: `Claimed ${owner}/${repo}#${issue_number}: ${issue.title}`,
      issue_title: issue.title,
      issue_body: (issue.body ?? "").slice(0, 1000),
      issue_labels: labels,
      clone_url: `git@github.com:${owner}/${repo}.git`,
      branch_name: branchName,
      owner,
      repo,
      issue_number,
    });
  } catch (e: any) {
    if (e.message?.includes("not installed")) return apiError(400, e.message);
    if (e.status === 404) return apiError(404, `Issue ${owner}/${repo}#${issue_number} not found`);
    return apiError(500, e.message ?? "Failed to claim issue");
  }
}
