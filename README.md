# AI Learning Coach

**An agentic AI-powered personalized learning platform** that converts study material into adaptive learning paths using the Google Gemini REST API, LangGraph, React, Express, and MongoDB.

## Architecture

```
                React Frontend
                       │
        ─────────────────────────
                       │
              Express Backend
                       │
         Authentication & APIs
                       │
         ───────────────────────
        │            │          │
    MongoDB     OpenRouter   LangGraph
        │            │          │
        └────────────┴──────────┘
               AI Workflow
```

## Agent Pipeline (LangGraph)

```
Planner Agent → Quiz Generator Agent → User Answers → Evaluator Agent
                                                          │
                                    ┌─────────────────────┴─────────────────────┐
                                    ▼                                           ▼
                              Passed (≥70%)                              Failed / Weak Topics
                                    │                                           │
                              Dashboard                              Study Planner Agent
```

### Agents

| Agent | Role |
|-------|------|
| **Content Analyzer** | Extracts topics, difficulty, objectives, study time, summary |
| **Planner** | Decides quiz difficulty & focus topics based on mastery |
| **Quiz Generator** | Creates MCQ, T/F, short answer, coding questions |
| **Evaluator** | Semantic answer evaluation with confidence & weak topic detection |
| **Study Planner** | Generates personalized daily remediation plans |
| **Explain Answer** | Tutor-style explanations with real-world examples |

## Tech Stack

- **Frontend:** React, Vite, React Router
- **Backend:** Node.js, Express
- **Database:** MongoDB (Mongoose)
- **AI:** Google Gemini REST API (`gemini-2.0-flash`)
- **Agents:** LangGraph (@langchain/langgraph)

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- OpenRouter API key ([openrouter.ai](https://openrouter.ai))

### Setup

1. **Clone and configure environment**

```bash
cp .env.example .env
# Edit .env with your MONGODB_URI, JWT_SECRET, and OPENROUTER_API_KEY
```

2. **Install server dependencies**

```bash
cd server
npm install
```

3. **Install client dependencies**

```bash
cd ../client
npm install
```

4. **Start MongoDB** (if running locally)

5. **Run the server**

```bash
cd server
npm run dev
```

6. **Run the client** (in a new terminal)

```bash
cd client
npm run dev
```

7. Open **http://localhost:5173**

## API Endpoints

### Auth
- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Current user

### Learning
- `POST /api/learning/upload` — Upload PDF/DOCX/TXT
- `POST /api/learning/paste` — Paste notes
- `POST /api/learning/topic` — Enter a topic
- `POST /api/learning/youtube` — YouTube URL
- `GET /api/learning/sessions` — List sessions
- `GET /api/learning/session/:id` — Session detail

### Quiz
- `POST /api/quiz/generate` — Generate adaptive quiz (LangGraph workflow)
- `GET /api/quiz/quiz/:id` — Get quiz (answers hidden)
- `POST /api/quiz/submit` — Submit & evaluate
- `GET /api/quiz/history` — Attempt history

### AI
- `POST /api/ai/explain` — Explain an answer
- `POST /api/ai/study-plan` — Generate study plan
- `POST /api/ai/summary` — Quick summary
- `POST /api/ai/flashcards` — Generate flashcards

### Dashboard
- `GET /api/dashboard/progress` — Topic mastery graph
- `GET /api/dashboard/analytics` — Streak, accuracy, weak topics
- `GET /api/dashboard/weak-topics` — Weak areas

## MongoDB Collections

- **User** — Authentication
- **LearningSession** — Analyzed study material
- **Quiz** — Generated questions
- **Attempt** — Quiz submissions with evaluations
- **Progress** — Per-topic mastery knowledge graph
- **StudyPlan** — Daily remediation plans

## Project Structure

```
client/                 # React frontend
server/
  controllers/          # Route handlers
  routes/               # Express routes
  models/               # Mongoose schemas
  middleware/           # Auth, file upload
  ai/
    agents/             # Individual AI agents
    langgraph/          # LangGraph workflows
    prompts/            # Prompt templates
    utils/              # Gemini client, file parsing, request lock, explain cache, perf
uploads/                # Uploaded files
```

## Quiz Generation Workflow

`POST /api/quiz/generate` → `quizController.generateQuiz`:

1. **Session check** — the session must exist, have `analysisStatus: 'completed'`,
   and have at least one topic. Otherwise a `400` is returned (the Generate Quiz
   button is also disabled in the UI until analysis completes).
2. **Cache** — if a quiz with the same `questionCount` (always 5) already exists
   and this is not a regenerate, it is returned immediately.
3. **In-flight lock** — `withInFlightLock` de-duplicates concurrent requests for
   the same session so a double-click cannot spend quota twice.
4. **LangGraph workflow** — `plannerNode` (`runPlannerAgent`) decides difficulty /
   topics, then `quizGeneratorNode` (`runQuizGeneratorAgent`) builds the questions.
5. **Gemini call** — `runQuizGeneratorAgent` calls Gemini with `responseMimeType:
   application/json`, parses the response, validates each question, and **shuffles
   the options** (see below).
6. **Persist** — the validated, shuffled quiz is saved to the `Quiz` collection.

### Request shape handling
Gemini may return either a **bare JSON array** of questions or an object wrapping
them under a `questions` key. Other providers (Cohere, Mistral, OpenRouter
non-Gemini models) sometimes wrap the array under a different top-level key
(`quiz`, `items`, or `data`). The generator normalizes **all** of these equivalent
shapes to `rawQuestions` **before** validation, so a valid response is never
mistaken for a failure (which previously triggered the degenerate fallback with
identical options on every question).

This was the root cause of the intermittent `"Quiz generator returned invalid
question set"` error when using providers other than Gemini: the previous code
only unwrapped `questions` / a bare array, so a response wrapped under `quiz`,
`items`, or `data` failed the `Array.isArray(rawQuestions)` check and fell through
to the fallback. The fix is a **shape normalization only** — question-content
validation remains exactly as strict as before.

### Fallback
If the AI call fails (parse error, rate limit, truncation after retries), the
generator returns a safe fallback quiz. The fallback is **also randomized** so it
never produces a fixed answer pattern.

## How Answer Randomization Works

Correctness is matched by **option text**, not by array index — this keeps
randomization simple and robust:

- `shuffle()` — a Fisher-Yates shuffle that returns a **new** array (never mutates
  the input).
- `shuffleQuestionOptions(question)` — shuffles `question.options`, then keeps
  `question.correctAnswer` as the option text. Because the correct answer text is
  still present in the shuffled array, the answer mapping is preserved with no
  index bookkeeping.
- Each question is shuffled **independently**, so correct-answer positions vary
  naturally across questions (e.g. A, D, B, C, A) instead of a fixed pattern.
- Safety: if the shuffled options no longer contain the exact `correctAnswer`
  string, the code falls back to a case-insensitive match, then to `options[0]`.

The frontend (`Quiz.jsx`) renders `question.options` in the received order, lets
the user pick an option, and submits the chosen **text**. The evaluator compares
the submitted text to `correctAnswer` — so server-side shuffling is fully
transparent to the client.

## Token Budgets & Truncation Handling

`gemini.js` defines per-agent `maxOutputTokens` budgets sized to fit the JSON each
agent emits (Gemini 2.0 Flash supports up to 8192 output tokens). If a response is
still truncated (`finishReason: MAX_TOKENS`), `callWithRetry` retries with a
doubled budget (capped at 8192, up to 3 escalation tries) instead of failing with
an opaque parse error. `parseGeminiResponse` detects truncation even when partial
content is present. `jsonParser.js` additionally attempts a defensive repair of
truncated JSON (closing open structures) as a safety net, and returns a friendly
message to the user instead of leaking raw parser detail.

## Gemini Free-Tier Call Minimization

The app is tuned to stay within the Gemini **Free Tier** quota: it makes the
minimum number of AI calls for a learning session and never re-calls Gemini for
content it already has. **Every** generated artifact is cached in MongoDB and
returned on subsequent requests unless the user explicitly presses **Regenerate**.

### Gemini calls per feature (current)

| User action | Gemini calls | Cached / reused |
|-------------|--------------|-----------------|
| Enter Topic / Upload / Paste / YouTube | **1** (Analyzer) | stored on the session |
| Generate Quiz | **1** (QuizGenerator) | cached in `Quiz` (Quiz always 5 Qs) |
| Generate Flashcards | **1** (Flashcards) | cached on the session |
| Generate Summary | **0** (reuses the analyzer's `session.summary`) | no extra call |
| Generate Study Plan | **1** (StudyPlanner) | cached in `StudyPlan` |
| Submit Quiz | **1** (Evaluator) | per submission (real evaluation) |
| Explain Answer | **1 first time, 0 after** | in-memory `explainCache` + in-flight lock |
| Failed quiz → remediation plan | +1 (StudyPlanner) | only when a quiz fails |

A full session therefore costs **~5 mandatory calls** (analysis + quiz +
flashcards + study plan + evaluation); **Summary and repeated Explains are free**.

### How the quota is protected

- **Cache-first:** Quiz, Flashcards, Study Plan, and the analyzer summary all
  return stored results when present and `regenerate` is not set.
- **Summary reuse:** the analyzer already produces `session.summary` during
  analysis, so `generateSummary` returns it directly instead of re-calling Gemini.
  Pressing **Regenerate** still produces the richer `studySummary`.
- **Explain cache (`ai/utils/explainCache.js`):** explanations are keyed by
  `question :: correctAnswer :: userAnswer` and cached in memory (bounded to 500
  entries), so re-clicking Explain — or revisiting a question — costs nothing.
- **In-flight dedup (`ai/utils/requestLock.js`):** concurrent identical requests
  (double-clicks, overlapping analysis) collapse into a single Gemini call.
  `analyzeSession` is wrapped so a duplicate submit / reanalyze reuses the
  in-flight analysis.
- **Calm retries (`ai/utils/gemini.js`):** all retries are centralized in the
  Gemini wrapper. A **single** polite, capped backoff (≤15s) is applied on a 429,
  then a friendly error is thrown for the client's **Retry** button — no
  aggressive hammering, no crash. Transient 5xx/timeout get one retry. (Per-agent
  retry loops were removed to stop nested retries multiplying a single user
  action into 3–4 calls.)
- **Smaller prompts:** quiz/flashcards/summary reference-content slices were
  trimmed (quiz 3500→2000, flashcards 3000→1500, summary 3500→2000 chars)
  because the analyzed topics already focus the model.

### Temporary latency instrumentation

Set `LATENCY_DEBUG=true` to log staged timings (`[PERF …]`): text extraction,
prompt build, the Gemini call, and MongoDB save. This is **off by default** and
should be removed once the slow steps are confirmed. Driven by
`ai/utils/perf.js`.

## Error Handling & UX

- **Toasts** (`client/src/components/Toast.jsx`) replace browser `alert()` for all
  AI errors, with an inline **Retry** button.
- A **global top loading bar** shows during AI operations, plus an inline spinner
  and label change on the active button ("Generating Quiz…", "Evaluating…", etc.).
- **Empty states** ("No flashcards generated yet.", etc.) appear before content
  exists.
- The server is **crash-proofed**: `unhandledRejection` / `uncaughtException`
  handlers in `server/index.js` keep the process alive so a single bad AI call
  cannot drop connections, and `keepAliveTimeout` / `headersTimeout` are tuned to
  avoid keep-alive resets.

## Deployment

| Layer     | Service        | Notes |
|-----------|----------------|-------|
| Frontend  | Vercel         | Static React build from `client/` |
| Backend   | Render         | Node + Express, `server/` |
| Database  | MongoDB Atlas  | Connection via `MONGODB_URI` |
| AI        | Google Gemini  | `GEMINI_API_KEY` |

### Frontend (Vercel)
- Build command: `npm run build` (output: `dist/`). Vercel auto-detects Vite; a
  `vercel.json` provides the SPA rewrite so client-side routes (e.g. `/sessions/:id`)
  work after a page refresh.
- Set the env var **`VITE_API_URL`** to the deployed backend, e.g.
  `https://ai-learning-coach-api.onrender.com` (no trailing slash). In local dev
  this is omitted and the Vite proxy forwards `/api` to `localhost:5000`.
- `client/src/services/api.js` builds the base URL as `${VITE_API_URL}/api`, so
  no `localhost` URLs reach production.

### Backend (Render)
- Start command: `npm start` (runs `node index.js`). `PORT` is read from the
  environment (Render injects it).
- Build command: `npm install`.
- Set env vars: `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL` (the Vercel URL),
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`.
- CORS allows `CLIENT_URL` plus `localhost:5173/5174`; unknown origins are
  rejected.
- MongoDB connection retries up to 5 times with a 30s server-selection timeout.

### MongoDB Atlas
- Use a SRV connection string in `MONGODB_URI`
  (`mongodb+srv://<user>:<pass>@<cluster>/ai-learning-coach`).
- Database user needs read/write on the target DB.
- Network access: allow `0.0.0.0/0` (or your Render IP range) so Render can
  connect.

### Environment Variables

**Frontend (Vercel)**
| Var | Example |
|-----|---------|
| `VITE_API_URL` | `https://ai-learning-coach-api.onrender.com` |

**Backend (Render)**
| Var | Example |
|-----|---------|
| `PORT` | `5000` (Render overrides) |
| `MONGODB_URI` | `mongodb+srv://…` |
| `JWT_SECRET` | long random string |
| `CLIENT_URL` | `https://ai-learning-coach.vercel.app` |
| `GEMINI_API_KEY` | `…` |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `GEMINI_FAST_MODEL` | `gemini-2.0-flash` |

> A template lives in `.env.example` — never commit real secrets (`.env` is
> git-ignored).

### File Uploads & Render's Ephemeral Filesystem (known limitation)
Uploaded PDF/DOCX/TXT files are written to a local `uploads/` directory that is
**created at runtime** (`middleware/upload.js`). Render's filesystem is ephemeral
— files written there do **not** survive redeploys/restarts. This is safe for
this app because uploaded files are **extracted and processed immediately**
(`extractTextFromFile`) and the resulting text is stored in MongoDB; the raw
file is never served back to clients. No file-content is lost on redeploy. If you
later need to retain or re-serve original files, migrate to object storage
(Cloudinary / AWS S3 / UploadThing) — not required for current behavior.

### Production Checklist
- [ ] `npm install` works on a clean machine (no missing/deprecated deps)
- [ ] `vite build` succeeds; `vercel.json` SPA rewrite present
- [ ] `VITE_API_URL` set on Vercel; `CLIENT_URL` set on Render to the Vercel URL
- [ ] `MONGODB_URI` points to Atlas; network access + user permissions correct
- [ ] `JWT_SECRET` is a strong random value (not the dev fallback)
- [ ] `GEMINI_API_KEY` valid; `npm start` logs "MongoDB connected" + "server running"
- [ ] `GET /api/health` returns `{ "status": "ok" }`
- [ ] CORS rejects unknown origins (verify from an unrelated domain)
- [ ] `.env` not tracked by Git

## License

MIT
