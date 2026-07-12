import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  generateQuiz,
  getQuiz,
  submitQuiz,
  getHistory,
  getAttempt,
} from '../controllers/quizController.js';

const router = Router();

router.use(authMiddleware);

router.post('/generate', generateQuiz);
router.get('/quiz/:id', getQuiz);
router.post('/submit', submitQuiz);
router.get('/history', getHistory);
router.get('/attempt/:id', getAttempt);

export default router;
