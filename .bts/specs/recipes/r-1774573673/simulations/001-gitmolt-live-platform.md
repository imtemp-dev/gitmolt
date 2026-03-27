# Simulation: GitMolt Live Web Platform Spec

Simulated: 2026-03-27
Source: draft.md (GitMolt Live — Implementation Spec)

---

## Scenario 1: Happy Path — Webhook Arrives, Stored, Appears on /live in Real-Time

- Step 1: GitHub App fires `pull_request` webhook (action: opened) for a gitmolt branch
  - Spec: route.ts `POST` reads raw body via `request.text()` (Section 4.1 step 1) ✓
- Step 2: Signature verification via `x-hub-signature-256` header
  - Spec: `verifySignature()` compares HMAC-SHA256 using `timingSafeEqual` (Section 4.2) ✓
- Step 3: Parse JSON body
  - Spec: `JSON.parse(body)` with try/catch (Section 9.1) ✓
- Step 4: Extract `x-github-event` and `x-github-delivery` headers
  - Spec: Both extracted, missing delivery_id returns 400 (Section 9.1) ✓
- Step 5: `extractEvent()` maps `pull_request` opened to `pr_opened`, checks branch starts with `gitmolt/`
  - Spec: Mapping table (Section 2.2) + extraction logic (Section 4.3) ✓
- Step 6: Insert into Supabase `events` table using service_role client
  - Spec: `createServerClient()` with service_role key, bypasses RLS (Section 5.1, 9.1) ✓
- Step 7: Supabase Realtime publishes INSERT to `live-events` channel
  - Spec: `ALTER PUBLICATION supabase_realtime ADD TABLE events` enables this (Section 2.1) ✓
- Step 8: Browser `LiveFeed.tsx` receives payload via `postgres_changes` subscription
  - Spec: useEffect subscription on INSERT events, prepends to state array (Section 9.3) ✓
- Step 9: New event renders as `<EventCard />` at top of feed
  - Spec: EventCard renders with icon, color, label, relative timestamp (Section 6.5) ✓
- Step 10: User clicks "View on GitHub" link
  - Spec: `url` field stores `payload.pull_request.html_url` (Section 4.3) ✓

**Result: 0 GAPs found** — Happy path is fully specified.

---

## Scenario 2: Invalid Webhook Signature — Rejected

- Step 1: Attacker sends POST to `/api/webhooks/github` with forged body
  - Spec: route.ts reads body and signature header (Section 9.1) ✓
- Step 2: `verifySignature()` called with forged body and attacker's (or missing) signature
  - Spec: If `signature` is null, returns false immediately (Section 4.2) ✓
  - Spec: If signature present but wrong, `timingSafeEqual` returns false (Section 4.2) ✓
- Step 3: Route returns 401 "Invalid signature"
  - Spec: explicit 401 response in scaffolding (Section 9.1) ✓
- Step 4: No database write occurs
  - Spec: insert is only reached after signature check passes (Section 9.1) ✓
- Step 5: Timing attack resistance
  - Spec: Uses `timingSafeEqual` from Node.js crypto — prevents length-based timing attacks ✓
- Step 6: Attacker sends signature with wrong hash algorithm prefix
  - **GAP: The `verifySignature` function hardcodes `"sha256="` prefix but does not validate that the incoming signature also uses sha256. If GitHub changes the algorithm or an attacker sends `"sha512=..."`, the comparison will simply fail (Buffer lengths differ → `timingSafeEqual` throws). No graceful handling for algorithm mismatch.**
  - Severity: **minor** — In practice GitHub always sends sha256, and a thrown error would still block the request. But an unhandled exception would return 500 instead of 401, which leaks information about the verification mechanism.

**Result: 1 GAP found (minor)**

---

## Scenario 3: Duplicate Webhook Delivery — Silently Ignored

- Step 1: GitHub retries a webhook delivery (network timeout on first attempt)
  - Spec: GitHub sends same `x-github-delivery` ID on retries ✓ (assumed, standard GitHub behavior)
- Step 2: First delivery succeeds — event inserted with `delivery_id` value
  - Spec: `delivery_id TEXT NOT NULL UNIQUE` constraint on events table (Section 2.1) ✓
- Step 3: Retry arrives with same delivery_id
  - Spec: Supabase insert returns error code `23505` (unique_violation) ✓
- Step 4: Route checks for error code 23505 and returns 200
  - Spec: `if (error && error.code !== "23505")` — duplicate is not treated as error (Section 9.1) ✓
- Step 5: No duplicate event appears in feed
  - Spec: Only one row exists in DB, Realtime only fires on successful INSERT ✓
- Step 6: Concurrent duplicate deliveries (two arrive simultaneously before either commits)
  - **GAP: The UNIQUE constraint handles sequential duplicates, but spec does not discuss whether Supabase's transaction isolation prevents two simultaneous inserts of the same delivery_id. In practice, Postgres UNIQUE constraints are atomic — one will succeed, one will get 23505 — but the spec should state this explicitly for implementors who may worry about race conditions.**
  - Severity: **minor** — Postgres handles this correctly, but spec omits the explanation.

**Result: 1 GAP found (minor)**

---

## Scenario 4: Non-GitMolt Event (Regular User Comment) — Filtered Out

- Step 1: Human user comments on an issue in a repo with the GitHub App installed
  - Spec: Webhook arrives at route.ts, signature is valid (from the legitimate GitHub App) ✓
- Step 2: `extractEvent()` receives `issue_comment` event with `payload.comment.user.login` = "some-human"
  - Spec: Checks if login is exactly `gitmolt-app[bot]` (Section 4.3) ✓
- Step 3: Login does not match `gitmolt-app[bot]` → extractEvent returns null
  - Spec: "Return null if event doesn't match any pattern" (Section 4.3) ✓
- Step 4: Route returns 200 "Ignored"
  - Spec: `if (!event) return new Response("Ignored", { status: 200 })` (Section 9.1) ✓
- Step 5: Regular `pull_request` event (non-gitmolt branch)
  - Spec: Checks `payload.pull_request.head.ref` starts with `gitmolt/` (Section 4.3) ✓
  - If branch is `feature/my-thing` → no match → returns null ✓
- Step 6: Unknown GitHub event type (e.g., `star`, `fork`, `push`)
  - Spec: `extractEvent` only has cases for `issue_comment`, `pull_request`, `pull_request_review`, `check_suite` (Section 4.3). Any other event name falls through to return null ✓
- Step 7: Gitmolt bot makes a comment that does NOT contain "Claimed by gitmolt"
  - Spec: Checks both login AND body content (Section 4.3) ✓
  - Regular gitmolt bot comment without claim text → returns null ✓
- Step 8: `pull_request_review` on a non-gitmolt PR
  - **GAP: Section 4.3 says "Check if related PR branch starts with `gitmolt/`" for pull_request_review events, but the extraction logic does not specify WHERE this branch ref is located in the payload. For `pull_request_review`, the branch is at `payload.pull_request.head.ref` — but this is not explicitly stated. An implementor might look in the wrong place.**
  - Severity: **minor** — The payload structure is standard GitHub, but spec should be explicit about the path.

**Result: 1 GAP found (minor)**

---

## Scenario 5: Supabase Realtime Disconnects — Client Reconnects

- Step 1: User is viewing /live, Realtime WebSocket is active
  - Spec: LiveFeed.tsx subscribes via `supabase.channel("live-events").subscribe()` (Section 9.3) ✓
- Step 2: Network interruption or Supabase Realtime service hiccup
  - Spec: "Supabase Realtime disconnects → reconnect automatically (Supabase SDK handles this)" (Section 10, test scenario) ✓
  - **GAP: The spec delegates reconnection entirely to "Supabase SDK handles this" without specifying: (a) whether the SDK actually auto-reconnects by default (it does, but the spec asserts without evidence), (b) what happens to events that arrived during the disconnect window — they are LOST because Realtime only pushes live changes, not missed ones.**
  - Severity: **major** — Events during the disconnect window silently disappear from the user's view. If a user's connection drops for 30 seconds during a burst of activity, they miss those events with no indication. The spec has no recovery strategy (e.g., re-fetch recent events after reconnect).
- Step 3: Reconnection succeeds
  - Spec: SDK reconnects and re-subscribes ✓
- Step 4: User sees events after reconnect but missed events during gap
  - **GAP: No specification of how to detect reconnection and backfill missed events. The Supabase channel has a `status` callback that can detect `SUBSCRIBED` state after a reconnect. The spec should specify: on reconnect, fetch events newer than the most recent event in local state and merge them.**
  - Severity: **major** — This is a data integrity issue for the user experience.
- Step 5: Prolonged disconnect (user's laptop sleeps for hours)
  - **GAP: No specification of behavior when the page becomes visible again after a long sleep. The local event list may be very stale. Should the component detect visibility change (`document.visibilitychange`) and refresh? The spec is silent on this.**
  - Severity: **minor** — Edge case, but common in practice (user leaves tab open overnight).

**Result: 3 GAPs found (2 major, 1 minor)**

---

## Scenario 6: High Volume — 50 Webhooks in 1 Minute

- Step 1: Burst of GitHub activity — 50 webhooks arrive within 60 seconds
  - Spec: Each webhook hits `/api/webhooks/github` independently ✓
- Step 2: Vercel processes concurrent requests
  - Spec: Vercel serverless functions handle concurrency natively ✓ (implied by choice of Vercel)
- Step 3: Each request verifies signature, extracts event, inserts into Supabase
  - Spec: Individual request flow is well-defined (Section 4.1, 9.1) ✓
- Step 4: 50 inserts hit Supabase Postgres concurrently
  - **GAP: No specification of Supabase connection pooling or rate limits. Supabase free tier has connection limits. 50 concurrent serverless function instances each creating a new `createClient()` connection could exhaust the pool. The spec should mention connection handling (PgBouncer is default on Supabase, but worth documenting).**
  - Severity: **major** — On free tier, Supabase allows limited direct connections. Vercel serverless functions are stateless, so each invocation creates a fresh client. With 50 concurrent functions, this could fail.
- Step 5: Supabase Realtime fires 50 INSERT notifications
  - Spec: Realtime publishes each INSERT (Section 2.1) ✓
- Step 6: Browser receives 50 events rapidly
  - Spec: `setEvents(prev => [payload.new as GitMoltEvent, ...prev].slice(0, 200))` — each event triggers a state update (Section 9.3) ✓
  - **GAP: 50 rapid state updates means 50 React re-renders within seconds. The spec does not address batching or throttling. React 18's automatic batching helps for some cases, but Supabase Realtime callbacks are async and may not benefit. Performance could degrade on lower-end devices.**
  - Severity: **minor** — React 18 handles this reasonably well in practice, but spec should acknowledge the concern and note that the `.slice(0, 200)` cap prevents unbounded growth.
- Step 7: Feed shows events in correct order (newest first)
  - Spec: Prepend to array ensures newest first ✓
  - **ISSUE: If 50 events arrive near-simultaneously, the Realtime delivery order is not guaranteed to match `created_at` order. Events could appear slightly out of order in the feed. The spec assumes Realtime delivers in insertion order, but this is not guaranteed under high concurrency.**
  - Severity: **minor** — Slight ordering inconsistency is acceptable for a live feed, but worth noting.
- Step 8: Memory usage with 200 event cap
  - Spec: `.slice(0, 200)` prevents unbounded growth (Section 9.3) ✓ — Good design.

**Result: 2 GAPs found (1 major, 1 minor), 1 ISSUE (minor)**

---

## Scenario 7: Page Load with No Events — Empty State

- Step 1: User visits `/live` for the first time (no events in database)
  - Spec: Server component fetches from Supabase — `data` will be empty array or null (Section 9.2) ✓
- Step 2: `initialEvents` passed to LiveFeed is `[]` (coalesced from null via `data ?? []`)
  - Spec: `(data ?? []) as GitMoltEvent[]` handles null case (Section 9.2) ✓
- Step 3: LiveFeed renders with empty events array
  - Spec: `{events.length === 0 && <EmptyState />}` shows empty state component (Section 9.3) ✓
- Step 4: EmptyState component renders
  - **GAP: The `EmptyState` function is defined as a stub: `function EmptyState() { /* "No activity yet" message */ }`. The actual content, styling, and messaging are not specified. Should it have an illustration? A "check back later" message? A link to the GitHub App setup?**
  - Severity: **minor** — The mechanism exists but the content is unspecified.
- Step 5: Realtime subscription is active even with no initial events
  - Spec: useEffect runs regardless of initial state (Section 9.3) ✓
- Step 6: First event arrives via Realtime
  - Spec: Event prepended to empty array, EmptyState disappears, EventCard appears ✓
- Step 7: Supabase server query fails during page load (Supabase down)
  - **GAP: Section 9.2 does `const { data } = await supabase.from("events").select(...)` but does not destructure `error`. If the query fails, `data` is null, which is handled by `data ?? []`. But the user sees an empty state with no indication that data loading failed — they might think there are genuinely no events. No error state or retry mechanism is specified for the server-side fetch.**
  - Severity: **major** — Silent failure masquerades as "no events," misleading the user.

**Result: 2 GAPs found (1 major, 1 minor)**

---

## Cross-Cutting Findings

### Webhook Handler Missing `x-github-event` Validation
- The route reads `x-github-event` via `request.headers.get("x-github-event") ?? ""` (Section 9.1). An empty string is passed to `extractEvent`. The spec does not specify behavior when the header is missing entirely — `extractEvent` will receive `""` as eventName and return null, so it fails safely. But the spec should document this explicitly.
- Severity: **minor**

### No Rate Limiting on Webhook Endpoint
- The webhook endpoint has no rate limiting. While GitHub is the intended caller, the endpoint URL is public. An attacker who discovers the URL but not the secret would receive 401s, but could still flood the endpoint with requests, consuming Vercel function invocations.
- **GAP: No mention of rate limiting or abuse protection for the webhook endpoint.**
- Severity: **minor** — GitHub already throttles webhooks, and the signature check is cheap. But for production hardening, this should be noted.

### Supabase Client Instantiation in useEffect
- Section 9.3 creates a new Supabase client on every render cycle if the component remounts. While `useEffect` with `[]` dependency should only run once, React StrictMode double-invokes effects in development. The cleanup (`removeChannel`) handles this, but the spec does not mention StrictMode behavior.
- Severity: **minor** — Only affects development, not production.

---

## Summary

| # | Scenario | GAPs | ISSUEs | Severity |
|---|----------|------|--------|----------|
| 1 | Happy path: webhook → stored → /live | 0 | 0 | -- |
| 2 | Invalid signature → rejected | 1 | 0 | minor |
| 3 | Duplicate delivery → ignored | 1 | 0 | minor |
| 4 | Non-gitmolt event → filtered | 1 | 0 | minor |
| 5 | Realtime disconnects → reconnects | 3 | 0 | major |
| 6 | High volume: 50 webhooks/min | 2 | 1 | major |
| 7 | Page load with no events | 2 | 0 | major |
| -- | Cross-cutting | 3 | 0 | minor |

**Total scenarios: 7 (+1 cross-cutting)**
**Total GAPs: 13**
**Total ISSUEs: 1**

### By Severity
- **critical: 0**
- **major: 4** — Missed events during Realtime disconnect (no backfill), reconnect detection absent, Supabase connection pooling under concurrency, silent failure on server-side fetch
- **minor: 10** — Signature algorithm mismatch handling, concurrent duplicate explanation, payload path for PR review branch, React batching note, Realtime ordering, EmptyState content, rate limiting, StrictMode, event header validation, visibility change handling

### Top Gaps Requiring Specification

1. **Realtime disconnect recovery (major)**: Events during disconnect are lost with no backfill. Spec should define: detect channel re-subscription, fetch events newer than latest local event, merge into state.
2. **Server-side fetch error handling (major)**: Query failure silently shows empty state. Spec should define error destructuring and an error UI or retry.
3. **Supabase connection pooling (major)**: Under concurrent load, serverless function connection exhaustion is a real risk. Spec should note Supabase's PgBouncer pooling and recommend the `@supabase/ssr` pattern or connection string pooler.
4. **Reconnect backfill after disconnect (major)**: Related to #1 — the mechanism to re-fetch missed events needs specification.
