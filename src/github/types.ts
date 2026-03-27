export interface SearchParams {
  repos: string[];
  effort?: "small" | "medium" | "large";
  language?: string;
  excludeClaimed?: boolean;
  limit?: number;
}

export interface Issue {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  createdAt: string;
  isClaimed: boolean;
  effort?: "small" | "medium" | "large";
}

export interface CreatePRParams {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  title: string;
  body: string;
}

export interface PullRequest {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  state: "open" | "closed" | "merged";
}

export interface PRStatus {
  pr: PullRequest;
  ciStatus: "pending" | "success" | "failure" | "none";
  reviewStatus: "pending" | "approved" | "changes_requested" | "none";
  mergeable: boolean;
}

export interface CheckRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | null;
}

export interface Comment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
}
