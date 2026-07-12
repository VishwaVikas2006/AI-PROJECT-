import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  explainAnswer,
  generateStudyPlan,
  generateSummary,
  generateFlashcards,
  getStudyPlans,
} from '../controllers/aiController.js';

const router = Router();

router.use(authMiddleware);

router.post('/explain', explainAnswer);
router.post('/study-plan', generateStudyPlan);
router.post('/summary', generateSummary);
router.post('/flashcards', generateFlashcards);
router.get('/study-plans', getStudyPlans);

export default router;
