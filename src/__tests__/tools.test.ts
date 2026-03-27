import { describe, it, expect, vi } from "vitest";
import { handleBrowseIssues } from "../tools/browse.js";
import { handleClaimIssue, handleUnclaimIssue } from "../tools/claim.js";
import { handleSubmitContribution } from "../tools/submit.js";
import { handleContributionStatus } from "../tools/status.js";
import { handleContribute } from "../tools/contribute.js";
import { handleMyContributions } from "../tools/my-contributions.js";
import { handleReadFile } from "../tools/read-file.js";
import { handleUpdateFile } from "../tools/update-file.js";
import { handleCILogs } from "../tools/ci-logs.js";
import type { GitMoltAPIClient } from "../github/client.js";

function mockClient(overrides: Partial<Record<keyof GitMoltAPIClient, any>> = {}): GitMoltAPIClient {
  return {
    searchIssues: vi.fn().mockResolvedValue([]),
    getIssue: vi.fn().mockResolvedValue({
      owner: "test", repo: "repo", number: 42, title: "Fix bug",
      body: "Details", labels: ["ai-welcome"], url: "https://github.com/test/repo/issues/42",
      createdAt: "2026-03-27T00:00:00Z", isClaimed: false, effort: "small",
    }),
    claimIssue: vi.fn().mockResolvedValue({
      message: "Claimed test/repo#42: Fix bug", issue_title: "Fix bug",
      issue_body: "Details here", issue_labels: ["ai-welcome", "effort:small"],
      clone_url: "git@github.com:test/repo.git", branch_name: "gitmolt/issue-42-fix-bug",
      owner: "test", repo: "repo", issue_number: 42,
    }),
    listMyContributions: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue({ content: "hello world", sha: "abc123", size: 11 }),
    updateFile: vi.fn().mockResolvedValue({ commit_sha: "def456", message: "Updated file.ts on main" }),
    getCILogs: vi.fn().mockResolvedValue({
      overall: "success", total: 2, failed: 0, head_sha: "abc",
      checks: [{ name: "build", status: "completed", conclusion: "success", output_title: null, output_summary: null, html_url: null }],
      annotations: {},
    }),
    unclaimIssue: vi.fn().mockResolvedValue({ message: "Released claim on test/repo#42" }),
    submitContribution: vi.fn().mockResolvedValue({
      number: 100, url: "https://github.com/test/repo/pull/100",
      branch: "gitmolt/issue-42-fix-bug", isDraft: true, state: "open",
    }),
    getContributionStatus: vi.fn().mockResolvedValue({
      pr: { number: 100, title: "Fix bug", url: "https://github.com/test/repo/pull/100", isDraft: true, state: "open" },
      ciStatus: "success", reviewStatus: "pending", mergeable: true,
    }),
    ...overrides,
  } as unknown as GitMoltAPIClient;
}

describe("browse_issues", () => {
  it("returns error when no repos", async () => {
    const result = await handleBrowseIssues({}, mockClient());
    expect(result.isError).toBe(true);
  });

  it("returns formatted issue list", async () => {
    const client = mockClient({
      searchIssues: vi.fn().mockResolvedValue([
        { owner: "test", repo: "repo", number: 42, title: "Fix bug", labels: ["ai-welcome"], url: "https://github.com/test/repo/issues/42", effort: "small" },
      ]),
    });
    const result = await handleBrowseIssues({ repos: ["test/repo"] }, client);
    expect(result.content[0].text).toContain("Found 1");
    expect(result.content[0].text).toContain("Fix bug");
  });

  it("returns no-results message", async () => {
    const result = await handleBrowseIssues({ repos: ["test/repo"] }, mockClient());
    expect(result.content[0].text).toContain("No ai-welcome issues");
  });
});

describe("claim_issue", () => {
  it("claims successfully", async () => {
    const client = mockClient();
    const result = await handleClaimIssue({ owner: "test", repo: "repo", issue_number: 42 }, client);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Claimed");
    expect(client.claimIssue).toHaveBeenCalledWith("test", "repo", 42);
  });

  it("returns error for missing params", async () => {
    const result = await handleClaimIssue({}, mockClient());
    expect(result.isError).toBe(true);
  });

  it("returns API error message", async () => {
    const client = mockClient({ claimIssue: vi.fn().mockRejectedValue(new Error("Issue is claimed")) });
    const result = await handleClaimIssue({ owner: "test", repo: "repo", issue_number: 42 }, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("claimed");
  });
});

describe("unclaim_issue", () => {
  it("unclaims successfully", async () => {
    const client = mockClient();
    const result = await handleUnclaimIssue({ owner: "test", repo: "repo", issue_number: 42 }, client);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Released");
  });
});

describe("submit_contribution", () => {
  it("submits successfully", async () => {
    const client = mockClient();
    const result = await handleSubmitContribution({ owner: "test", repo: "repo", issue_number: 42 }, client);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Draft PR created");
    expect(result.content[0].text).toContain("#100");
  });

  it("returns error for missing params", async () => {
    const result = await handleSubmitContribution({}, mockClient());
    expect(result.isError).toBe(true);
  });
});

describe("contribution_status", () => {
  it("shows PR status", async () => {
    const client = mockClient();
    const result = await handleContributionStatus({ owner: "test", repo: "repo", pr_number: 100 }, client);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("PR: #100");
    expect(result.content[0].text).toContain("success");
  });

  it("requires issue_number or pr_number", async () => {
    const result = await handleContributionStatus({ owner: "test", repo: "repo" }, mockClient());
    expect(result.isError).toBe(true);
  });
});

describe("contribute", () => {
  it("browses in discovery mode", async () => {
    const client = mockClient({
      searchIssues: vi.fn().mockResolvedValue([
        { owner: "test", repo: "repo", number: 42, title: "Fix bug", labels: [], url: "https://...", effort: "small" },
      ]),
    });
    const result = await handleContribute({ repos: ["test/repo"] }, client);
    expect(result.content[0].text).toContain("Found 1");
  });

  it("shows issue details in direct mode", async () => {
    const result = await handleContribute({ owner: "test", repo: "repo", issue_number: 42 }, mockClient());
    expect(result.content[0].text).toContain("Issue: test/repo#42");
    expect(result.content[0].text).toContain("claim_issue");
  });

  it("errors without owner/repo in direct mode", async () => {
    const result = await handleContribute({ issue_number: 42 }, mockClient());
    expect(result.isError).toBe(true);
  });
});

describe("claim_issue (effort-based guidance)", () => {
  it("shows read_file/update_file flow for effort:small", async () => {
    const client = mockClient(); // mock has effort:small in issue_labels
    const result = await handleClaimIssue({ owner: "test", repo: "repo", issue_number: 42 }, client);
    expect(result.content[0].text).toContain("read_file");
    expect(result.content[0].text).toContain("update_file");
    expect(result.content[0].text).toContain("submit_contribution");
    expect(result.content[0].text).toContain("no git clone needed");
    expect(result.content[0].text).toContain("30 minutes");
  });

  it("shows git clone flow for non-small effort", async () => {
    const client = mockClient({
      claimIssue: vi.fn().mockResolvedValue({
        message: "Claimed test/repo#42: Fix bug", issue_title: "Fix bug",
        issue_body: "Details", issue_labels: ["ai-welcome", "effort:medium"],
        clone_url: "git@github.com:test/repo.git", branch_name: "gitmolt/issue-42-fix-bug",
        owner: "test", repo: "repo", issue_number: 42,
      }),
    });
    const result = await handleClaimIssue({ owner: "test", repo: "repo", issue_number: 42 }, client);
    expect(result.content[0].text).toContain("git clone");
    expect(result.content[0].text).toContain("git push");
  });
});

describe("my_contributions", () => {
  it("returns error when no repos", async () => {
    const result = await handleMyContributions({}, mockClient());
    expect(result.isError).toBe(true);
  });

  it("returns no-contributions message", async () => {
    const result = await handleMyContributions({ repos: ["test/repo"] }, mockClient());
    expect(result.content[0].text).toContain("No contributions found");
  });

  it("formats active contributions", async () => {
    const client = mockClient({
      listMyContributions: vi.fn().mockResolvedValue([
        {
          owner: "test", repo: "repo", issueNumber: 42,
          pr: { number: 100, title: "Fix bug", url: "https://...", state: "open", isDraft: true, branch: "gitmolt/issue-42-fix" },
          ciStatus: "success", reviewStatus: "pending", stage: "active",
          createdAt: "2026-03-27T00:00:00Z", updatedAt: "2026-03-27T00:00:00Z",
        },
      ]),
    });
    const result = await handleMyContributions({ repos: ["test/repo"] }, client);
    expect(result.content[0].text).toContain("Active Contributions");
    expect(result.content[0].text).toContain("PR #100");
    expect(result.content[0].text).toContain("success");
  });

  it("formats merged contributions", async () => {
    const client = mockClient({
      listMyContributions: vi.fn().mockResolvedValue([
        {
          owner: "test", repo: "repo", issueNumber: 1,
          pr: { number: 3, title: "Fix", url: "https://...", state: "merged", isDraft: false, branch: "gitmolt/issue-1" },
          ciStatus: "success", reviewStatus: "approved", stage: "merged",
          createdAt: "2026-03-27T00:00:00Z", updatedAt: "2026-03-27T00:00:00Z",
        },
      ]),
    });
    const result = await handleMyContributions({ repos: ["test/repo"] }, client);
    expect(result.content[0].text).toContain("Completed");
    expect(result.content[0].text).toContain("merged ✅");
  });

  it("formats expired claims", async () => {
    const client = mockClient({
      listMyContributions: vi.fn().mockResolvedValue([
        {
          owner: "test", repo: "repo", issueNumber: 2, pr: null,
          ciStatus: "none", reviewStatus: "none", stage: "expired",
          issueTitle: "Add feature", createdAt: "2026-03-27T00:00:00Z", updatedAt: "2026-03-27T00:00:00Z",
        },
      ]),
    });
    const result = await handleMyContributions({ repos: ["test/repo"] }, client);
    expect(result.content[0].text).toContain("expired");
  });
});

describe("read_file", () => {
  it("reads file successfully", async () => {
    const result = await handleReadFile({ owner: "test", repo: "repo", path: "src/main.ts" }, mockClient());
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("hello world");
    expect(result.content[0].text).toContain("sha: abc123");
  });

  it("returns error for missing params", async () => {
    const result = await handleReadFile({}, mockClient());
    expect(result.isError).toBe(true);
  });
});

describe("update_file", () => {
  it("updates file successfully", async () => {
    const result = await handleUpdateFile({
      owner: "test", repo: "repo", path: "src/main.ts",
      content: "new content", branch: "fix-branch", message: "fix: update",
    }, mockClient());
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Updated");
    expect(result.content[0].text).toContain("def456");
  });

  it("returns error for missing params", async () => {
    const result = await handleUpdateFile({}, mockClient());
    expect(result.isError).toBe(true);
  });
});

describe("get_ci_logs", () => {
  it("shows CI status", async () => {
    const result = await handleCILogs({ owner: "test", repo: "repo", pr_number: 100 }, mockClient());
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("CI Status: success");
    expect(result.content[0].text).toContain("build");
  });

  it("shows error details for failures", async () => {
    const client = mockClient({
      getCILogs: vi.fn().mockResolvedValue({
        overall: "failure", total: 1, failed: 1, head_sha: "abc",
        checks: [{ name: "test", status: "completed", conclusion: "failure", output_title: "Tests failed", output_summary: null, html_url: null }],
        annotations: { test: [{ path: "src/main.ts", start_line: 42, message: "undefined variable", annotation_level: "failure" }] },
      }),
    });
    const result = await handleCILogs({ owner: "test", repo: "repo", pr_number: 100 }, client);
    expect(result.content[0].text).toContain("failure");
    expect(result.content[0].text).toContain("src/main.ts:42");
    expect(result.content[0].text).toContain("undefined variable");
  });

  it("returns error for missing params", async () => {
    const result = await handleCILogs({}, mockClient());
    expect(result.isError).toBe(true);
  });
});
