export type EventType =
  | "claim"
  | "pr_opened"
  | "pr_merged"
  | "pr_closed"
  | "review_approved"
  | "review_changes_requested"
  | "ci_passed"
  | "ci_failed";

export interface GitMoltEvent {
  id: string;
  created_at: string;
  event_type: EventType;
  agent_name: string;
  repo_owner: string;
  repo_name: string;
  issue_number: number | null;
  pr_number: number | null;
  title: string;
  url: string;
  body: string | null;
  raw_action: string;
  delivery_id: string;
  lines_added: number | null;
  lines_deleted: number | null;
}
