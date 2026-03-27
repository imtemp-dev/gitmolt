import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { err } from "../types.js";
import { handleBrowseIssues } from "./browse.js";
import { handleClaimIssue, handleUnclaimIssue } from "./claim.js";
import { handleSubmitContribution } from "./submit.js";
import { handleContributionStatus } from "./status.js";
import { handleContribute } from "./contribute.js";

export const TOOLS = [
  {
    name: "browse_issues",
    description:
      "Discover ai-welcome labeled issues on GitHub. Filter by effort, language, and repo.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repos: {
          type: "array",
          items: { type: "string" },
          description:
            "Repos to search (owner/repo format). Uses configured repos if omitted.",
        },
        effort: {
          type: "string",
          enum: ["small", "medium", "large"],
          description: "Filter by effort label.",
        },
        language: {
          type: "string",
          description: "Filter by language label (e.g., 'typescript', 'python').",
        },
        limit: {
          type: "number",
          description: "Max results (default: 20, max: 100).",
        },
      },
    },
  },
  {
    name: "claim_issue",
    description:
      "Claim an issue for contribution. Posts a comment and adds ai-claimed label. 30-minute timeout.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string", description: "Repository owner." },
        repo: { type: "string", description: "Repository name." },
        issue_number: { type: "number", description: "Issue number to claim." },
      },
      required: ["owner", "repo", "issue_number"],
    },
  },
  {
    name: "unclaim_issue",
    description: "Release a claimed issue so others can work on it.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: { type: "number" },
        reason: {
          type: "string",
          description: "Why unclaiming (optional).",
        },
      },
      required: ["owner", "repo", "issue_number"],
    },
  },
  {
    name: "submit_contribution",
    description:
      "Create a branch and Draft PR for a claimed issue. Push code to the branch first, then call this.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: { type: "number" },
        branch_name: {
          type: "string",
          description:
            "Branch name with code (auto-computed as gitmolt/issue-N-slug if omitted).",
        },
        title: {
          type: "string",
          description: "PR title (auto-generated if omitted).",
        },
        body: {
          type: "string",
          description: "PR description (auto-generated if omitted).",
        },
      },
      required: ["owner", "repo", "issue_number"],
    },
  },
  {
    name: "contribution_status",
    description:
      "Check the status of a contribution (PR state, CI, review). Provide issue_number or pr_number.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: {
          type: "number",
          description: "Original issue number.",
        },
        pr_number: {
          type: "number",
          description:
            "PR number (auto-detected from issue if omitted).",
        },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "contribute",
    description:
      "Discover issues to contribute to. Browse ai-welcome issues or inspect a specific issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repos: {
          type: "array",
          items: { type: "string" },
          description: "Target repos (uses config default if omitted).",
        },
        effort: {
          type: "string",
          enum: ["small", "medium", "large"],
          description: "Time budget filter.",
        },
        issue_number: {
          type: "number",
          description: "Specific issue to inspect (skips browsing).",
        },
        owner: { type: "string" },
        repo: { type: "string" },
      },
    },
  },
];

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  client: GitMoltAPIClient
): Promise<ToolResponse> {
  switch (name) {
    case "browse_issues":
      return handleBrowseIssues(args, client);
    case "claim_issue":
      return handleClaimIssue(args, client);
    case "unclaim_issue":
      return handleUnclaimIssue(args, client);
    case "submit_contribution":
      return handleSubmitContribution(args, client);
    case "contribution_status":
      return handleContributionStatus(args, client);
    case "contribute":
      return handleContribute(args, client);
    default:
      return err(`Unknown tool: ${name}`);
  }
}
