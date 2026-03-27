# GitMolt MCP Server — Implementation Spec

## 1. Overview

GitMolt MCP Server is a Model Context Protocol server that connects Claude Code sessions to GitHub for AI open source contribution. It enables agents to discover `ai-welcome` labeled issues, claim them, and submit contributions as Draft PRs — all through MCP tool calls.

**Architecture**: Thin MCP layer on top of GitHub's existing infrastructure. No external state store; Git branches serve as checkpoints. GitHub App (`gitmolt[bot]`) handles authentication.

## 2. Configuration

### 2.1 Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GITMOLT_APP_ID` | yes | GitHub App numeric ID | `123456` |
| `GITMOLT_PRIVATE_KEY` | yes | GitHub App private key (PEM) | `-----BEGIN RSA...` |
| `GITMOLT_PRIVATE_KEY_PATH` | no | Path to PEM file (alternative to inline key) | `/path/to/key.pem` |
| `GITMOLT_INSTALLATION_ID` | no | Default installation ID. If set, skip API-based resolution for repos under this installation. Useful for single-org setups. | `78901234` |
| `GITMOLT_REPOS` | no | Comma-separated target repos | `owner/repo1,owner/repo2` |
| `GITMOLT_DEFAULT_EFFORT` | no | Default effort filter | `small` |

**Key resolution**: If both `GITMOLT_PRIVATE_KEY` and `GITMOLT_PRIVATE_KEY_PATH` are set, inline key takes precedence. If `GITMOLT_PRIVATE_KEY_PATH` is set, read file contents at startup.

### 2.2 Config Type

```typescript
// src/config.ts
interface GitMoltConfig {
  appId: string;
  privateKey: string;
  installationId?: number;        // Parsed from GITMOLT_INSTALLATION_ID string in loadConfig
  repos: string[];           // ["owner/repo1", "owner/repo2"]
  defaultEffort?: "small" | "medium" | "large";
}
```

**Validation**: At startup, validate that `appId` is present AND `privateKey` is present (both are independently required). If either is missing, throw `ConfigError` with setup instructions naming the missing variable. If `repos` is empty, server starts but `browse_issues` returns instructions to configure repos.

### 2.3 File: `src/config.ts`

- **Function** `loadConfig(): GitMoltConfig`
  - Reads env vars, resolves private key (inline or file path)
  - Validates required fields
  - Parses `GITMOLT_REPOS` CSV into array
  - Throws `ConfigError` with actionable message on missing required fields
  - Returns frozen config object

## 3. GitHub Client

### 3.1 Auth Setup

```typescript
// src/github/auth.ts
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
```

- **Function** `createGitHubClient(config: GitMoltConfig): Octokit`
  - Creates Octokit instance with `createAppAuth` strategy using App-level JWT auth
  - Configures appId, privateKey from config
  - Does NOT set installationId at Octokit creation time (installation tokens are per-repo)
  - Each API call must use an installation-scoped token obtained via `resolveInstallationId`
  - The `GitMoltClient` class handles this: before each repo operation, it resolves the installationId and creates an installation-scoped Octokit via `octokit.auth({ type: "installation", installationId })`
  - Returns App-level Octokit instance (used for listing installations, not for repo ops)

- **Function** `resolveInstallationId(octokit: Octokit, owner: string, repo: string, defaultInstallationId?: string): Promise<number>`
  - If `defaultInstallationId` is set (from config), use it directly without API call (for single-org setups)
  - Otherwise, calls `octokit.rest.apps.getRepoInstallation({ owner, repo })`
  - Caches result per `owner/repo` key in both cases
  - Throws `AuthError` if app not installed on repo

### 3.2 Client Wrapper

```typescript
// src/github/client.ts
class GitMoltClient {
  private appOctokit: Octokit;                    // App-level, for listing installations
  private installationCache: Map<string, number>;  // "owner/repo" → installationId
  private tokenCache: Map<number, Octokit>;        // installationId → installation-scoped Octokit

  // Get an installation-scoped Octokit for a specific repo.
  // Resolves installationId (cached), then creates/caches Octokit with installation auth.
  private async getRepoOctokit(owner: string, repo: string): Promise<Octokit>;

  constructor(config: GitMoltConfig);

  // Issue operations
  // Groups repos by installation, runs one search per installation.
  // GitHub Search API requires installation-scoped auth; repos in different
  // orgs may have different installation IDs.
  async searchIssues(params: SearchParams): Promise<Issue[]>;
  async getIssue(owner: string, repo: string, number: number): Promise<Issue>;
  async addComment(owner: string, repo: string, number: number, body: string): Promise<void>;
  async addLabels(owner: string, repo: string, number: number, labels: string[]): Promise<void>;
  async removeLabel(owner: string, repo: string, number: number, label: string): Promise<void>;

  // Branch operations
  async getDefaultBranch(owner: string, repo: string): Promise<string>;
  async createBranch(owner: string, repo: string, branchName: string, fromRef?: string): Promise<string>;
  // fromRef defaults to HEAD of default branch. Internally: getDefaultBranch → getRef → createRef

  // PR operations
  async createDraftPR(params: CreatePRParams): Promise<PullRequest>;
  async getPRStatus(owner: string, repo: string, prNumber: number): Promise<PRStatus>;
}
```

### 3.3 Error Handling

All GitHub API calls wrapped with error classification:

```typescript
// src/github/errors.ts
type GitHubErrorKind =
  | "rate_limit"      // 429 or 403 with rate limit header
  | "auth_failure"    // 401, bad credentials
  | "not_found"       // 404, repo/issue doesn't exist
  | "not_installed"   // App not installed on repo
  | "conflict"        // 409, branch already exists
  | "validation"      // 422, invalid input
  | "network"         // ECONNRESET, ETIMEDOUT
  | "unknown";

class GitHubError extends Error {
  kind: GitHubErrorKind;
  status?: number;
  retryAfter?: number; // seconds, for rate limits
}
```

**Retry strategy**:
- `rate_limit`: Wait `retryAfter` seconds, retry once
- `network`: Exponential backoff, max 3 retries (1s, 2s, 4s)
- All others: No retry, return error to user

### 3.4 Types

```typescript
// src/github/types.ts
interface SearchParams {
  repos: string[];                               // ["owner/repo"]
  effort?: "small" | "medium" | "large";
  language?: string;
  excludeClaimed?: boolean;                       // default: true
  limit?: number;                                 // default: 20, max: 100
}

interface Issue {
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

interface CreatePRParams {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  title: string;
  body: string;
}

interface PullRequest {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  state: "open" | "closed" | "merged";
}

interface PRStatus {
  pr: PullRequest;
  ciStatus: "pending" | "success" | "failure" | "none";
  reviewStatus: "pending" | "approved" | "changes_requested" | "none";
  mergeable: boolean;
}

interface CheckRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | null;
}

interface Comment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
}
```

## 4. MCP Tools

### 4.1 Tool: `browse_issues`

**Purpose**: Discover `ai-welcome` labeled issues filtered by effort, language, and repo.

**Input Schema**:
```typescript
{
  type: "object",
  properties: {
    repos: {
      type: "array",
      items: { type: "string" },
      description: "Repos to search (owner/repo format). Uses configured repos if omitted."
    },
    effort: {
      type: "string",
      enum: ["small", "medium", "large"],
      description: "Filter by effort label. Uses default if omitted."
    },
    language: {
      type: "string",
      description: "Filter by language label (e.g., 'typescript', 'python')"
    },
    limit: {
      type: "number",
      description: "Max results (default: 20, max: 100)"
    }
  }
}
```

**Handler logic**:
1. Resolve repos from args or config default
2. If no repos configured, return setup instructions
3. Build GitHub search query: `label:"ai-welcome" is:open repo:{each_repo}`
4. If `excludeClaimed` (default true from SearchParams): append `-label:"ai-claimed"` to exclude already-claimed issues
5. Add effort filter if specified: `label:"effort:{effort}"`
6. Add language filter if specified: `label:"language:{lang}"`
7. Call `client.searchIssues(params)`
8. Format results as numbered list with title, repo, effort, URL

**Output format** (text):
```
Found 3 ai-welcome issues:

1. [effort:small] Fix typo in README
   owner/repo#42 — https://github.com/owner/repo/issues/42

2. [effort:medium] Add input validation to CLI parser
   owner/repo#58 — https://github.com/owner/repo/issues/58

3. [effort:small] Update deprecated API calls
   other/repo#12 — https://github.com/other/repo/issues/12
```

**Error cases**:
- No repos configured → return configuration instructions
- Rate limited → return "Rate limited, try again in {N} seconds"
- Auth failure → return "Authentication failed. Check GITMOLT_APP_ID and GITMOLT_PRIVATE_KEY"
- No results → return "No ai-welcome issues found matching your criteria"

### 4.2 Tool: `claim_issue`

**Purpose**: Claim an issue for contribution by posting a comment and adding `ai-claimed` label.

**Input Schema**:
```typescript
{
  type: "object",
  properties: {
    owner: { type: "string" },
    repo: { type: "string" },
    issue_number: { type: "number" }
  },
  required: ["owner", "repo", "issue_number"]
}
```

**Handler logic**:
1. Fetch current issue state
2. Check if already claimed (has `ai-claimed` label)
   - If claimed, check timestamp of claim comment
   - If claim is older than 30 minutes and no linked PR exists → stale claim, proceed to re-claim
   - If claim is recent → return "Issue already claimed by another agent"
3. Post comment: `🤖 Claimed by gitmolt-agent\n\n⏱️ Timeout: 30 minutes. If no PR is created, this claim will expire.`
4. Add `ai-claimed` label
5. Return confirmation with issue details

**Stale claim detection**:
```typescript
function isClaimStale(comments: Comment[]): boolean {
  const claimComment = comments
    .filter(c => c.user?.login === "gitmolt[bot]" && c.body?.includes("Claimed by"))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (!claimComment) return true; // No claim exists

  const claimAge = Date.now() - new Date(claimComment.created_at).getTime();
  return claimAge > 30 * 60 * 1000; // 30 minutes
}
```

**Stale claim race condition mitigation**: Two agents may detect the same stale claim simultaneously. Both post via the same `gitmolt[bot]` identity, so text matching cannot distinguish them. Instead:
1. Post claim comment → capture the returned comment ID from GitHub API response
2. Wait 2 seconds (allow concurrent comments to settle)
3. Fetch latest comments on the issue
4. Check if OUR comment ID is the most recent claim comment
5. If yes → proceed to add label
6. If no (another claim comment appeared after ours) → delete our comment, return "Issue was just claimed by another agent"

This uses comment ID matching, not text matching, to correctly identify our own comment.

**Acknowledged limitation**: The 2-second window is heuristic and not guaranteed to catch all concurrent claims. A competing agent posting after the window closes will result in duplicate work. This is accepted by design — advisory locking is deliberately imperfect. The project's trust model ("natural selection — better PR wins") treats duplicate work as a bounded cost, not a correctness violation. The 2-second window reduces the probability of duplicates but does not eliminate it. True mutual exclusion would require an external lock service, which contradicts the "no external infrastructure" principle.

**Error cases**:
- Issue not found → "Issue owner/repo#N not found"
- Issue closed → "Issue owner/repo#N is already closed"
- Already claimed (not stale) → "Issue is claimed by another agent (claimed {N} minutes ago)"
- Race condition on stale re-claim → "Issue was just claimed by another agent"
- App not installed → "GitMolt App is not installed on owner/repo"
- **Partial claim recovery**: If comment posted but label addition fails (network error), the handler retries label addition once. If still fails, deletes the claim comment and returns error "Failed to complete claim (network issue). Try again." This prevents ghost state where a comment exists without the label.

**Ghost state detection in `isClaimStale`**: Also checks if `ai-claimed` label is present. If a claim comment exists but no label, treat as ghost state (partial claim) and allow re-claim regardless of timestamp.

### 4.3 Tool: `unclaim_issue`

**Purpose**: Release a claimed issue.

**Input Schema**:
```typescript
{
  type: "object",
  properties: {
    owner: { type: "string" },
    repo: { type: "string" },
    issue_number: { type: "number" },
    reason: { type: "string", description: "Why unclaiming (optional)" }
  },
  required: ["owner", "repo", "issue_number"]
}
```

**Handler logic**:
1. Remove `ai-claimed` label
2. Post comment: `🤖 Released claim. {reason || "Available for others to work on."}`
3. Return confirmation

**Error cases**:
- Issue not found → error
- Not claimed → "Issue is not currently claimed"
- Label removal fails → log warning, still post comment (non-fatal)

### 4.4 Tool: `submit_contribution`

**Purpose**: Create a branch and Draft PR for a claimed issue. **Note**: This tool creates the branch and PR structure. The agent is expected to have already pushed commits to the branch using Git CLI before calling this tool, OR this tool creates an empty branch and the agent pushes code afterwards. The typical flow is: `claim_issue` → agent clones repo & creates branch locally → agent implements & pushes → `submit_contribution` creates the Draft PR pointing to the agent's branch.

**Input Schema**:
```typescript
{
  type: "object",
  properties: {
    owner: { type: "string" },
    repo: { type: "string" },
    issue_number: { type: "number" },
    branch_name: { type: "string", description: "Branch name with code (auto-computed as gitmolt/issue-N-slug if omitted)" },
    title: { type: "string", description: "PR title (auto-generated if omitted)" },
    body: { type: "string", description: "PR description (auto-generated if omitted)" }
  },
  required: ["owner", "repo", "issue_number"]
}
```

**Handler logic**:
1. Verify issue exists and has `ai-claimed` label (we cannot verify ownership since all agents share the same bot identity — this is advisory locking by design; see section 4.2)
2. Get default branch name
3. Resolve branch name: use `branch_name` from args if provided, otherwise compute `gitmolt/issue-{number}-{slug}`
4. Check if branch already exists:
   - If exists → skip creation, use existing branch (agent already pushed code)
   - If not exists → create branch from default branch HEAD
5. Generate PR title: `🤖 Fix: {issue_title}` (or use provided title)
6. Generate PR body with template:
   ```
   Closes #{issue_number}

   ## Summary
   {body or "AI-generated contribution via GitMolt"}

   ## Checklist
   - [ ] Tests pass
   - [ ] No breaking changes

   ---
   🤖 Generated by [GitMolt](https://github.com/imtemp-dev/gitmolt)
   ```
7. Create Draft PR
8. Add `ai-contribution` label to PR
9. Post comment on original issue: `🤖 Draft PR created: {pr_url}`
10. Return PR details (number, URL, branch name)

**Branch naming**:
```typescript
function branchName(issueNumber: number, issueTitle: string): string {
  const slug = issueTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `gitmolt/issue-${issueNumber}-${slug}`;
}
```

**Error cases**:
- Issue not claimed → "Claim the issue first with claim_issue"
- Auth failure → "Cannot push to owner/repo. Check GitMolt App installation."
- PR already exists for this branch → "A PR already exists for this branch. Use contribution_status to check it."

### 4.5 Tool: `contribution_status`

**Purpose**: Check the status of a contribution (PR state, CI, review).

**Input Schema**:
```typescript
{
  type: "object",
  properties: {
    owner: { type: "string" },
    repo: { type: "string" },
    issue_number: { type: "number", description: "Original issue number" },
    pr_number: { type: "number", description: "PR number (auto-detected from issue if omitted)" }
  },
  required: ["owner", "repo"]
  // At least one of issue_number or pr_number must be provided.
  // Validated in handler, not schema (JSON Schema anyOf adds complexity for MCP clients).
  // If both provided, pr_number takes precedence.
}
```

**Handler logic**:
1. If `pr_number` provided, use it directly
2. If `issue_number` provided, search for linked PR:
   - Look for PR with branch matching `gitmolt/issue-{number}-*`
   - Or look for PR body containing `Closes #{issue_number}`
3. Fetch PR details + check runs + reviews
4. Format status report

**Output format**:
```
Contribution Status: owner/repo#123

PR: #456 (draft) — https://github.com/owner/repo/pull/456
Branch: gitmolt/issue-123-fix-typo
CI: ✅ passing (3/3 checks)
Review: ⏳ pending
Mergeable: yes

Linked issue: #123 (open)
```

**CI status aggregation**:
```typescript
function aggregateCIStatus(checkRuns: CheckRun[]): "pending" | "success" | "failure" | "none" {
  if (checkRuns.length === 0) return "none";
  if (checkRuns.some(c => c.conclusion === "failure" || c.conclusion === "timed_out")) return "failure";
  if (checkRuns.some(c => c.status === "in_progress" || c.status === "queued")) return "pending";
  // All completed: success if all succeeded or were skipped/neutral/cancelled
  const completedConclusions = checkRuns.filter(c => c.status === "completed");
  if (completedConclusions.length === checkRuns.length &&
      completedConclusions.every(c => c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral" || c.conclusion === "cancelled")) {
    return "success";
  }
  return "pending"; // Should not reach here if all completed, but safe fallback
}
```

**Error cases**:
- No PR found for issue → "No contribution PR found for issue #N"
- PR not found → "PR #N not found"
- Need either issue_number or pr_number → "Provide issue_number or pr_number"

### 4.6 Tool: `contribute`

**Purpose**: High-level orchestrator. Guides the user through the full contribution flow.

**Input Schema**:
```typescript
{
  type: "object",
  properties: {
    repos: {
      type: "array",
      items: { type: "string" },
      description: "Target repos (uses config default if omitted)"
    },
    effort: {
      type: "string",
      enum: ["small", "medium", "large"],
      description: "Time budget (default: small)"
    },
    issue_number: {
      type: "number",
      description: "Specific issue to work on (skips browsing)"
    },
    owner: { type: "string" },
    repo: { type: "string" }
  }
}
```

**Handler logic**:

**Path A — No issue specified (discovery mode)**:
1. Call `browse_issues` with repos/effort filters
2. Return issue list with instruction: "Pick an issue number to work on, then call `claim_issue`."

**Path B — Issue specified (direct mode)**:
1. Require `owner` and `repo` when `issue_number` is provided. If missing, return error: "Provide owner and repo with issue_number (e.g., contribute with owner='foo', repo='bar', issue_number=42)"
2. Fetch issue details via `getIssue(owner, repo, issue_number)`
3. Return issue details (title, body, labels, URL) with instruction: "Review this issue. If you want to work on it, call `claim_issue`."

This tool is intentionally simple — it helps discover or inspect issues. The actual claiming, implementation, and submission are separate tool calls, keeping the agent in control of each step.

**Note**: This is NOT a fully autonomous orchestrator. The Claude Code agent calls `contribute` to discover, then `claim_issue`, then does its own implementation work, then calls `submit_contribution`. The agent is the orchestrator, not the MCP server.

## 5. MCP Server

### 5.1 Server Setup

```typescript
// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

**Function** `main(): Promise<void>`
1. Load config via `loadConfig()`
2. Create `GitMoltClient` from config
3. Create MCP `Server` with name "gitmolt", version from package.json
4. Register all tools (browse_issues, claim_issue, unclaim_issue, submit_contribution, contribution_status, contribute)
5. Register `ListToolsRequestSchema` handler returning tool definitions
6. Register `CallToolRequestSchema` handler dispatching to tool handlers
7. Connect via `StdioServerTransport`
8. Register SIGTERM/SIGINT handlers for graceful shutdown

### 5.2 Tool Registration

```typescript
const TOOLS: Tool[] = [
  { name: "browse_issues", description: "...", inputSchema: {...} },
  { name: "claim_issue", description: "...", inputSchema: {...} },
  { name: "unclaim_issue", description: "...", inputSchema: {...} },
  { name: "submit_contribution", description: "...", inputSchema: {...} },
  { name: "contribution_status", description: "...", inputSchema: {...} },
  { name: "contribute", description: "...", inputSchema: {...} }
];
```

### 5.3 Tool Dispatch

```typescript
async function handleToolCall(name: string, args: Record<string, unknown>, client: GitMoltClient): Promise<ToolResponse> {
  switch (name) {
    case "browse_issues": return handleBrowseIssues(args, client);
    case "claim_issue": return handleClaimIssue(args, client);
    case "unclaim_issue": return handleUnclaimIssue(args, client);
    case "submit_contribution": return handleSubmitContribution(args, client);
    case "contribution_status": return handleContributionStatus(args, client);
    case "contribute": return handleContribute(args, client);
    default: return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}
```

### 5.4 Logging

All logging to stderr (stdout reserved for MCP JSON-RPC):
```typescript
// src/utils/logger.ts
function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>): void {
  const entry = JSON.stringify({ time: new Date().toISOString(), level, message, ...data });
  process.stderr.write(entry + "\n");
}
```

## 6. File Structure

```
src/
├── server.ts              — MCP server entry point, tool registration, dispatch
├── config.ts              — Environment variable parsing, validation
├── tools/
│   ├── browse.ts          — browse_issues handler
│   ├── claim.ts           — claim_issue + unclaim_issue handlers
│   ├── submit.ts          — submit_contribution handler
│   ├── status.ts          — contribution_status handler
│   └── contribute.ts      — contribute orchestrator handler
├── github/
│   ├── auth.ts            — GitHub App auth, Octokit factory
│   ├── client.ts          — GitMoltClient class, all GitHub API operations
│   ├── errors.ts          — GitHubError class, error classification
│   └── types.ts           — GitHub API type definitions
├── utils/
│   └── logger.ts          — stderr JSON logging
└── types.ts               — shared MCP tool types
```

**`src/types.ts`**: Shared types for MCP tool responses:
```typescript
interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
```

**Total estimated files**: 11
**Total estimated lines**: ~800-1000

## 7. Code Scaffolding

Shows how the pieces connect. Not full implementations — just the skeleton structure.

### 7.1 Entry Point (src/server.ts)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { GitMoltClient } from "./github/client.js";
import { TOOLS, handleToolCall } from "./tools/index.js";
import { log } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new GitMoltClient(config);

  const server = new Server(
    { name: "gitmolt", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    return handleToolCall(name, args ?? {}, client);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "GitMolt MCP server started");
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

main().catch((err) => {
  log("error", "Fatal error", { error: err.message });
  process.exit(1);
});
```

### 7.2 Tool Index (src/tools/index.ts)

```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { GitMoltClient } from "../github/client.js";
import type { ToolResponse } from "../types.js";
import { handleBrowseIssues } from "./browse.js";
import { handleClaimIssue, handleUnclaimIssue } from "./claim.js";
import { handleSubmitContribution } from "./submit.js";
import { handleContributionStatus } from "./status.js";
import { handleContribute } from "./contribute.js";

export const TOOLS: Tool[] = [
  { name: "browse_issues", description: "Discover ai-welcome labeled issues on GitHub", inputSchema: { /* ... */ } },
  { name: "claim_issue", description: "Claim an issue for contribution", inputSchema: { /* ... */ } },
  { name: "unclaim_issue", description: "Release a claimed issue", inputSchema: { /* ... */ } },
  { name: "submit_contribution", description: "Create a Draft PR for a claimed issue", inputSchema: { /* ... */ } },
  { name: "contribution_status", description: "Check contribution PR status", inputSchema: { /* ... */ } },
  { name: "contribute", description: "Discover issues to contribute to", inputSchema: { /* ... */ } },
];

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  client: GitMoltClient
): Promise<ToolResponse> {
  switch (name) {
    case "browse_issues": return handleBrowseIssues(args, client);
    case "claim_issue": return handleClaimIssue(args, client);
    case "unclaim_issue": return handleUnclaimIssue(args, client);
    case "submit_contribution": return handleSubmitContribution(args, client);
    case "contribution_status": return handleContributionStatus(args, client);
    case "contribute": return handleContribute(args, client);
    default: return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}
```

### 7.3 GitHub Client (src/github/client.ts)

```typescript
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import type { GitMoltConfig } from "../config.js";
import type { Issue, SearchParams, CreatePRParams, PullRequest, PRStatus } from "./types.js";
import { classifyError } from "./errors.js";

export class GitMoltClient {
  private appOctokit: Octokit;
  private installationCache = new Map<string, number>();
  private tokenCache = new Map<number, Octokit>();
  private config: GitMoltConfig;

  constructor(config: GitMoltConfig) {
    this.config = config;
    this.appOctokit = new Octokit({ authStrategy: createAppAuth, auth: { appId: config.appId, privateKey: config.privateKey } });
  }

  private async getRepoOctokit(owner: string, repo: string): Promise<Octokit> {
    const key = `${owner}/${repo}`;
    let installationId = this.installationCache.get(key);
    if (!installationId) {
      if (this.config.installationId) {
        installationId = this.config.installationId;
      } else {
        const resp = await this.appOctokit.rest.apps.getRepoInstallation({ owner, repo });
        installationId = resp.data.id;
      }
      this.installationCache.set(key, installationId);
    }
    if (!this.tokenCache.has(installationId)) {
      this.tokenCache.set(installationId, new Octokit({
        authStrategy: createAppAuth,
        auth: { appId: this.config.appId, privateKey: this.config.privateKey, installationId }
      }));
    }
    return this.tokenCache.get(installationId)!;
  }

  async searchIssues(params: SearchParams): Promise<Issue[]> { /* group by installation, search per group */ }
  async getIssue(owner: string, repo: string, number: number): Promise<Issue> { /* ... */ }
  async addComment(owner: string, repo: string, number: number, body: string): Promise<{ id: number }> { /* returns comment ID */ }
  async addLabels(owner: string, repo: string, number: number, labels: string[]): Promise<void> { /* ... */ }
  async removeLabel(owner: string, repo: string, number: number, label: string): Promise<void> { /* ... */ }
  async deleteComment(owner: string, repo: string, commentId: number): Promise<void> { /* ... */ }
  async getDefaultBranch(owner: string, repo: string): Promise<string> { /* ... */ }
  async createBranch(owner: string, repo: string, branchName: string, fromRef?: string): Promise<string> { /* ... */ }
  async branchExists(owner: string, repo: string, branchName: string): Promise<boolean> { /* ... */ }
  async createDraftPR(params: CreatePRParams): Promise<PullRequest> { /* ... */ }
  async getPRStatus(owner: string, repo: string, prNumber: number): Promise<PRStatus> { /* ... */ }
  async listComments(owner: string, repo: string, issueNumber: number): Promise<Comment[]> { /* ... */ }
}
```

### 7.4 Config (src/config.ts)

```typescript
export interface GitMoltConfig {
  appId: string;
  privateKey: string;
  installationId?: number;
  repos: string[];
  defaultEffort?: "small" | "medium" | "large";
}

export class ConfigError extends Error { constructor(message: string) { super(message); this.name = "ConfigError"; } }

export function loadConfig(): GitMoltConfig {
  const appId = process.env.GITMOLT_APP_ID;
  const privateKey = process.env.GITMOLT_PRIVATE_KEY ?? readKeyFile(process.env.GITMOLT_PRIVATE_KEY_PATH);
  if (!appId) throw new ConfigError("Missing GITMOLT_APP_ID");
  if (!privateKey) throw new ConfigError("Missing GITMOLT_PRIVATE_KEY or GITMOLT_PRIVATE_KEY_PATH");
  return Object.freeze({
    appId,
    privateKey,
    installationId: process.env.GITMOLT_INSTALLATION_ID ? parseInt(process.env.GITMOLT_INSTALLATION_ID, 10) : undefined,
    repos: (process.env.GITMOLT_REPOS ?? "").split(",").filter(Boolean),
    defaultEffort: parseEffort(process.env.GITMOLT_DEFAULT_EFFORT),
  });
}
```

## 8. Test Scenarios

### Happy Path
1. Configure env vars → server starts → tools listed
2. browse_issues → returns ai-welcome issues from configured repos
3. claim_issue → posts comment, adds label, returns confirmation
4. submit_contribution → creates branch, opens draft PR, links to issue
5. contribution_status → shows PR status with CI and review state

### Error Paths
1. Missing config → clear error message with setup instructions
2. App not installed on repo → actionable error
3. Rate limited → shows retry time
4. Issue already claimed (not stale) → blocks claim
5. Stale claim (>30min, no PR) → allows re-claim
6. Branch already exists → directs to contribution_status
7. Network failure → retries with backoff, then error

### Edge Cases
1. Repo with no ai-welcome issues → "No issues found"
2. Issue closed while claiming → "Issue is already closed"
3. Multiple repos, some with app installed, some not → partial results with warnings
4. Very long issue title → branch name truncated to 40 chars
5. Private key as file path vs inline → both work
6. No repos configured → setup instructions returned
