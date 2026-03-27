# Verification: GitMolt MCP Server — Implementation Spec

Verified: 2026-03-27
Input: draft.md

## Summary

- critical: 0
- major: 0
- minor: 4

## Findings

1. **[minor] Contradictory `submit_contribution` error case vs handler logic (Section 4.4)** — The handler logic at step 4 says "If exists -> skip creation, use existing branch (agent already pushed code)." However, the error cases section lists "Branch already exists -> directs to contribution_status." These two statements describe opposite behaviors for the same condition: one treats an existing branch as normal flow, the other treats it as an error redirecting the user away. An implementer would not know which behavior to code. Resolution: either remove the error case entry or change the handler logic step 4 to match the error case.

2. **[minor] `excludeClaimed` parameter defined but unused (Section 4.1 vs Section 3.4)** — `SearchParams.excludeClaimed` is defined with a default of `true` in the type (line 144), but the `browse_issues` handler logic (steps 3-4) hardcodes `-label:"ai-claimed"` into the query unconditionally. The parameter exists in the interface but is never referenced by the handler. This is a dead field that could mislead implementers into thinking callers can toggle claim filtering. Either the handler should conditionally apply the filter based on this parameter, or the field should be removed from `SearchParams`.

3. **[minor] `aggregateCIStatus` classifies terminal non-success states as "pending" (Section 4.5)** — The function checks for `failure`/`timed_out`, then `in_progress`/`queued`, then checks if all completed runs have `success`/`skipped`/`neutral`/`cancelled`. The final `return "pending"` fallback is described as "Should not reach here if all completed, but safe fallback." However, this fallback CAN be reached: if some runs are completed with `cancelled` conclusion and others are completed with `success`, the `every(...)` check passes and returns `"success"`. The actual unreachable scenario is not clearly articulated. The comment is imprecise but the logic itself is correct upon close inspection.

4. **[minor] `contribution_status` anyOf justification is assertion without evidence (Section 4.5)** — The comment says "JSON Schema anyOf adds complexity for MCP clients" to justify handler-side validation instead of schema-level enforcement. This is stated as fact without citing which MCP clients have this limitation. The design decision itself is reasonable (handler validation is simpler), but the stated rationale is an unsupported claim.

## Prior Issues Resolved

- **[major, now resolved] `contribute` tool handler logic flaw (Section 4.6)** — Path A (discovery) and Path B (direct) are now clearly distinct branches with correct control flow.
- **[minor, now resolved] `createBranch` missing base ref** — Signature now includes `fromRef?: string` with documentation.
- **[minor, now resolved] Ambiguous validation wording (Section 2.2)** — Now correctly says "either is missing."
- **[minor, now resolved] Duplicate step numbering (Section 4.4)** — Steps are now numbered correctly 1-10.

## Logical Consistency Notes

- **No contradictions found** in the authentication model. App-level JWT vs installation-scoped tokens are consistently described across sections 3.1, 3.2, and 7.3.
- **No circular reasoning** detected. The claim/unclaim/stale-detection flow has clear directional logic.
- **Causal chain is sound** for the stale claim race condition mitigation (Section 4.2): comment ID capture -> wait -> re-fetch -> compare is a valid optimistic concurrency pattern, and the acknowledged limitation about the 2-second window is honest and well-reasoned.
- **No missing premises** for the core architecture claim ("thin MCP layer, no external state store"). Git branches as checkpoints and GitHub labels as state are consistently used throughout without requiring unstated infrastructure.
