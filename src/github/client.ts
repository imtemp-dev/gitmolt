import type { Issue, SearchParams, PullRequest, PRStatus } from "./types.js";
import { log } from "../utils/logger.js";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export class GitMoltAPIClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  private async call<T>(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
    const url = `${this.apiUrl}${endpoint}`;
    log("info", `API call: ${endpoint}`, { body });

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await resp.json() as ApiResponse<T>;

    if (!resp.ok || !json.ok) {
      const errorMsg = json.error ?? `API error: ${resp.status}`;
      log("warn", `API error: ${endpoint}`, { status: resp.status, error: errorMsg });
      throw new ApiError(resp.status, errorMsg, json.code);
    }

    return json;
  }

  async searchIssues(params: SearchParams): Promise<Issue[]> {
    const resp = await this.call<{ issues: Issue[] }>("/search", {
      repos: params.repos,
      effort: params.effort,
      language: params.language,
      limit: params.limit,
    });
    return resp.data?.issues ?? [];
  }

  async getIssue(owner: string, repo: string, number: number): Promise<Issue> {
    const resp = await this.call<{ issue: Issue }>("/issue", { owner, repo, number });
    return resp.data!.issue;
  }

  async claimIssue(owner: string, repo: string, issueNumber: number): Promise<{ message: string; issue_title: string }> {
    const resp = await this.call<{ message: string; issue_title: string }>("/claim", {
      owner, repo, issue_number: issueNumber,
    });
    return resp.data!;
  }

  async unclaimIssue(owner: string, repo: string, issueNumber: number, reason?: string): Promise<{ message: string }> {
    const resp = await this.call<{ message: string }>("/unclaim", {
      owner, repo, issue_number: issueNumber, reason,
    });
    return resp.data!;
  }

  async submitContribution(params: {
    owner: string; repo: string; issueNumber: number;
    branchName?: string; title?: string; body?: string;
  }): Promise<PullRequest & { branch: string }> {
    const resp = await this.call<{ pr: PullRequest & { branch: string } }>("/submit", {
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      branch_name: params.branchName,
      title: params.title,
      body: params.body,
    });
    return resp.data!.pr;
  }

  async getContributionStatus(params: {
    owner: string; repo: string; issueNumber?: number; prNumber?: number;
  }): Promise<PRStatus> {
    const resp = await this.call<{ status: PRStatus }>("/status", {
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      pr_number: params.prNumber,
    });
    return resp.data!.status;
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
