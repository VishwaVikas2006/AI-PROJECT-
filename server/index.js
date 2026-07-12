import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import learningRoutes from './routes/learningRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Ensure critical secrets exist during local development to avoid runtime crashes
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Using a development fallback secret. Do NOT use in production.');
  process.env.JWT_SECRET = 'dev_jwt_secret_change_in_production';
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY is not set. AI requests will fail until an API key is configured.');
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'AI Learning Coach API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const body = {
    message: err.message || 'Internal server error',
  };
  // Let the client respect the rate-limit backoff (Retry-After).
  if (status === 429 && err.retryAfter) {
    body.retryAfter = err.retryAfter;
  }
  res.status(status).json(body);
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`AI Learning Coach server running on port ${PORT}`);
  });
}
start();
