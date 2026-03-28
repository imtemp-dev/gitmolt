import type { GitMoltAPIClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { err } from "../types.js";
import { handleBrowseIssues } from "./browse.js";
import { handleClaimIssue, handleUnclaimIssue } from "./claim.js";
import { handleSubmitContribution } from "./submit.js";
import { handleContributionStatus } from "./status.js";
import { handleContribute } from "./contribute.js";
import { handleMyContributions } from "./my-contributions.js";
import { handleReadFile } from "./read-file.js";
import { handleUpdateFile } from "./update-file.js";
import { handleCILogs } from "./ci-logs.js";

export const TOOLS = [
  {
    name: "browse_issues",
    description:
      "Discover ai-welcome labeled issues on GitHub. Omit repos to search ALL of GitHub for ai-welcome issues.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repos: {
          type: "array",
          items: { type: "string" },
          description:
            "Repos to search (owner/repo format). Omit to search all public GitHub repos globally.",
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
  {
    name: "my_contributions",
    description:
      "View all your active and completed contributions across repos. Shows stage, CI, and review status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repos: {
          type: "array",
          items: { type: "string" },
          description: "Repos to query (owner/repo format).",
        },
      },
      required: ["repos"],
    },
  },
  {
    name: "read_file",
    description:
      "Read a file from a remote GitHub repo. Returns content and sha (needed for update_file).",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string", description: "Repository owner." },
        repo: { type: "string", description: "Repository name." },
        path: { type: "string", description: "File path (e.g., 'src/main.ts')." },
        branch: { type: "string", description: "Branch name (default: repo default branch)." },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "update_file",
    description:
      "Update or create a file on a remote GitHub repo branch. Use read_file first to get the sha for updates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", description: "File path to update." },
        content: { type: "string", description: "New file content (full file, not a diff)." },
        branch: { type: "string", description: "Target branch." },
        message: { type: "string", description: "Commit message." },
        sha: { type: "string", description: "Current file sha from read_file (required for updates, omit for new files)." },
      },
      required: ["owner", "repo", "path", "content", "branch", "message"],
    },
  },
  {
    name: "get_ci_logs",
    description:
      "Get CI check results and error details for a PR. Shows which checks failed and error annotations with file:line.",
    inputSchema: {
      type: "object" as const,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        pr_number: { type: "number", description: "Pull request number." },
      },
      required: ["owner", "repo", "pr_number"],
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
    case "my_contributions":
      return handleMyContributions(args, client);
    case "read_file":
      return handleReadFile(args, client);
    case "update_file":
      return handleUpdateFile(args, client);
    case "get_ci_logs":
      return handleCILogs(args, client);
    default:
      return err(`Unknown tool: ${name}`);
  }
}
