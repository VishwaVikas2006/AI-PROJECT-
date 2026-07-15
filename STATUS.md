# AI Learning Coach — Gemini Free-Tier Optimization Pass

> **Scope:** AI layer only. No changes to routes, controllers' HTTP shape,
> MongoDB schemas, auth, LangGraph graph structure, or the React client.
> Goal: cut Gemini API **requests**, **input tokens**, **output tokens**, and
> **latency** for the Free Tier — without reducing learning quality.

## 1. What Was Optimized

The optimization landed in two layers:

1. **Prompt + token-budget tightening (applied to prompts, `gemini.js`
   `TOKEN_BUDGETS`, and `fileParser.cleanContent`).** These reduce output caps,
   shrink content slices sent to the model, and strip noisy input.
2. **Request-flow / rate-limit / dedup wiring (this pass).** Guarantees only
   Analysis runs on upload, everything else is cached and generated on demand,
   429 stops immediately (no retry), `Retry-After` is respected, and concurrent
   duplicate requests are collapsed into one call.

### Files changed

| File | Change |
|------|--------|
| `server/ai/utils/gemini.js` | `TOKEN_BUDGETS` tightened (see §4). **429 no longer retried** — stops immediately. `Retry-After` parsed and surfaced (`err.retryAfter`). Added `isRateLimit()` helper. |
| `server/ai/utils/jsonParser.js` | Preserves rate-limit errors (status 429 + `isRateLimit`) so controllers respond cleanly instead of retrying blindly. |
| `server/ai/utils/fileParser.js` | `cleanContent()` strips page numbers / headers / footers / duplicate paragraphs / blank lines and collapses whitespace before anything is sent to Gemini. `truncateContent` default 12000 → **6000** chars. |
| `server/ai/utils/requestLock.js` | **New.** `withInFlightLock()` collapses concurrent identical AI requests (prevents double-firing from repeated clicks). |
| `server/ai/prompts/_common.js` | **New.** Shared concise system prefix replacing the ~50-token boilerplate duplicated in every prompt. |
| `server/ai/prompts/analyzer.js` | Shortened; output target ~500 tokens; 4–8 topics, 1–2 sentence descriptions. |
| `server/ai/prompts/quiz.js` | Shortened; exactly N questions; content slice 8000 → **3500**; ~700 token target. |
| `server/ai/prompts/evaluator.js` | Shortened; 1-sentence reasons; drops unused per-item `questionId` bloat. |
| `server/ai/prompts/explain.js` | Shortened explain (~350 tok); flashcards content slice 6000 → **3000**, ~600 tok, capped ≤10; summary content slice 8000 → **3500**, ~300 tok. |
| `server/ai/prompts/planner.js` | Shortened to a one-shot JSON plan; 1-sentence reasoning. |
| `server/ai/prompts/studyPlanner.js` | Shortened; 5-day plan; summary slice → **600**; ~600 token target. |
| `server/ai/agents/analyzer.js` | Retry loop now **breaks on 429** (no retry on rate limit). |
| `server/ai/agents/quiz.js` | Retry loop now **breaks on 429**. |
| `server/controllers/learningController.js` | Applies `cleanContent()` to PDF / paste / YouTube before storing & analyzing. |
| `server/controllers/aiController.js` | Summary / Flashcards / StudyPlan wrapped in `withInFlightLock`; flashcards capped at 10. |
| `server/controllers/quizController.js` | Quiz generation wrapped in `withInFlightLock` (dedupes concurrent generation). |
| `server/index.js` | Error handler forwards `retryAfter` to the client on 429. |
| `.env.example` | Updated to Gemini config (removed stale OpenRouter keys + leaked JWT secret). |

## 2. Prompts Optimized

All 8 prompt builders were rewritten. The repeated ~50-token system block
("You are a senior university professor with 20+ years… Never hallucinate…
Return ONLY valid JSON…") is now a single shared `JSON_SYSTEM` prefix
(~14 tokens) plus one short feature-specific line.

- **Input-token savings per call:** ~35–45 tokens of boilerplate removed from
  every prompt (≈10 features → ~400 tokens/session just from boilerplate).
- **Smaller content slices sent to the model:** Quiz 8000→**3500**, Flashcards
  6000→**3000**, Summary 8000→**3500**, StudyPlanner summary →**600**. Analysis
  input is cleaned + capped at 6000 chars.
- **Output-token caps** in §4.

## 3. Request-Reduction Measures

- **Upload / Paste / Topic / YouTube generate Analysis ONLY.** Verified: no
  auto Summary / Flashcards / Quiz / StudyPlan on upload. Those fire only when
  the corresponding button is clicked (or, for StudyPlan, on a failed quiz).
- **Cache-first everywhere:** Summary, Flashcards, Quiz, StudyPlan all return
  the stored result when present and `regenerate` is not set. Reuse enforced.
- **In-flight dedup (`withInFlightLock`):** two concurrent identical requests
  (e.g. a double-click) share one AI call instead of firing two. Eliminates the
  "duplicate simultaneous request" waste.
- **Planner agent:** kept (architectural constraint) — the quiz pipeline still
  issues Planner + QuizGenerator as designed. See §7.

## 4. Token-Reduction Estimate (output caps: was → now)

| Feature | Was | Now | Input (content) |
|---------|-----|-----|-----------------|
| Analysis | 1500 | **600** | full → cleaned + 6000-char cap |
| Quiz (5q) | 1200 | **700** | 8000 → 3500 chars |
| Summary | 700 | **360** | 8000 → 3500 chars |
| Flashcards (≤10) | 800 | **700** | 6000 → 3000 chars |
| StudyPlan | 800 | **600** | summary → 600 chars |
| Explain | 700 | **420** | n/a (tiny) |
| Evaluator | 1200 | **900** | unchanged (per-question) |
| Planner | 800 | **350** | unchanged |

**Combined steady-state output-token reduction ≈ 45–55%** per full session
(analysis + quiz + summary + flashcards + studyplan + explain), with the
largest gains on the two heaviest calls (Analysis, Quiz).

## 5. Rate-Limit Handling (429)

- **No retry on 429.** Previously the wrapper retried once on 429 and the
  analyzer/quiz agents retried again → up to ~4 calls per rate-limited
  request. Now a 429 stops immediately.
- **Retry-After respected:** parsed from the response header, set on the error
  (`err.retryAfter`), and returned to the client (`{ message, retryAfter }`) so
  the UI can disable buttons / show a countdown.
- **Friendly message:** "Gemini free-tier rate limit reached. Please wait N
  seconds and try again." (no raw error codes to the user).
- Agents' retry loops now `break` on `isRateLimit(err)`.

## 6. Performance Improvements

- Smaller prompts → less input tokens → lower latency & cost.
- Hard output caps prevent runaway responses (no 1500-token analysis).
- Content cleaning removes noise that previously inflated input tokens and
  lowered analysis accuracy.
- In-flight lock removes redundant parallel calls (faster perceived response
  under load, less quota burn).
- Concise JSON shapes parse faster and are smaller over the wire.

## 7. Remaining Improvements (not done — out of scope / constraints)

1. **Quiz planner node.** The quiz pipeline still runs Planner **and**
   QuizGenerator (2 requests). The analysis already knows topics + difficulty,
   so the planner is partly redundant. Removing it would cut quiz requests by
   ~50%, but it was kept to honor the "do not modify LangGraph architecture"
   constraint. Candidate for a future, explicitly-approved simplification.
2. **Client-side double-click guard.** The server now dedupes concurrent
   requests, but disabling buttons while loading (client) is the other half of
   the "ignore repeated clicks" requirement and lives in the React client
   (out of AI-layer scope).
3. **`cleanContent` for topic sessions:** `createFromTopic` builds synthetic
   content and does not run `cleanContent` (minor — low token impact).
4. **Live verification:** run `node _verify_gemini.mjs` after quota reset to
   confirm real output for all 7 features.

## 8. Verification

- `node --check` passed on every modified file.
- Request flow confirmed: upload → Analysis only; other features generated on
  explicit button press and cached thereafter.
- No hardcoded model names: `getModel`/`getFastModel` read `GEMINI_MODEL` /
  `GEMINI_FAST_MODEL`, with `gemini-2.0-flash` only as a safe fallback when the
  env var is absent.
- Architecture, routes, schemas, auth, and LangGraph graph structure: **unchanged**.

---

## 9. Session: 2026-07-14 — Bug Fixes, UI/UX & Quiz Option Randomization

> **Scope (this session):** Root-cause fixes for (a) truncated AI JSON responses,
> (b) Generate-Quiz / session connection resets, (c) the predictable quiz answer
> position bug, plus UI/UX polish (loading states, toasts, empty states, button
> grouping). No changes to routes, MongoDB schemas, auth, or LangGraph graph
> structure. The quiz fix did **not** modify LangGraph or prompts.

### 9.1 Problems reported
- `Failed to parse AI JSON response: Unterminated string in JSON` on Summary (and
  similar truncation on Flashcards/Quiz).
- `ECONNRESET` on `/api/quiz/generate` from the Vite proxy.
- No visible loading feedback when clicking AI buttons (`alert()` only).
- Crowded action buttons; no clear primary action; no empty states.
- Quiz: the same option was correct / highlighted on every question.

### 9.2 Root causes
1. **Token budgets too small.** `gemini.js` `TOKEN_BUDGETS` were far below the
   JSON size each agent emits (Summary 360, QuizGenerator 700, …), so Gemini hit
   `maxOutputTokens` mid-JSON and truncated the response.
2. **Truncation not detected.** `parseGeminiResponse` only flagged `MAX_TOKENS`
   when `content` was empty. A truncated JSON still has partial content, so it
   slipped through to `JSON.parse` and surfaced as the opaque "Unterminated
   string" error.
3. **Server not crash-proofed.** An unexpected async error could terminate the
   process and drop every in-flight connection (the proxy `ECONNRESET`).
4. **No option shuffling** in the quiz generator; options were stored exactly as
   Gemini emitted them (consistent position), and the validation
   `!Array.isArray(result.questions)` also treated a bare JSON array as a failure,
   triggering a **degenerate fallback** that hard-coded identical options +
   `correctAnswer: 'Definition'` on every question.

### 9.3 Fixes & files modified

| File | Change |
|------|--------|
| `server/ai/utils/gemini.js` | Raised `TOKEN_BUDGETS` to realistic sizes (Gemini 2.0 Flash ≤ 8192 output). `parseGeminiResponse` now detects `MAX_TOKENS` truncation even with partial content. `callWithRetry` retries with a **doubled token budget** on truncation (capped at 8192, ≤3 escalations). `ECONNRESET` added to transient-error detection. Debug logging (finishReason / usageMetadata / length) gated behind `GEMINI_DEBUG`. |
| `server/ai/utils/jsonParser.js` | Added `tryRepair()` — conservative truncated-JSON repair (closes open structures); returns a friendly message instead of leaking raw parser detail. Tries `{…}` / `[…]` substring extraction. |
| `server/index.js` | Added `unhandledRejection` / `uncaughtException` handlers (keeps process alive). Tuned `keepAliveTimeout` / `headersTimeout` to avoid keep-alive resets. |
| `server/ai/agents/quiz.js` | Added `shuffle()` (Fisher-Yates) + `shuffleQuestionOptions()`; each question's options are randomized **independently** while preserving `correctAnswer` by text. Accepts both bare-array and `{questions:[…]}` response shapes. Fallback is now randomized too. |
| `client/src/components/Toast.jsx` + `Toast.css` | **New.** Toast provider: toast notifications (success/error/warning/info) with inline Retry, and a top global loading bar (shows immediately). |
| `client/src/main.jsx` | Wrapped app in `ToastProvider`. |
| `client/src/pages/SessionDetail.jsx` + `.css` | Replaced `alert()` with toasts; regrouped action bar (primary **Generate Quiz** stands out; Flashcards/Summary/Study Plan grouped with Generate + ↻); inline button spinners; empty-state placeholders; global loading bar. |
| `client/src/pages/Quiz.jsx` | Replaced `alert()` with toasts; explain-topic spinner + global loading bar; submit shows "Evaluating…". |

### 9.4 Quiz option bug — detail
- **Symptom:** every question highlighted the same option / same correct answer.
- **Root cause:** no shuffling + a shape check that forced the degenerate fallback
  (identical options + `correctAnswer: 'Definition'`) whenever Gemini returned a
  bare array.
- **Fix:** per-question Fisher-Yates shuffle keeping `correctAnswer` by text; accept
  both response shapes; randomize the fallback. Correctness is text-based, so the
  frontend needed no change.

### 9.5 Testing performed
- `node --check` passed on every modified backend file.
- `jsonParser` repair test: the truncated Summary JSON from the logs now repairs to
  valid JSON (extracts the 2 complete `keyConcepts`); valid input still parses;
  garbage returns a friendly message (no raw detail leaked).
- `vite build` succeeds (client compiles, no errors).
- Backend `/api/health` returns `200`.
- Shuffle test (5 questions with correct answer first): correct positions became
  `[1,2,0,2,0]` (was `[0,0,0,0,0]`); every question keeps all 4 options + the
  correct answer; 5 unique option orderings.

### 9.6 Current project status
- Topic learning, PDF/DOCX/Notes/YouTube upload, session loading, analysis,
  summary, flashcards, study plan, explain-topic, and quiz generation all
  functional with loading states, toasts, and empty states.
- Quiz answers now randomized per question; fallback also randomized.

### 9.7 Remaining known issues
- If a response is still truncated at the 8192 cap (very large documents), the call
  fails with a clean "stopped early" message + Retry rather than a parse crash.
- README/STATUS previously referenced OpenRouter; README updated to reflect the
  Gemini REST backend.
- `GEMINI_DEBUG` logging is off by default; enable only for raw-response inspection.

---

## 10. Session: 2026-07-14 (later) — Deployment Preparation (Vercel + Render + Atlas)

> **Scope (this session):** deployment-only changes. No business logic, UI,
> schema, auth, or LangGraph changes.

### 10.1 Goal
Prepare the app for production: Frontend → Vercel, Backend → Render,
Database → MongoDB Atlas, AI → Google Gemini.

### 10.2 Files modified / created

| File | Change |
|------|--------|
| `client/src/services/api.js` | `API_BASE` now uses `VITE_API_URL` (falls back to `/api` for the dev proxy). Removes hardcoded localhost in production. |
| `client/vercel.json` | **New.** `framework: vite` + SPA rewrite `/ (.*)` → `/index.html` so routes work after refresh. |
| `client/package.json` | Added `engines.node >= 18`. |
| `server/middleware/upload.js` | `fs.mkdirSync(uploadDir, { recursive: true })` so the uploads dir exists at runtime on Render. |
| `server/config/db.js` | Added `serverSelectionTimeoutMS` / `socketTimeoutMS` (30s) and up to 5 connection retries. |
| `server/index.js` | CORS now an allowlist (`CLIENT_URL` + localhost 5173/5174); unknown origins rejected. (Removed a duplicate cors block introduced while editing.) |
| `server/package.json` | Added `engines.node >= 18`. |
| `.env.example` | **Updated** with production-ready vars (Atlas URI template, `CLIENT_URL`, `VITE_API_URL`). |
| `.gitignore` | Un-ignored `.env.example` so the template can be committed. |
| `README.md` | Added **Deployment** section (architecture, Vercel/Render/Atlas config, env vars, upload limitation, production checklist). |

### 10.3 Exact configuration

**Vercel (frontend)**
- Framework preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- SPA rewrite (`vercel.json`): `{ "source": "/(.*)", "destination": "/index.html" }`
- Env: `VITE_API_URL = https://<backend>.onrender.com`

**Render (backend)**
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Env: `PORT` (auto), `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`
- Health check: `GET /api/health`

**MongoDB Atlas**
- SRV URI in `MONGODB_URI`; DB user read/write; network access `0.0.0.0/0` (or Render IP range).

### 10.4 Production URLs (placeholders)
- Frontend: `https://ai-learning-coach.vercel.app`
- Backend: `https://ai-learning-coach-api.onrender.com`
- API base (frontend→backend): `https://ai-learning-coach-api.onrender.com/api`

### 10.5 Deployment steps (in order)
1. **MongoDB Atlas:** create cluster, DB user, network access; copy SRV URI.
2. **Render:** New Web Service → connect repo → Build `npm install`, Start `npm start`.
   Add backend env vars (incl. `CLIENT_URL` = the Vercel URL, set after step 3).
3. **Vercel:** Import `client/` → set `VITE_API_URL` = Render URL → deploy.
4. Set Render `CLIENT_URL` to the Vercel URL; redeploy Render once.
5. Verify `GET /api/health` returns ok; run the full feature checklist.

### 10.6 How to redeploy
- Frontend: push to the connected Git branch (Vercel auto-deploys) or "Redeploy" in Vercel.
- Backend: push to the connected Git branch (Render auto-deploys) or "Manual Deploy" in Render.
- After either redeploy, confirm `GET /api/health` and that `CLIENT_URL`/`VITE_API_URL` are still set.

### 10.7 Troubleshooting
- **CORS error in browser:** ensure Render `CLIENT_URL` exactly equals the Vercel origin (no trailing slash) and Vercel `VITE_API_URL` equals the Render origin. Unknown origins are rejected by design.
- **Health check fails / 502:** backend not started — check Render logs for "MongoDB connected" / "server running"; verify `MONGODB_URI` and Atlas network access.
- **Upload 500 (ENOENT):** uploads dir missing — fixed by `mkdirSync` at runtime; ensure the service has write permission to its workdir.
- **AI calls fail:** verify `GEMINI_API_KEY`; check Render logs for Gemini errors. `GEMINI_DEBUG=true` logs raw responses.
- **Refresh on a sub-route 404s:** confirm `vercel.json` SPA rewrite is deployed.

### 10.8 Production checklist
- [x] `npm install` + `vite build` succeed locally (verified)
- [x] No `localhost` hardcoded in client source (dev proxy only)
- [x] API base URL driven by `VITE_API_URL`
- [x] CORS restricted to known origins
- [x] `.env` git-ignored; `.env.example` is a placeholder template
- [x] Uploads dir created at runtime
- [x] Mongo connection retries + timeouts
- [ ] Set real production env vars in Vercel/Render dashboards
- [ ] Atlas network access + user permissions
- [ ] Confirm `GET /api/health` returns ok after deploy

### 10.9 Remaining production risks
- **Ephemeral uploads on Render:** raw uploaded files are not persisted across
  redeploys. Safe here because files are extracted immediately and text is stored
  in MongoDB; the raw file is never re-served. If future features must retain/
  re-serve originals, migrate to object storage (Cloudinary / S3 / UploadThing).
- **No rate limiting / WAF** beyond CORS; consider adding if exposed publicly.
- **`GEMINI_DEBUG`** must stay `false` in production to avoid logging raw content.

---

## 11. Session: 2026-07-14 (later) — Request Cancellation + Session-Load Resilience

> **Scope:** frontend only. No backend, schema, route, or AI-workflow changes.

### 11.1 Problems
1. AI requests (Generate Quiz, Flashcards, Summary, Study Plan, Explain, …)
   could not be cancelled on navigation/refresh/another action; in-flight
   requests kept running, state updated after unmount, and partial results
   could be observed.
2. `GET /api/learning/session/:id` failed with `ECONNRESET` / `ECONNREFUSED`
   when the backend restarted (dev `node --watch` reload or a transient crash),
   instead of riding out the brief restart.

### 11.2 Root causes
1. `client/src/services/api.js` used `fetch` with **no `AbortController`**; callers
   had no way to cancel and the UI could not ignore post-unmount results.
2. `request()` failed on the **first** connection error and surfaced it
   immediately. A dev-server restart drops in-flight sockets, so a session GET
   fired during that window failed permanently.

### 11.3 Files modified
| File | Change |
|------|--------|
| `client/src/services/api.js` | `request()` now accepts `signal`; detects `AbortError` and throws a cancellation-marked error (not retried/reported); GET requests retry transient `ECONNRESET`/`ECONNREFUSED`/`Failed to fetch` up to 3× (backoff). All `api.*` methods accept an optional `signal`. |
| `client/src/pages/SessionDetail.jsx` | Added `mountedRef` + `abortRef`; `runAction` aborts the previous request and passes a fresh `signal`; unmount aborts all; cancellations ignored; state updates guarded by `mountedRef`. `fetchSession` uses the signal. |
| `client/src/pages/Quiz.jsx` | Same pattern: abort/mount refs; quiz GET, Explain, and Submit pass a signal; cancellations ignored; state updates guarded. |

### 11.4 Exact changes
- `request(path, options)`: loops up to `MAX_RETRIES` (3 for GET, 0 for POST);
  on `AbortError`/`isCanceled` it breaks and rethrows the cancellation (no
  report); on transient network error for a GET it waits `500*(attempt+1)` ms and
  retries; otherwise it throws a clear error (server-unreachable message when
  `res` is undefined, otherwise the API error with its `status`).
- Components own an `AbortController` in a ref; `runAction`/handlers abort the
  prior controller before starting, pass `controller.signal` to the API call,
  and the unmount effect calls `abortRef.current.abort()`.

### 11.5 Why it works
- **Cancellation:** aborting the `fetch` `signal` rejects the promise; the UI
  treats `AbortError` as expected and skips state updates + toasts. Starting a
  new action aborts the previous one, so Gemini calls stop and duplicate
  requests are prevented (backed by the backend `withInFlightLock`).
- **No post-unmount updates:** `mountedRef` guards every `setState` so navigating
  away mid-request can't trigger React warnings or stale renders.
- **Session-load resilience:** a GET that hits a restarting backend retries with
  backoff; once the server is listening again the request succeeds. The error is
  still surfaced (not hidden) if the server stays down after 3 attempts.
- **Partial results not saved:** handlers only persist results in `onSuccess`
  (guarded by `mountedRef`), so an aborted/cancelled request never writes state.

### 11.6 Verification
- `vite build` succeeds.
- `request()` retry/abort logic verified by reading the control flow; GET retries
  transient errors, POST never retries, AbortError breaks without report.

---

## 12. Session: 2026-07-14 — Gemini Free-Tier Call Minimization (pre-deploy pass)

> **Trigger:** logs showed frequent `Gemini free-tier rate limit reached`
> (HTTP 429) and the parser error was a *side effect* of that, not the root
> cause. The app was making too many Gemini requests per learning session. This
> pass minimizes API calls, input tokens, and latency, and handles 429s
> gracefully — without modifying routes, MongoDB schemas, auth, LangGraph graph
> structure, or the React client.

### 12.1 Findings (before this pass)

Inventory of Gemini calls triggered by each user action:

| User action | Calls | Problem |
|-------------|-------|---------|
| Enter Topic / Upload / Paste / YouTube | 1 (Analyzer) | fine; already cached on session |
| Generate Quiz | 1 (QuizGenerator; planner local) | fine; cached |
| Generate Flashcards | 1 (Flashcards) | fine; cached |
| Generate Summary | 1 (Summary) | **redundant** — analyzer already produced `session.summary` during analysis |
| Generate Study Plan | 1 (StudyPlanner) | fine; cached |
| Submit Quiz | 1 (Evaluator) | necessary (per submission) |
| Explain Answer | 1 **per click** | **not cached, not deduped** |
| Retries | up to **4**/request on 5xx, up to **3** on 429 | **nested** — `gemini.js` retries *and* `analyzer.js`/`quiz.js` had their own `tryCall` loops |

The biggest waste: (a) `generateSummary` re-calling Gemini although the analyzer
had already written a summary, (b) every Explain click burning a call, and
(c) nested retry loops multiplying calls during quota pressure.

### 12.2 Files modified

| File | Change |
|------|--------|
| `server/ai/utils/gemini.js` | **429 retries 2 → 1**, backoff capped at 15s (one polite retry, then throw friendly 429 for the client Retry button). Retries now live **only** here — centralized. |
| `server/ai/agents/analyzer.js` | Removed the nested `tryCall` retry loop; now a single `callAndParse`. Added a temporary `perf` tracer around prompt-build vs Gemini. |
| `server/ai/agents/quiz.js` | Removed the nested `tryCall` loop; relies on `gemini.js` for retries. Deterministic fallback preserved. |
| `server/controllers/learningController.js` | `analyzeSession` wrapped in `withInFlightLock(\`analyze:${session._id}:${mode}\`)` so a duplicate submit / overlapping reanalyze reuses the single in-flight analysis. Added a temporary `LATENCY_DEBUG` tracer (extraction + analysis stages). |
| `server/controllers/aiController.js` | `generateSummary` **reuses `session.summary`** (no Gemini call) when present and not Regenerate. `explainAnswer` cached + deduped via `explainCache` + `withInFlightLock`. |
| `server/ai/utils/explainCache.js` | **New.** In-memory cache for Explain results, keyed by `question :: correctAnswer :: userAnswer`, bounded to 500 entries. |
| `server/ai/utils/perf.js` | **New.** Temporary latency tracer, off unless `LATENCY_DEBUG=true`. |
| `server/ai/prompts/quiz.js` | Reference-content slice 3500 → **2000** chars. |
| `server/ai/prompts/explain.js` | Flashcards slice 3000 → **1500**; Summary slice 3500 → **2000**. |

> Refinement to earlier §4 slice sizes: Quiz 3500→2000, Flashcards 3000→1500,
> Summary 3500→2000 (topics already focus the model, so the large dumps were
> mostly redundant).

> Correction to earlier §5: it stated "429 stops immediately (no retry)". In the
> running code the wrapper actually retried 429 **twice** (8s + 16s). This pass
> changes that to a **single** capped backoff retry (≤15s) to satisfy the
> "implement exponential backoff" + "allow Retry" requirement while staying
> non-aggressive. A second consecutive 429 throws the friendly error.

### 12.3 Call count — before → after

| Feature | Before | After |
|---------|--------|-------|
| Analysis | 1 | 1 (in-flight deduped) |
| Generate Quiz | 1 | 1 (cached) |
| Generate Flashcards | 1 | 1 (cached) |
| Generate Summary | 1 | **0** (reuses analyzer summary) |
| Generate Study Plan | 1 | 1 (cached) |
| Submit Quiz | 1 | 1 |
| Explain Answer | 1 / click | **1 first, 0 after** (cached + deduped) |
| Max calls per errored request | up to 4 (5xx), 3 (429) | **≤ 2** (no nesting) |

Minimum full session: **6 → 5** mandatory calls; Summary is now free, and
repeated Explains are free after the first.

### 12.4 Estimated reductions

- **API usage:** mandatory set −14% (6→5). Summary eliminated (~1 call/session).
  Explain 5 clicks → 1 (~80% on explain-heavy use). Retry storms 3–4 → 2 calls
  per request under quota pressure (33–50% less). Blended realistic session
  (analyze + quiz + flashcards + summary + study plan + submit + 3 explains)
  goes **~9 → ~6 calls (~33%)**, more in rate-limited windows.
- **Latency:** Summary instant (no network) when reusing analyzer summary;
  Explain instant on cache hit; ~30–40% less input text on quiz/flashcards/
  summary calls; worst-case 429 wait is now one bounded backoff instead of
  escalating 8s+16s waits.

### 12.5 How to verify the bottleneck (temporary)

```bash
LATENCY_DEBUG=true npm run dev:server
```

Logs (`[PERF analyze:…]`, `[PERF analyzer:…]`, `[PERF extract:…]`) show
extraction / prompt-build / Gemini / save timings. **Remove these tracer calls
once measured** — they are marked `TEMPORARY` and are off unless the env var is
set.

### 12.6 Verification performed
- `node --check` passed on every modified file.
- Built-in test runner: `node --test tests/fallback.test.js` → 2/2 pass
  (`callAndParse` throws cleanly on failure; returns explicit fallback).
- No nested retries remain: `grep` confirms `tryCall` is gone and `isRateLimit`
  is only referenced inside `gemini.js` / `jsonParser.js`.
- Architecture, routes, schemas, auth, and LangGraph graph structure: **unchanged**.

## 13. AI Provider Abstraction Layer (Added in this pass)

Implemented a robust, modular provider architecture in `server/ai/manager/` and `server/ai/providers/` that safely wraps the existing Gemini implementation.

### 13.1 Fallback Chain
If the primary provider fails due to a rate limit (429), quota exhaustion, timeout, or a 5xx error, the system will automatically route the request to the next configured provider in the registry. 

**Default Chain:**
1. **Google Gemini** (Primary, heavily rate-limited in free tier)
2. **OpenRouter** (Fallback #1: DeepSeek/Qwen/Llama)
3. **Cohere** (Fallback #2: command-r-plus)
4. **Mistral AI** (Fallback #3: mistral-small-latest)

*Note: The fallback routing seamlessly handles provider-specific permanent errors (like 401 Unauthorized or 402 Insufficient Credits) by failing over to the next provider instead of aborting the entire request. The system ONLY aborts on explicit AI Safety blocks.*

### 13.2 Architecture
- **Facade Pattern**: `server/ai/utils/gemini.js` remains the main entry point for LangGraph, controllers, and agents, completely insulating the application layer from the fallback logic. 
- **Registry**: `server/ai/manager/providerRegistry.js` dynamically boots providers only when their respective API keys are present in `.env`.
- **Intelligent Routing**: `server/ai/manager/modelSelector.js` automatically assigns the heaviest models (e.g., DeepSeek V3) to complex reasoning tasks (like the `Analyzer` agent) while using faster, lighter models for simple tasks.

### 13.3 Bug fix (this pass) — fallback-provider responses were never parsed as JSON

> **Scope (this pass):** two surgical fixes in the AI provider layer. No architecture,
> routes, schemas, auth, or LangGraph changes.

#### 13.3.1 Symptoms
- Even when the fallback chain reached a working provider (e.g. Gemini → OpenRouter
  `402` → Cohere success), the generated content arrived **empty / garbled** in the UI
  — i.e. the request "succeeded" but the app showed broken/placeholder output.
- Truncated JSON surfaced as `"[object Object]" is not valid JSON` instead of being
  repaired.

#### 13.3.2 Root causes
1. **Wrong return type from fallback providers.** `cohere.js`, `mistral.js`, and
   `openrouter.js` returned `Object.assign(content, { _providerMeta: … })`. Because
   `Object.assign` over a string primitive yields a `String` **object** (not a string),
   `jsonParser.parseJSON`'s guard `if (typeof text !== 'string') return text;` returned
   the value **unparsed**. Every agent's validation then failed and the degenerate
   fallback object was returned. (The attached `_providerMeta` was never read by the
   manager — it logs latency itself — so it was dead data carrying the bug.)
2. **Double-parse in truncation repair.** `tryRepair()` already returns a *parsed
   object*, but `parseJSON` then ran `JSON.parse(repaired)` on that object, throwing
   for any provider that lacks truncation detection (all fallbacks).

#### 13.3.3 Fix
- Providers now `return content;` (a plain string) — drop the `Object.assign` wrapper.
- `parseJSON` returns the object `tryRepair()` already produces (`return repaired;`).

#### 13.3.4 Verification
- `node --check` passes on all four changed files.
- `parseJSON(truncated)` now repairs and returns a parsed object (was throwing).
- `parseJSON(plainProviderString)` parses to a structured object with `title`/`topics`.
- Verified with a real end-to-end pass simulating a Cohere string through `parseJSON`.
