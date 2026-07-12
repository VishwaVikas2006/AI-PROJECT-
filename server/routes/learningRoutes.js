import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import {
  uploadContent,
  createFromPaste,
  createFromTopic,
  createFromYoutube,
  getSessions,
  getSession,
  reanalyzeSession,
} from '../controllers/learningController.js';

const router = Router();

router.use(authMiddleware);

router.post('/upload', upload.single('file'), uploadContent);
router.post('/paste', createFromPaste);
router.post('/topic', createFromTopic);
router.post('/youtube', createFromYoutube);
router.get('/sessions', getSessions);
router.get('/session/:id', getSession);
router.post('/session/:id/analyze', reanalyzeSession);

export default router;
