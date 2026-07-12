import { Router } from 'express';
import { signup, login, getMe } from '../controllers/authController.js';
import { authMiddleware, attachUser } from '../middleware/auth.js';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', authMiddleware, attachUser, getMe);

export default router;
