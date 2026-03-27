import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleBrowseIssues } from "../tools/browse.js";
import { handleClaimIssue, handleUnclaimIssue } from "../tools/claim.js";
import { handleSubmitContribution } from "../tools/submit.js";
import { handleContributionStatus } from "../tools/status.js";
import { handleContribute } from "../tools/contribute.js";
import type { GitMoltClient } from "../github/client.js";
import type { Issue, PRStatus } from "../github/types.js";

function mockClient(overrides: Partial<GitMoltClient> = {}): GitMoltClient {
  return {
    searchIssues: vi.fn().mockResolvedValue([]),
    getIssue: vi.fn().mockResolvedValue({
      owner: "test",
      repo: "repo",
      number: 42,
      title: "Fix bug",
      body: "Details here",
      labels: ["ai-welcome"],
      url: "https://github.com/test/repo/issues/42",
      createdAt: "2026-03-27T00:00:00Z",
      isClaimed: false,
      effort: "small",
    } satisfies Issue),
    addComment: vi.fn().mockResolvedValue({ id: 999 }),
    deleteComment: vi.fn().mockResolvedValue(undefined),
    addLabels: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    listComments: vi.fn().mockResolvedValue([]),
    getDefaultBranch: vi.fn().mockResolvedValue("main"),
    branchExists: vi.fn().mockResolvedValue(false),
    createBranch: vi.fn().mockResolvedValue("gitmolt/issue-42-fix-bug"),
    createDraftPR: vi.fn().mockResolvedValue({
      owner: "test",
      repo: "repo",
      number: 100,
      title: "Fix: Fix bug",
      url: "https://github.com/test/repo/pull/100",
      isDraft: true,
      state: "open",
    }),
    getPRStatus: vi.fn().mockResolvedValue({
      pr: {
        owner: "test",
        repo: "repo",
        number: 100,
        title: "Fix: Fix bug",
        url: "https://github.com/test/repo/pull/100",
        isDraft: true,
        state: "open",
      },
      ciStatus: "success",
      reviewStatus: "pending",
      mergeable: true,
    } satisfies PRStatus),
    findPRForIssue: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GitMoltClient;
}

describe("browse_issues", () => {
  it("returns error when no repos configured", async () => {
    const client = mockClient();
    const result = await handleBrowseIssues({}, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No repos configured");
  });

  it("returns formatted issue list", async () => {
    const client = mockClient({
      searchIssues: vi.fn().mockResolvedValue([
        {
          owner: "test",
          repo: "repo",
          number: 42,
          title: "Fix bug",
          body: "",
          labels: ["ai-welcome", "effort:small"],
          url: "https://github.com/test/repo/issues/42",
          createdAt: "2026-03-27T00:00:00Z",
          isClaimed: false,
          effort: "small",
        },
      ]),
    });

    const result = await handleBrowseIssues(
      { repos: ["test/repo"] },
      client
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 1 ai-welcome issue");
    expect(result.content[0].text).toContain("[effort:small]");
    expect(result.content[0].text).toContain("Fix bug");
  });

  it("returns no-results message when empty", async () => {
    const client = mockClient();
    const result = await handleBrowseIssues(
      { repos: ["test/repo"] },
      client
    );
    expect(result.content[0].text).toContain("No ai-welcome issues found");
  });
});

describe("claim_issue", () => {
  it("claims an unclaimed issue", async () => {
    const client = mockClient({
      listComments: vi.fn().mockResolvedValue([
        { id: 999, body: "Claimed by gitmolt", user: { login: "gitmolt[bot]" }, created_at: new Date().toISOString() },
      ]),
    });

    const result = await handleClaimIssue(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Claimed test/repo#42");
    expect(client.addComment).toHaveBeenCalled();
    expect(client.addLabels).toHaveBeenCalledWith("test", "repo", 42, [
      "ai-claimed",
    ]);
  });

  it("rejects when already claimed and not stale", async () => {
    const client = mockClient({
      getIssue: vi.fn().mockResolvedValue({
        owner: "test",
        repo: "repo",
        number: 42,
        title: "Fix bug",
        body: "",
        labels: ["ai-welcome", "ai-claimed"],
        url: "https://github.com/test/repo/issues/42",
        createdAt: "2026-03-27T00:00:00Z",
        isClaimed: true,
        effort: "small",
      }),
      listComments: vi.fn().mockResolvedValue([
        {
          id: 888,
          body: "Claimed by gitmolt-agent",
          user: { login: "gitmolt[bot]" },
          created_at: new Date().toISOString(), // Just claimed
        },
      ]),
    });

    const result = await handleClaimIssue(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("claimed by another agent");
  });

  it("returns error for missing parameters", async () => {
    const client = mockClient();
    const result = await handleClaimIssue({}, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Required");
  });
});

describe("unclaim_issue", () => {
  it("unclaims successfully", async () => {
    const client = mockClient();
    const result = await handleUnclaimIssue(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Released claim");
    expect(client.removeLabel).toHaveBeenCalled();
    expect(client.addComment).toHaveBeenCalled();
  });
});

describe("submit_contribution", () => {
  it("creates branch and draft PR for claimed issue", async () => {
    const client = mockClient({
      getIssue: vi.fn().mockResolvedValue({
        owner: "test",
        repo: "repo",
        number: 42,
        title: "Fix bug",
        body: "",
        labels: ["ai-welcome", "ai-claimed"],
        url: "https://github.com/test/repo/issues/42",
        createdAt: "2026-03-27T00:00:00Z",
        isClaimed: true,
        effort: "small",
      }),
    });

    const result = await handleSubmitContribution(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Draft PR created");
    expect(client.createBranch).toHaveBeenCalled();
    expect(client.createDraftPR).toHaveBeenCalled();
  });

  it("rejects when issue not claimed", async () => {
    const client = mockClient();
    const result = await handleSubmitContribution(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Claim the issue first");
  });

  it("skips branch creation when branch exists", async () => {
    const client = mockClient({
      getIssue: vi.fn().mockResolvedValue({
        owner: "test",
        repo: "repo",
        number: 42,
        title: "Fix bug",
        body: "",
        labels: ["ai-welcome", "ai-claimed"],
        url: "https://github.com/test/repo/issues/42",
        createdAt: "2026-03-27T00:00:00Z",
        isClaimed: true,
        effort: "small",
      }),
      branchExists: vi.fn().mockResolvedValue(true),
    });

    const result = await handleSubmitContribution(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBeUndefined();
    expect(client.createBranch).not.toHaveBeenCalled();
  });

  it("uses custom branch name when provided", async () => {
    const client = mockClient({
      getIssue: vi.fn().mockResolvedValue({
        owner: "test",
        repo: "repo",
        number: 42,
        title: "Fix bug",
        body: "",
        labels: ["ai-welcome", "ai-claimed"],
        url: "https://github.com/test/repo/issues/42",
        createdAt: "2026-03-27T00:00:00Z",
        isClaimed: true,
        effort: "small",
      }),
    });

    await handleSubmitContribution(
      { owner: "test", repo: "repo", issue_number: 42, branch_name: "my-branch" },
      client
    );
    expect(client.branchExists).toHaveBeenCalledWith("test", "repo", "my-branch");
  });
});

describe("contribution_status", () => {
  it("shows PR status", async () => {
    const client = mockClient({
      findPRForIssue: vi.fn().mockResolvedValue(100),
    });

    const result = await handleContributionStatus(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("PR: #100");
    expect(result.content[0].text).toContain("success");
  });

  it("returns error when no PR found", async () => {
    const client = mockClient();
    const result = await handleContributionStatus(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No contribution PR found");
  });

  it("requires issue_number or pr_number", async () => {
    const client = mockClient();
    const result = await handleContributionStatus(
      { owner: "test", repo: "repo" },
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("issue_number or pr_number");
  });
});

describe("contribute", () => {
  it("browses issues in discovery mode", async () => {
    const client = mockClient({
      searchIssues: vi.fn().mockResolvedValue([
        {
          owner: "test",
          repo: "repo",
          number: 42,
          title: "Fix bug",
          body: "",
          labels: ["ai-welcome"],
          url: "https://github.com/test/repo/issues/42",
          createdAt: "2026-03-27T00:00:00Z",
          isClaimed: false,
          effort: "small",
        },
      ]),
    });

    const result = await handleContribute(
      { repos: ["test/repo"] },
      client
    );
    expect(result.content[0].text).toContain("Found 1 ai-welcome issue");
  });

  it("shows issue details in direct mode", async () => {
    const client = mockClient();
    const result = await handleContribute(
      { owner: "test", repo: "repo", issue_number: 42 },
      client
    );
    expect(result.content[0].text).toContain("Issue: test/repo#42");
    expect(result.content[0].text).toContain("Fix bug");
    expect(result.content[0].text).toContain("claim_issue");
  });

  it("errors when issue_number given without owner/repo", async () => {
    const client = mockClient();
    const result = await handleContribute(
      { issue_number: 42 },
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Provide owner and repo");
  });
});
