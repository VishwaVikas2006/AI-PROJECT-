import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getProgress, getAnalytics, getWeakTopics } from '../controllers/dashboardController.js';

const router = Router();

router.use(authMiddleware);

router.get('/progress', getProgress);
router.get('/analytics', getAnalytics);
router.get('/weak-topics', getWeakTopics);

export default router;
