import express from 'express';
import { getSystemStatus } from '../controllers/statusController.js';

const router = express.Router();

router.get('/', getSystemStatus);

export default router;
