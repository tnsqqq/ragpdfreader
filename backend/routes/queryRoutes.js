import express from 'express';
import { askQuestion, askQuestionStream } from '../controllers/queryController.js';

const router = express.Router();

// Standard JSON QA endpoint
router.post('/', askQuestion);

// Streaming SSE QA endpoint
router.post('/stream', askQuestionStream);

export default router;
