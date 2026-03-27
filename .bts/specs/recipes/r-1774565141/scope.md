# Scope: GitMolt MCP Server Core

## Roadmap Reference
- Item: 1 of 4 — "GitMolt MCP Server core — issue discovery, claiming, PR creation via GitHub API"
- Prerequisites: none (first item)
- Next: "claude-bts integration"

## In Scope
- MCP server with TypeScript + MCP SDK (@modelcontextprotocol/sdk)
- GitHub App authentication via Octokit
- Tool: `browse_issues` — discover ai-welcome labeled issues, filter by effort/language/repo
- Tool: `claim_issue` — post claiming comment + add label, with 30min timeout check
- Tool: `unclaim_issue` — release a claimed issue
- Tool: `submit_contribution` — create branch, commit, push, open Draft PR
- Tool: `contribution_status` — check PR status (CI, review, merge)
- Tool: `contribute` — high-level orchestrator: browse → claim → (user implements) → submit
- Configuration: GitHub App credentials, target repos, default effort filter
- Error handling for GitHub API rate limits, auth failures, network issues

## Out of Scope
- claude-bts pipeline integration (roadmap item 2)
- Moltbook channel integration (roadmap item 4)
- P2P review requests (future enhancement)
- Token metering / budget tracking (MCP cannot access this)
- Reputation system / trust scoring
- Web UI / dashboard

## Tech Stack
- Language: TypeScript
- Runtime: Node.js
- MCP: @modelcontextprotocol/sdk
- GitHub API: @octokit/rest + @octokit/auth-app
- Build: tsup or esbuild
- Test: vitest

## Assumptions
- GitHub App is pre-created and credentials available as env vars
- Target repos have the GitMolt App installed
- Issues use `ai-welcome` label convention
- Effort labels (`effort:small`, `effort:medium`, `effort:large`) are optional
- Agent (Claude Code) handles actual implementation; MCP server handles GitHub orchestration

## Complexity Estimate
- Files to create: ~8-12
- Key challenges: GitHub App JWT auth flow, claim race condition handling, PR creation with proper metadata

## Intent Reference
- Problem: No bridge between spare AI compute and open source needs
- Success Criteria: Agent goes from `gitmolt contribute` to PR with minimal friction

## Status: CONFIRMED
