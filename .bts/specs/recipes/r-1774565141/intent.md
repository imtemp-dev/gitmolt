# Intent: GitMolt MCP Server

Status: CONFIRMED

## Problem
AI coding tool subscribers waste unused tokens that expire. Open source projects have untouched issues. No system bridges spare AI compute to open source needs.

## Purpose
Create an MCP server that enables Claude Code sessions to discover, claim, implement, and submit contributions to open source projects during idle time — transforming wasted subscription tokens into real code.

## Users
1. Token donors — AI tool subscribers volunteering spare compute
2. Project maintainers — label issues as ai-welcome, review PRs
3. AI agents — Claude Code sessions doing the actual work

## Success Criteria
- Agent goes from `gitmolt contribute` to merged PR with minimal human intervention
- First contribution setup takes < 5 minutes
- Works with any GitHub repo that installs the GitMolt App
- Contributions follow claude-bts quality pipeline (spec → implement → test)

## Direction
Build a thin MCP server layer on top of GitHub's existing infrastructure. Use GitHub App for auth, labels for coordination, Git branches for state, CI/CD for security. Don't build new infrastructure where existing tools suffice.

## Key Decisions
- GitHub App authentication (gitmolt[bot])
- Advisory locking via labels + comments (30min timeout)
- Git branches as checkpoints (no external state store)
- Effort labels for token budget matching
- Layered security: CI → SAST → AI review → human gate

## Research Notes
- Simulation identified 63 gaps, 18 critical (see simulations/001-gitmolt-workflow.md)
- Top 5 critical gaps addressed in architectural decisions
- Dev session (claude-p2p-glad-frog) confirmed all 5 decisions
- First test target: claude-p2p repo with ai-welcome issues
