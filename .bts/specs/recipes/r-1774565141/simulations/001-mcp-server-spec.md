# Simulation: GitMolt MCP Server Spec (draft.md)

Simulated: 2026-03-27
Source: `.bts/state/recipes/r-1774565141/draft.md`

---

## Scenario 1: Happy Path End-to-End (browse_issues -> claim_issue -> agent implements -> submit_contribution -> contribution_status)

- Step 1: Agent calls `browse_issues` with repos=["owner/repo"], effort="small"
  - Spec (4.1): Resolves repos from args or config default. Builds GitHub search query with `label:"ai-welcome" is:open repo:owner/repo -label:"ai-claimed" label:"effort:small"`. Returns numbered list with title, repo, effort, URL. **COVERED** ✓
- Step 2: Agent picks issue #42 and calls `claim_issue` with owner="owner", repo="repo", issue_number=42
  - Spec (4.2): Fetches current issue state. Checks for `ai-claimed` label. Not claimed, so proceeds. Posts comment "Claimed by gitmolt-agent" with 30-minute timeout notice. Adds `ai-claimed` label. Returns confirmation. **COVERED** ✓
- Step 3: Agent clones repo, creates local branch, implements fix, pushes to `gitmolt/issue-42-fix-typo`
  - Spec (4.4 note): "The agent is expected to have already pushed commits to the branch using Git CLI before calling this tool." The agent works outside of MCP tools for actual implementation. **COVERED** ✓ (by design -- implementation is the agent's responsibility)
- Step 4: Agent calls `submit_contribution` with owner="owner", repo="repo", issue_number=42
  - Spec (4.4): Verifies issue exists and is claimed by us. Gets default branch. Computes branch name `gitmolt/issue-42-fix-typo`. Checks if branch exists -- it does (agent pushed), so skips creation. Generates PR title and body. Creates Draft PR. Adds `ai-contribution` label to PR. Posts comment on issue linking to PR. Returns PR details. **COVERED** ✓
- Step 5: Agent calls `contribution_status` with owner="owner", repo="repo", issue_number=42
  - Spec (4.5): Searches for linked PR by branch pattern `gitmolt/issue-42-*` or PR body containing `Closes #42`. Fetches PR details + check runs + reviews. Formats status report with CI status, review status, mergeability. **COVERED** ✓
- Step 6: Agent reviews status output and determines contribution is complete or needs iteration
  - Spec: The output format shows CI status (passing/failing), review status, mergeable state. Agent can decide next action. **COVERED** ✓

**Result: 0 GAPs, 0 ISSUEs -- Happy path is fully specified**

---

## Scenario 2: Rate Limit Hit During browse_issues Across 10 Repos

- Step 1: Agent calls `browse_issues` with repos containing 10 different repos
  - Spec (4.1): Builds search query including all 10 repos. Calls `client.searchIssues(params)`. **COVERED** ✓
- Step 2: GitHub search API uses a single query with multiple `repo:` qualifiers
  - Spec (3.2): `searchIssues` is a single method call. **GAP: The spec does not describe HOW multiple repos are handled in the search query. GitHub search API allows multiple `repo:` qualifiers in a single query, but there is a query length limit (~256 chars). With 10 repos like `owner/long-repo-name`, the query could exceed limits. The spec does not address whether to batch queries or handle query-too-long errors.**
- Step 3: During search, GitHub returns 429 (rate limit)
  - Spec (3.3): `rate_limit` error kind catches 429 or 403 with rate limit header. Retry strategy: wait `retryAfter` seconds, retry once. **COVERED** ✓
- Step 4: Rate limit `retryAfter` value is respected
  - Spec (3.3): `GitHubError.retryAfter` field stores seconds. Retry strategy says "wait retryAfter seconds, retry once." **COVERED** ✓
- Step 5: After retry, rate limit persists (still 429)
  - Spec (3.3): "retry once" -- only one retry for rate limits. After that, "return error to user." **COVERED** ✓
- Step 6: Error returned to agent
  - Spec (4.1 error cases): "Rate limited -> return 'Rate limited, try again in {N} seconds'." **COVERED** ✓
- Step 7: 10 repos span multiple GitHub App installations, each with separate rate limits
  - Spec (3.2): `getRepoOctokit` resolves per-repo installation. `tokenCache` maps `installationId -> Octokit`. Different installations have different API tokens and thus different rate limit buckets. **GAP: The spec does not address per-installation rate limit tracking. If repos span 3 installations and installation #2 is rate-limited, the search could still succeed for repos under installations #1 and #3. Instead, a single failed search call would fail the entire batch.** This is related to the search batching gap above.
- Step 8: Partial results across repos
  - **GAP: No specification of partial success. If the search query covers 10 repos but fails mid-way (rate limit after fetching some results), the spec does not say whether partial results are returned or everything fails.**

**Result: 3 GAPs found**
- (major) No specification of query batching for large repo lists or query length limits
- (major) No per-installation rate limit tracking when repos span multiple installations
- (minor) No partial result handling on mid-query rate limit

---

## Scenario 3: Stale Claim Detection + Re-Claim Race Condition Between Two Agents

### 3a: Stale Claim Detection

- Step 1: Agent A calls `claim_issue` on issue #42 which has `ai-claimed` label
  - Spec (4.2): Fetches issue, detects `ai-claimed` label. Checks timestamp of claim comment. **COVERED** ✓
- Step 2: `isClaimStale` checks for stale claim
  - Spec (4.2): Filters comments by `gitmolt[bot]` user with "Claimed by" text. Sorts by `created_at` descending, takes most recent. Computes age vs 30-minute threshold. **COVERED** ✓
- Step 3: Claim is 45 minutes old, no PR exists
  - Spec (4.2): "If claim is older than 30 minutes and no linked PR exists -> stale claim, proceed to re-claim." **GAP: The spec says "no linked PR exists" as a condition for stale, but does not specify HOW to check for a linked PR. Does it search for PRs with matching branch pattern? Check for PR URL in issue comments? The `isClaimStale` function shown only checks comment age, not PR existence.** The function signature and body do not include PR checking logic.
- Step 4: Agent proceeds with re-claim
  - Spec (4.2): Posts new claim comment, adds `ai-claimed` label (already present -- no-op or re-add). **GAP: The label is already present from the original claim. The spec does not say whether `addLabels` is idempotent or throws on duplicate. GitHub API is idempotent for this, but the spec should state this assumption.**

### 3b: Race Condition Between Two Agents

- Step 5: Both Agent A and Agent B detect issue #42 as stale simultaneously
  - Spec (4.2): Both run `isClaimStale`, both get `true`. Both proceed. **COVERED** ✓ (acknowledged by spec)
- Step 6: Agent A posts claim comment at T+0ms
  - Spec (4.2): Comment posted. **COVERED** ✓
- Step 7: Agent B posts claim comment at T+200ms
  - Spec (4.2): Comment posted. **COVERED** ✓
- Step 8: Agent A re-reads comments to verify it is the most recent claim
  - Spec (4.2): "After posting our claim comment, verify our comment is the most recent claim comment." **COVERED** ✓
- Step 9: Agent A sees Agent B's comment is more recent
  - Spec (4.2): "If another agent claimed between our check and our comment, return 'Issue was just claimed by another agent' and do NOT add the label." **COVERED** ✓
- Step 10: Agent B also verifies and sees its own comment is most recent
  - Spec (4.2): Agent B proceeds and adds the label. **COVERED** ✓
- Step 11: Extremely tight race: both agents verify at the same instant before the other's comment appears
  - Spec (4.2): "This is advisory locking -- not perfect, but sufficient. Worst case: two agents work on the same issue, and the better PR wins." **COVERED** ✓ (explicitly acknowledged as acceptable)
- Step 12: Both agents work on the issue, both submit PRs
  - **GAP: The spec does not address what happens when two PRs exist for the same issue. Both would have `Closes #42` in the body. When one merges, GitHub auto-closes #42. The second PR then references a closed issue. No guidance on this outcome.**
- Step 13: Agent A's claim comment identifies "gitmolt-agent" generically
  - **GAP: The claim comment text is "Claimed by gitmolt-agent" -- there is no agent-specific identifier. Two agents running the same gitmolt[bot] app post identical claim comments. The race detection compares comments by the same bot user, so it cannot distinguish between agents. The verification step ("our comment is the most recent") requires the agent to identify WHICH comment is theirs, but all comments come from the same bot user with the same text.**
  - **ISSUE: The race condition mitigation is broken. An agent posts a comment and then checks if "our comment is the most recent claim comment." But since both agents post via gitmolt[bot] with the same body text, Agent A cannot distinguish its own comment from Agent B's comment. It would need to match by comment ID (returned from the API), not by content.**

**Result: 4 GAPs, 1 ISSUE found**
- (critical) Race condition mitigation is broken -- no way to distinguish own comment from rival's comment since both come from the same bot identity
- (major) `isClaimStale` function does not include PR existence check despite spec text requiring it
- (minor) Idempotency of `addLabels` for already-present label not stated
- (minor) No handling for dual-PR scenario when race condition occurs

---

## Scenario 4: Agent Pushes Code to Branch Then Calls submit_contribution (Branch Already Exists)

- Step 1: Agent claims issue #42 via `claim_issue`
  - Spec (4.2): Standard claim flow. **COVERED** ✓
- Step 2: Agent clones repo locally, creates branch `gitmolt/issue-42-fix-typo`, implements code, pushes
  - Spec (4.4 note): Expected flow -- agent does Git operations outside MCP. **COVERED** ✓
- Step 3: Agent calls `submit_contribution` with owner, repo, issue_number=42
  - Spec (4.4): Handler runs. **COVERED** ✓
- Step 4: Handler computes branch name `gitmolt/issue-42-fix-typo`
  - Spec (4.4): `branchName(42, "Fix typo in README")` produces `gitmolt/issue-42-fix-typo-in-readme`. **GAP: The branch name the agent created locally may not match the branch name the server computes. The agent would use their own naming convention (or follow docs), but `submit_contribution` computes the name from the issue title via `branchName()`. If the agent named their branch `gitmolt/issue-42-fix-typo` but the function computes `gitmolt/issue-42-fix-typo-in-readme`, the "check if branch already exists" step would check the WRONG branch name and create a new empty branch instead of finding the agent's branch.**
  - **ISSUE: Branch name mismatch between agent's local branch and server-computed branch is highly likely. The spec does not provide a `branch_name` input parameter on `submit_contribution` to let the agent specify their actual branch. The tool should either accept a branch name override OR the documentation must clearly prescribe the exact branch naming convention agents must follow.**
- Step 5: Branch exists check succeeds (assuming names match)
  - Spec (4.4): "If exists -> skip creation, use existing branch (agent already pushed code)." **COVERED** ✓
- Step 6: Create Draft PR pointing to existing branch
  - Spec (4.4): Creates PR with auto-generated or user-provided title/body. Adds `ai-contribution` label. Posts issue comment with PR URL. **COVERED** ✓
- Step 7: Agent pushed to branch but PR HEAD has zero diff from default branch base
  - **GAP: No validation that the branch actually has commits beyond the base. If the agent somehow pushed an empty branch (or the branch was created by `submit_contribution` in a previous failed attempt), the Draft PR would have no changes. The spec does not check for empty diffs before creating a PR.**
- Step 8: Agent pushed to a differently-named branch (e.g., `fix/issue-42`)
  - This is the branch name mismatch from Step 4. `submit_contribution` would not find the branch, would create a new branch `gitmolt/issue-42-...` from HEAD of default branch, and create a PR with no code changes. The agent's actual work is on `fix/issue-42` which is orphaned.
  - **GAP: No fallback to search for existing branches that might contain the agent's work. The spec relies entirely on naming convention match.**

**Result: 3 GAPs, 1 ISSUE found**
- (critical) Branch name mismatch between agent-created branch and server-computed branch -- no `branch_name` parameter to resolve
- (major) No validation that branch has actual commits/diff before creating PR
- (major) No fallback branch discovery if computed name does not match agent's branch

---

## Scenario 5: CI Fails on PR -- Agent Checks Status and Needs to Iterate

- Step 1: Agent has submitted contribution, PR #456 exists as Draft
  - Spec (4.4): PR created successfully. **COVERED** ✓
- Step 2: CI runs and fails. Agent calls `contribution_status` with pr_number=456
  - Spec (4.5): Fetches PR details + check runs + reviews. `aggregateCIStatus` detects failure. **COVERED** ✓
- Step 3: Status output shows CI failure details
  - Spec (4.5): Output format shows `CI: failure`. **GAP: The output format only shows aggregate status ("failure") and count ("3/3 checks"), but does not include WHICH check failed or the failure message. The `CheckRun` type has `name`, `status`, and `conclusion`, but the output format does not enumerate individual check results. An agent needs to know which check failed and ideally see the failure log to iterate.**
- Step 4: Agent needs to see CI failure details to fix code
  - **GAP: No tool to fetch CI logs or check run details. The `contribution_status` tool aggregates but does not expose per-check-run information. The agent would need to use Git CLI or browser to inspect failures. This breaks the MCP-only workflow.**
- Step 5: Agent fixes code locally and pushes new commits to the same branch
  - Spec: This is outside MCP tool scope (agent uses Git CLI). **COVERED** ✓ (by design)
- Step 6: Agent calls `contribution_status` again to check if CI passes now
  - Spec (4.5): Same flow, fetches updated check runs. **COVERED** ✓
- Step 7: CI is still running (queued/in_progress)
  - Spec (4.5): `aggregateCIStatus` returns "pending" for `in_progress` or `queued` runs. Output shows `CI: pending`. **COVERED** ✓
- Step 8: Agent polls `contribution_status` repeatedly waiting for CI
  - **GAP: No guidance on polling interval or backoff. An agent calling `contribution_status` every 5 seconds would generate excessive API calls. The spec does not suggest a reasonable polling interval or provide a webhook/notification mechanism.**
- Step 9: CI passes after agent's fix
  - Spec (4.5): `aggregateCIStatus` returns "success" when all checks succeed. **COVERED** ✓
- Step 10: Agent wants to move PR from Draft to Ready for Review
  - **GAP: No tool to convert a Draft PR to Ready for Review. The spec creates Draft PRs (4.4) but provides no mechanism to mark them as ready. The agent would need to use Git CLI or GitHub API directly.**
- Step 11: Some checks have neutral/skipped conclusions (not failure, not success)
  - Spec (4.5): `aggregateCIStatus` handles `failure` (returns "failure"), `in_progress/queued` (returns "pending"), `success` (returns "success"). **GAP: Checks with `conclusion: "neutral"`, `"cancelled"`, `"skipped"`, or `"timed_out"` fall through all conditions. If all checks are completed but some are `neutral` and rest are `success`, `every(c => c.conclusion === "success")` is false, so it falls to the default "pending" -- which is incorrect. A completed check with neutral conclusion is not pending.**

**Result: 4 GAPs found**
- (major) No per-check-run detail in `contribution_status` output (name, failure message)
- (major) No tool to fetch CI logs or check run details
- (minor) No polling guidance for status checks
- (major) No tool to convert Draft PR to Ready for Review
- (major) `aggregateCIStatus` misclassifies neutral/cancelled/skipped/timed_out conclusions as "pending"

---

## Scenario 6: Multiple Installation IDs Across Different Orgs

- Step 1: Server configured with `GITMOLT_REPOS=orgA/repo1,orgB/repo2,orgC/repo3`
  - Spec (2.1): `GITMOLT_REPOS` parsed as CSV. **COVERED** ✓
- Step 2: `GITMOLT_INSTALLATION_ID` is set to orgA's installation
  - Spec (2.1): "If set, skip API-based resolution for repos under this installation. Useful for single-org setups." **COVERED** ✓
- Step 3: Agent calls `browse_issues` across all 3 repos
  - Spec (3.2, 3.1): `getRepoOctokit` resolves per-repo installation. For orgA/repo1, uses default installationId. For orgB/repo2 and orgC/repo3, calls `resolveInstallationId`. **GAP: The spec says GITMOLT_INSTALLATION_ID causes "skip API-based resolution for repos under this installation," but `resolveInstallationId` does not reference the config's `installationId`. The function always calls `octokit.rest.apps.getRepoInstallation()`. The spec text and the function logic are disconnected. It is unclear HOW the default installation ID is used to skip resolution.**
- Step 4: `resolveInstallationId` called for orgB/repo2
  - Spec (3.1): Calls `getRepoInstallation`, caches per `owner/repo`. **COVERED** ✓
- Step 5: GitMolt App is NOT installed on orgC/repo3
  - Spec (3.1): Throws `AuthError` if app not installed on repo. **COVERED** ✓
- Step 6: `searchIssues` needs to handle mixed installation results
  - **GAP: The `searchIssues` method signature takes `SearchParams` with `repos: string[]`, but the spec does not describe how it handles per-repo authentication internally. The GitHub Search API uses a single token, but different repos require different installation tokens. The spec does not address whether search uses the App-level JWT (which can search across repos but may have limited access) or per-installation tokens (which would require multiple searches).**
  - **ISSUE: GitHub Search API with an App-level JWT cannot search private repos -- it needs installation tokens. But installation tokens are scoped to one installation. To search across 3 orgs with 3 different installations, the client would need 3 separate search API calls, one per installation. The `searchIssues` method as specified does not accommodate this.**
- Step 7: Installation tokens expire and need refresh
  - Spec (3.2): `tokenCache: Map<number, Octokit>` caches installation-scoped Octokit instances. **GAP: GitHub installation tokens expire after 1 hour. The `tokenCache` caches Octokit instances but has no TTL or expiry handling. If the server runs for more than 1 hour, cached installation Octokit instances will start failing with 401 errors. The spec does not address token refresh.**
  - Note: `@octokit/auth-app` may handle this internally if configured correctly (it auto-refreshes), but the spec should state this assumption explicitly since it is a critical auth concern.
- Step 8: `installationCache` grows without bound
  - Spec (3.2): `installationCache: Map<string, number>` caches `owner/repo -> installationId`. **GAP (minor): No cache eviction. For a server processing many repos over time, the cache grows indefinitely. Not critical for typical usage but unbounded caches are a concern for long-running servers.**

**Result: 4 GAPs, 1 ISSUE found**
- (critical) `searchIssues` cannot search across multiple installations with a single API call -- spec does not address multi-installation search strategy
- (major) Default `GITMOLT_INSTALLATION_ID` usage is described in config but not reflected in `resolveInstallationId` function logic
- (major) No token expiry/refresh handling for cached installation Octokit instances
- (minor) No cache eviction for `installationCache`

---

## Scenario 7: Network Failure Mid-Claim (Comment Posted but Label Not Added)

- Step 1: Agent calls `claim_issue` on issue #42
  - Spec (4.2): Handler starts. Fetches issue state. Not claimed. Proceeds. **COVERED** ✓
- Step 2: Agent posts claim comment successfully
  - Spec (4.2): `addComment` succeeds. Comment is now visible on the issue. **COVERED** ✓
- Step 3: Network failure occurs before `addLabels` call completes
  - Spec (3.3): `network` error kind covers ECONNRESET, ETIMEDOUT. Retry strategy: exponential backoff, max 3 retries. **COVERED** ✓ (for the retry itself)
- Step 4: All 3 network retries for `addLabels` fail
  - Spec (3.3): "All others: No retry" -- wait, `network` errors DO get retried (3 times). After 3 retries, the error would be returned. **COVERED** ✓
- Step 5: `claim_issue` handler returns error to agent
  - **GAP: The spec does not describe the partial failure state. The comment was posted (step 2 succeeded) but the label was not added. The error returned to the agent does not indicate that a partial claim occurred. The issue now has a claim comment but no `ai-claimed` label. This is an inconsistent state.**
- Step 6: Another agent calls `browse_issues`
  - Spec (4.1): `excludeClaimed` checks for `-label:"ai-claimed"`. Since the label was never added, issue #42 APPEARS as unclaimed in search results despite having a claim comment. **ISSUE: The issue is in a "ghost claimed" state -- it has a claim comment but no label. Other agents will see it as available, but when they try to claim, the stale claim detection looks at comments (not labels), so it might detect the recent claim comment and reject.**
- Step 7: Second agent calls `claim_issue` on issue #42
  - Spec (4.2): Fetches issue. Checks for `ai-claimed` label -- NOT present (label was never added). Spec says "Check if already claimed (has `ai-claimed` label)" -- so the check passes (not claimed). Proceeds to check stale claim... wait, the spec checks label FIRST. Since there is no label, it does not enter the stale-check branch at all. It proceeds directly to posting a new claim comment. **GAP: The claim check is label-only. The existence of a claim comment WITHOUT the label is not detected. The spec should check BOTH label and comment presence for robustness.**
- Step 8: Original agent retries the claim
  - **GAP: No retry or recovery mechanism for partial claims. The agent received an error but does not know that the comment was posted. If it calls `claim_issue` again, it will see no `ai-claimed` label, see its own recent claim comment (but cannot distinguish it from another agent's -- see Scenario 3 issue), and proceed to post ANOTHER claim comment. This leads to duplicate claim comments.**
- Step 9: Manual cleanup needed
  - **GAP: No `unclaim_issue` triggered cleanup for ghost claims. The `unclaim_issue` tool removes the label and posts a release comment, but if there is no label to remove, it would hit the error case "Not claimed -> Issue is not currently claimed." The ghost state (comment present, label absent) cannot be cleaned up by any existing tool.**

**Result: 5 GAPs, 1 ISSUE found**
- (critical) Partial failure in `claim_issue` leaves issue in inconsistent "ghost claimed" state (comment exists, label missing)
- (critical) Claim check is label-only; does not detect claim comments without labels
- (major) No transactional semantics or rollback for multi-step claim operations
- (major) No recovery mechanism for partial claims -- agent cannot clean up ghost state
- (minor) Duplicate claim comments accumulate on retries of failed claims

---

## Summary

| # | Scenario | GAPs | ISSUEs | Severity |
|---|----------|------|--------|----------|
| 1 | Happy path end-to-end | 0 | 0 | -- (clean) |
| 2 | Rate limit during browse across 10 repos | 3 | 0 | major |
| 3 | Stale claim + re-claim race condition | 4 | 1 | critical |
| 4 | Branch already exists (agent pushed first) | 3 | 1 | critical |
| 5 | CI fails, agent iterates | 5 | 0 | major |
| 6 | Multiple installation IDs across orgs | 4 | 1 | critical |
| 7 | Network failure mid-claim (partial state) | 5 | 1 | critical |

**Total scenarios: 7**
**Total GAPs: 24**
**Total ISSUEs: 4**

### By Severity
- **critical: 7** -- Race condition comment identification broken, branch name mismatch with no override, multi-installation search not addressed, partial claim ghost state, claim check misses comment-without-label
- **major: 12** -- No CI detail in status output, no Draft-to-Ready conversion, stale claim missing PR check logic, default installation ID not wired into resolve function, search query batching for many repos, aggregateCIStatus misclassifies non-success non-failure conclusions, no token refresh handling, no transactional claim semantics
- **minor: 5** -- Polling interval guidance, label idempotency assumption, dual-PR scenario, cache eviction, duplicate claim comments

### Top Critical Gaps Requiring Spec Fix

1. **Race condition comment identification (Scenario 3)**: The post-claim verification step cannot distinguish own comment from rival's when both use the same bot identity. Fix: match by returned comment ID, not by content/user.

2. **Branch name mismatch (Scenario 4)**: `submit_contribution` computes branch name from issue title but the agent may have used a different name. Fix: add optional `branch_name` parameter to `submit_contribution` input schema.

3. **Multi-installation search (Scenario 6)**: `searchIssues` cannot use a single API call across installations. Fix: specify that search is performed per-installation, then results are merged and deduplicated.

4. **Partial claim ghost state (Scenario 7)**: Comment + label is not atomic. Fix: reverse the order (add label first, then comment) so the label is the source of truth, OR add comment-based claim detection as a fallback.

5. **Claim check misses ghost claims (Scenario 7)**: Only checks label, not comments. Fix: check BOTH label presence and recent claim comments to detect inconsistent state.
