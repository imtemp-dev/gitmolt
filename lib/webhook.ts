import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventType } from "./types";

export interface ExtractedEvent {
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

export function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function extractEvent(
  eventName: string,
  payload: any,
  deliveryId: string
): ExtractedEvent | null {
  const repoOwner = payload.repository?.owner?.login ?? "";
  const repoName = payload.repository?.name ?? "";

  if (eventName === "issue_comment" && payload.action === "created") {
    const login = payload.comment?.user?.login ?? "";
    const commentBody = payload.comment?.body ?? "";
    if (login === "gitmolt-app[bot]" && commentBody.includes("Claimed by gitmolt")) {
      return {
        event_type: "claim",
        agent_name: login,
        repo_owner: repoOwner,
        repo_name: repoName,
        issue_number: payload.issue?.number ?? null,
        pr_number: null,
        title: payload.issue?.title ?? "",
        url: payload.comment?.html_url ?? "",
        body: commentBody.slice(0, 500),
        raw_action: payload.action,
        delivery_id: deliveryId,
        lines_added: null,
        lines_deleted: null,
      };
    }
    return null;
  }

  if (eventName === "pull_request") {
    const pr = payload.pull_request;
    const branch = pr?.head?.ref ?? "";
    if (!branch.startsWith("gitmolt/")) return null;

    let eventType: EventType;
    if (payload.action === "opened") {
      eventType = "pr_opened";
    } else if (payload.action === "closed" && pr?.merged) {
      eventType = "pr_merged";
    } else if (payload.action === "closed") {
      eventType = "pr_closed";
    } else {
      return null;
    }

    return {
      event_type: eventType,
      agent_name: pr?.user?.login ?? "",
      repo_owner: repoOwner,
      repo_name: repoName,
      issue_number: null,
      pr_number: pr?.number ?? null,
      title: pr?.title ?? "",
      url: pr?.html_url ?? "",
      body: (pr?.body ?? "").slice(0, 500),
      raw_action: payload.action,
      delivery_id: deliveryId,
      lines_added: eventType === "pr_merged" ? (pr?.additions ?? null) : null,
      lines_deleted: eventType === "pr_merged" ? (pr?.deletions ?? null) : null,
    };
  }

  if (eventName === "pull_request_review" && payload.action === "submitted") {
    const pr = payload.pull_request;
    const branch = pr?.head?.ref ?? "";
    if (!branch.startsWith("gitmolt/")) return null;

    const state = payload.review?.state;
    let eventType: EventType;
    if (state === "approved") {
      eventType = "review_approved";
    } else if (state === "changes_requested") {
      eventType = "review_changes_requested";
    } else {
      return null;
    }

    return {
      event_type: eventType,
      agent_name: payload.review?.user?.login ?? "",
      repo_owner: repoOwner,
      repo_name: repoName,
      issue_number: null,
      pr_number: pr?.number ?? null,
      title: pr?.title ?? "",
      url: payload.review?.html_url ?? "",
      body: (payload.review?.body ?? "").slice(0, 500),
      raw_action: payload.action,
      delivery_id: deliveryId,
      lines_added: null,
      lines_deleted: null,
    };
  }

  if (eventName === "check_suite" && payload.action === "completed") {
    const prs = payload.check_suite?.pull_requests ?? [];
    const match = prs.find((p: any) => p.head?.ref?.startsWith("gitmolt/"));
    if (!match) return null;

    const conclusion = payload.check_suite?.conclusion;
    let eventType: EventType;
    if (conclusion === "success") {
      eventType = "ci_passed";
    } else if (conclusion === "failure") {
      eventType = "ci_failed";
    } else {
      return null;
    }

    const branch = payload.check_suite?.head_branch ?? "";
    const title = branch ? "CI: " + branch.replace("gitmolt/", "") : "CI check";

    return {
      event_type: eventType,
      agent_name: "CI",
      repo_owner: repoOwner,
      repo_name: repoName,
      issue_number: null,
      pr_number: match.number ?? null,
      title,
      url: `https://github.com/${repoOwner}/${repoName}/pull/${match.number}`,
      body: null,
      raw_action: payload.action,
      delivery_id: deliveryId,
      lines_added: null,
      lines_deleted: null,
    };
  }

  return null;
}
