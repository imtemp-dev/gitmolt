import { describe, it, expect, vi } from "vitest";
import { handleBrowseIssues } from "../tools/browse.js";
import { handleClaimIssue, handleUnclaimIssue } from "../tools/claim.js";
import { handleSubmitContribution } from "../tools/submit.js";
import { handleContributionStatus } from "../tools/status.js";
import { handleContribute } from "../tools/contribute.js";
import type { GitMoltAPIClient } from "../github/client.js";

function mockClient(overrides: Partial<Record<keyof GitMoltAPIClient, any>> = {}): GitMoltAPIClient {
  return {
    searchIssues: vi.fn().mockResolvedValue([]),
    getIssue: vi.fn().mockResolvedValue({
      owner: "test", repo: "repo", number: 42, title: "Fix bug",
      body: "Details", labels: ["ai-welcome"], url: "https://github.com/test/repo/issues/42",
      createdAt: "2026-03-27T00:00:00Z", isClaimed: false, effort: "small",
    }),
    claimIssue: vi.fn().mockResolvedValue({ message: "Claimed test/repo#42: Fix bug", issue_title: "Fix bug" }),
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
