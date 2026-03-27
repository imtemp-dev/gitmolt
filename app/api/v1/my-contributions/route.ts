import { getInstallationOctokit } from "@/lib/github-app";
import { apiOk, apiError, parseBody, requireFields } from "@/lib/api-utils";

interface ContributionsRequest {
  repos: string[];
}

export async function POST(request: Request) {
  const body = await parseBody<ContributionsRequest>(request);
  if (!body) return apiError(400, "Invalid JSON");

  const err = requireFields(body, ["repos"]);
  if (err) return apiError(400, err);

  const contributions: any[] = [];

  for (const r of body.repos) {
    const [owner, repo] = r.split("/");
    if (!owner || !repo) continue;

    try {
      const octokit = await getInstallationOctokit(owner, repo);

      // Find all gitmolt PRs
      const { data: prs } = await octokit.rest.pulls.list({
        owner, repo, state: "all", per_page: 50, sort: "created", direction: "desc",
      });

      const gitmoltPRs = prs.filter((p) => p.head.ref.startsWith("gitmolt/issue-"));

      for (const pr of gitmoltPRs) {
        // Extract issue number from branch name
        const match = pr.head.ref.match(/^gitmolt\/issue-(\d+)-/);
        const issueNumber = match ? parseInt(match[1], 10) : null;

        // Get CI status
        let ciStatus = "none";
        try {
          const { data: checks } = await octokit.rest.checks.listForRef({
            owner, repo, ref: pr.head.sha,
          });
          const runs = checks.check_runs;
          if (runs.length === 0) ciStatus = "none";
          else if (runs.some((c) => c.conclusion === "failure")) ciStatus = "failure";
          else if (runs.some((c) => c.status === "in_progress" || c.status === "queued")) ciStatus = "pending";
          else if (runs.every((c) => c.status === "completed")) ciStatus = "success";
        } catch {}

        // Get review status
        let reviewStatus = "none";
        try {
          const { data: reviews } = await octokit.rest.pulls.listReviews({
            owner, repo, pull_number: pr.number,
          });
          if (reviews.some((rv) => rv.state === "APPROVED")) reviewStatus = "approved";
          else if (reviews.some((rv) => rv.state === "CHANGES_REQUESTED")) reviewStatus = "changes_requested";
          else if (reviews.length > 0) reviewStatus = "pending";
        } catch {}

        contributions.push({
          owner,
          repo,
          issueNumber,
          pr: {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            state: pr.merged_at ? "merged" : pr.state,
            isDraft: pr.draft ?? false,
            branch: pr.head.ref,
          },
          ciStatus,
          reviewStatus,
          stage: pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "active",
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
        });
      }

      // Also find claimed-but-no-PR issues
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner, repo, labels: "ai-claimed,ai-welcome", state: "open", per_page: 20,
      });

      for (const issue of issues) {
        const hasPR = gitmoltPRs.some((p) => {
          const m = p.head.ref.match(/^gitmolt\/issue-(\d+)-/);
          return m && parseInt(m[1], 10) === issue.number;
        });

        if (!hasPR) {
          // Check claim age
          let claimedAt: string | null = null;
          try {
            const { data: comments } = await octokit.rest.issues.listComments({
              owner, repo, issue_number: issue.number, per_page: 10, sort: "created", direction: "desc",
            });
            const claimComment = comments.find((c) => c.body?.includes("Claimed by gitmolt"));
            if (claimComment) claimedAt = claimComment.created_at;
          } catch {}

          const claimAge = claimedAt ? Date.now() - new Date(claimedAt).getTime() : 0;
          const isExpired = claimAge > 30 * 60 * 1000;

          contributions.push({
            owner,
            repo,
            issueNumber: issue.number,
            pr: null,
            ciStatus: "none",
            reviewStatus: "none",
            stage: isExpired ? "expired" : "claimed",
            issueTitle: issue.title,
            claimedAt,
            createdAt: claimedAt ?? issue.created_at,
            updatedAt: issue.updated_at,
          });
        }
      }
    } catch {
      // Skip repos where app isn't installed
    }
  }

  // Sort: active first, then by date
  contributions.sort((a, b) => {
    const stageOrder: Record<string, number> = { claimed: 0, active: 1, expired: 2, merged: 3, closed: 4 };
    const diff = (stageOrder[a.stage] ?? 5) - (stageOrder[b.stage] ?? 5);
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return apiOk({ contributions });
}
