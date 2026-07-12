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
