# AI Learning Coach

**An agentic AI-powered personalized learning platform** that converts study material into adaptive learning paths using OpenRouter (Gemini/GPT), LangGraph, React, Express, and MongoDB.

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
- **AI:** OpenRouter API (model-agnostic: Gemini, GPT, DeepSeek, etc.)
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
    utils/              # OpenRouter, file parsing
uploads/                # Uploaded files
```

## License

MIT
