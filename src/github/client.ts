import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import type { GitMoltConfig } from "../config.js";
import type {
  Issue,
  SearchParams,
  CreatePRParams,
  PullRequest,
  PRStatus,
  CheckRun,
  Comment,
} from "./types.js";
import { classifyError, GitHubError, withRetry } from "./errors.js";
import { log } from "../utils/logger.js";

export class GitMoltClient {
  private appOctokit: Octokit;
  private installationCache = new Map<string, number>();
  private tokenCache = new Map<number, Octokit>();
  private config: GitMoltConfig;

  constructor(config: GitMoltConfig) {
    this.config = config;
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: config.appId, privateKey: config.privateKey },
    });
  }

  private async getRepoOctokit(owner: string, repo: string): Promise<Octokit> {
    const key = `${owner}/${repo}`;
    let installationId = this.installationCache.get(key);

    if (!installationId) {
      if (this.config.installationId) {
        installationId = this.config.installationId;
      } else {
        try {
          const resp = await this.appOctokit.rest.apps.getRepoInstallation({
            owner,
            repo,
          });
          installationId = resp.data.id;
        } catch (e) {
          throw new GitHubError(
            "not_installed",
            `GitMolt App is not installed on ${owner}/${repo}. Install it at https://github.com/apps/gitmolt.`
          );
        }
      }
      this.installationCache.set(key, installationId);
    }

    if (!this.tokenCache.has(installationId)) {
      this.tokenCache.set(
        installationId,
        new Octokit({
          authStrategy: createAppAuth,
          auth: {
            appId: this.config.appId,
            privateKey: this.config.privateKey,
            installationId,
          },
        })
      );
    }

    return this.tokenCache.get(installationId)!;
  }

  async searchIssues(params: SearchParams): Promise<Issue[]> {
    const repos = params.repos;
    const excludeClaimed = params.excludeClaimed ?? true;
    const limit = Math.min(params.limit ?? 20, 100);

    // Group repos by installation
    const reposByInstallation = new Map<number, string[]>();
    for (const r of repos) {
      const [owner, repo] = r.split("/");
      try {
        const octokit = await this.getRepoOctokit(owner, repo);
        const installationId = this.installationCache.get(r)!;
        if (!reposByInstallation.has(installationId)) {
          reposByInstallation.set(installationId, []);
        }
        reposByInstallation.get(installationId)!.push(r);
      } catch (e) {
        log("warn", `Skipping ${r}: ${(e as Error).message}`);
      }
    }

    const allIssues: Issue[] = [];

    for (const [installationId, repoGroup] of reposByInstallation) {
      const octokit = this.tokenCache.get(installationId)!;
      let query = repoGroup.map((r) => `repo:${r}`).join(" ");
      query += ` label:"ai-welcome" is:open`;
      if (excludeClaimed) query += ` -label:"ai-claimed"`;
      if (params.effort) query += ` label:"effort:${params.effort}"`;
      if (params.language) query += ` label:"language:${params.language}"`;

      try {
        const result = await withRetry(() =>
          octokit.rest.search.issuesAndPullRequests({
            q: query,
            sort: "created",
            order: "desc",
            per_page: limit,
          })
        );

        for (const item of result.data.items) {
          const [itemOwner, itemRepo] = item.repository_url
            .replace("https://api.github.com/repos/", "")
            .split("/");
          const labels = item.labels.map((l) =>
            typeof l === "string" ? l : l.name ?? ""
          );
          allIssues.push({
            owner: itemOwner,
            repo: itemRepo,
            number: item.number,
            title: item.title,
            body: item.body ?? "",
            labels,
            url: item.html_url,
            createdAt: item.created_at,
            isClaimed: labels.includes("ai-claimed"),
            effort: parseEffortLabel(labels),
          });
        }
      } catch (e) {
        log("warn", `Search failed for installation ${installationId}`, {
          error: (e as Error).message,
        });
      }
    }

    return allIssues.slice(0, limit);
  }

  async getIssue(
    owner: string,
    repo: string,
    number: number
  ): Promise<Issue> {
    const octokit = await this.getRepoOctokit(owner, repo);
    const { data } = await withRetry(() =>
      octokit.rest.issues.get({ owner, repo, issue_number: number })
    );
    const labels = data.labels.map((l) =>
      typeof l === "string" ? l : l.name ?? ""
    );
    return {
      owner,
      repo,
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      labels,
      url: data.html_url,
      createdAt: data.created_at,
      isClaimed: labels.includes("ai-claimed"),
      effort: parseEffortLabel(labels),
    };
  }

  async addComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<{ id: number }> {
    const octokit = await this.getRepoOctokit(owner, repo);
    const { data } = await withRetry(() =>
      octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body,
      })
    );
    return { id: data.id };
  }

  async deleteComment(
    owner: string,
    repo: string,
    commentId: number
  ): Promise<void> {
    const octokit = await this.getRepoOctokit(owner, repo);
    await withRetry(() =>
      octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: commentId,
      })
    );
  }

  async addLabels(
    owner: string,
    repo: string,
    number: number,
    labels: string[]
  ): Promise<void> {
    const octokit = await this.getRepoOctokit(owner, repo);
    await withRetry(() =>
      octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: number,
        labels,
      })
    );
  }

  async removeLabel(
    owner: string,
    repo: string,
    number: number,
    label: string
  ): Promise<void> {
    const octokit = await this.getRepoOctokit(owner, repo);
    try {
      await withRetry(() =>
        octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: number,
          name: label,
        })
      );
    } catch {
      log("warn", `Failed to remove label ${label} from ${owner}/${repo}#${number}`);
    }
  }

  async listComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<Comment[]> {
    const octokit = await this.getRepoOctokit(owner, repo);
    const { data } = await withRetry(() =>
      octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        sort: "created",
        direction: "desc",
        per_page: 30,
      })
    );
    return data.map((c) => ({
      id: c.id,
      body: c.body ?? "",
      user: c.user ? { login: c.user.login } : null,
      created_at: c.created_at,
    }));
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const octokit = await this.getRepoOctokit(owner, repo);
    const { data } = await withRetry(() =>
      octokit.rest.repos.get({ owner, repo })
    );
    return data.default_branch;
  }

  async branchExists(
    owner: string,
    repo: string,
    branchName: string
  ): Promise<boolean> {
    const octokit = await this.getRepoOctokit(owner, repo);
    try {
      await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromRef?: string
  ): Promise<string> {
    const octokit = await this.getRepoOctokit(owner, repo);
    const base = fromRef ?? (await this.getDefaultBranch(owner, repo));
    const { data: refData } = await withRetry(() =>
      octokit.rest.git.getRef({ owner, repo, ref: `heads/${base}` })
    );
    await withRetry(() =>
      octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      })
    );
    return branchName;
  }

  async createDraftPR(params: CreatePRParams): Promise<PullRequest> {
    const { owner, repo, issueNumber, branchName, title, body } = params;
    const octokit = await this.getRepoOctokit(owner, repo);
    const defaultBranch = await this.getDefaultBranch(owner, repo);

    const { data } = await withRetry(() =>
      octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: branchName,
        base: defaultBranch,
        draft: true,
      })
    );

    // Add ai-contribution label
    try {
      await this.addLabels(owner, repo, data.number, ["ai-contribution"]);
    } catch {
      log("warn", "Failed to add ai-contribution label to PR");
    }

    // Link to original issue
    try {
      await this.addComment(
        owner,
        repo,
        issueNumber,
        `🤖 Draft PR created: ${data.html_url}`
      );
    } catch {
      log("warn", "Failed to post PR link comment on issue");
    }

    return {
      owner,
      repo,
      number: data.number,
      title: data.title,
      url: data.html_url,
      isDraft: data.draft ?? true,
      state: "open",
    };
  }

  async getPRStatus(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRStatus> {
    const octokit = await this.getRepoOctokit(owner, repo);

    const { data: pr } = await withRetry(() =>
      octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    );

    // Get check runs
    let ciStatus: PRStatus["ciStatus"] = "none";
    try {
      const { data: checks } = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });
      ciStatus = aggregateCIStatus(
        checks.check_runs.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status as CheckRun["status"],
          conclusion: c.conclusion as CheckRun["conclusion"],
        }))
      );
    } catch {
      // No checks API access
    }

    // Get reviews
    let reviewStatus: PRStatus["reviewStatus"] = "none";
    try {
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });
      if (reviews.some((r) => r.state === "APPROVED")) {
        reviewStatus = "approved";
      } else if (reviews.some((r) => r.state === "CHANGES_REQUESTED")) {
        reviewStatus = "changes_requested";
      } else if (reviews.length > 0) {
        reviewStatus = "pending";
      }
    } catch {
      // No review access
    }

    return {
      pr: {
        owner,
        repo,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        isDraft: pr.draft ?? false,
        state: pr.merged ? "merged" : (pr.state as "open" | "closed"),
      },
      ciStatus,
      reviewStatus,
      mergeable: pr.mergeable ?? false,
    };
  }

  async findPRForIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<number | null> {
    const octokit = await this.getRepoOctokit(owner, repo);
    const { data: prs } = await withRetry(() =>
      octokit.rest.pulls.list({
        owner,
        repo,
        state: "all",
        per_page: 30,
        sort: "created",
        direction: "desc",
      })
    );
    const branchPrefix = `gitmolt/issue-${issueNumber}-`;
    const match = prs.find(
      (p) =>
        p.head.ref.startsWith(branchPrefix) ||
        (p.body ?? "").includes(`Closes #${issueNumber}`)
    );
    return match?.number ?? null;
  }
}

function parseEffortLabel(
  labels: string[]
): "small" | "medium" | "large" | undefined {
  for (const l of labels) {
    if (l === "effort:small") return "small";
    if (l === "effort:medium") return "medium";
    if (l === "effort:large") return "large";
  }
  return undefined;
}

function aggregateCIStatus(checkRuns: CheckRun[]): PRStatus["ciStatus"] {
  if (checkRuns.length === 0) return "none";
  if (
    checkRuns.some(
      (c) => c.conclusion === "failure" || c.conclusion === "timed_out"
    )
  )
    return "failure";
  if (
    checkRuns.some(
      (c) => c.status === "in_progress" || c.status === "queued"
    )
  )
    return "pending";
  const completed = checkRuns.filter((c) => c.status === "completed");
  if (
    completed.length === checkRuns.length &&
    completed.every(
      (c) =>
        c.conclusion === "success" ||
        c.conclusion === "skipped" ||
        c.conclusion === "neutral" ||
        c.conclusion === "cancelled"
    )
  ) {
    return "success";
  }
  return "pending";
}
