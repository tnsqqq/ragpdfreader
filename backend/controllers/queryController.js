import { generateQueryEmbedding } from '../services/embeddingService.js';
import { querySimilarChunks } from '../services/chromaService.js';
import { generateRAGAnswer, streamRAGAnswer } from '../services/ragService.js';

/**
 * Handles standard JSON question answering over documents.
 */
export async function askQuestion(req, res) {
  try {
    const { query, documentId = null, topK = 5, history = [] } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid question in the "query" field.',
      });
    }

    const parsedTopK = Math.max(1, Math.min(Number(topK) || 5, 20));

    // 1. Generate embedding for user query
    const queryVector = await generateQueryEmbedding(query.trim());

    // 2. Retrieve top-k most relevant chunks
    const retrievedChunks = await querySimilarChunks(queryVector, parsedTopK, documentId || null);

    // 3. Generate synthesized answer with citations
    const result = await generateRAGAnswer({
      query: query.trim(),
      retrievedChunks,
      conversationHistory: history,
    });

    return res.json({
      success: true,
      query: query.trim(),
      answer: result.answer,
      sources: result.sources || [],
      metadata: {
        provider: result.provider,
        model: result.model,
        retrievedCount: retrievedChunks.length,
        filterDocumentId: documentId || null,
      },
    });
  } catch (error) {
    console.error('[Query Error]', error);
    return res.status(500).json({
      success: false,
      error: `Failed to answer query: ${error.message}`,
    });
  }
}

/**
 * Handles streaming Server-Sent Events (SSE) question answering.
 */
export async function askQuestionStream(req, res) {
  try {
    const { query, documentId = null, topK = 5, history = [] } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid query string.',
      });
    }

    const parsedTopK = Math.max(1, Math.min(Number(topK) || 5, 20));

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // 1. Embed query
    const queryVector = await generateQueryEmbedding(query.trim());

    // 2. Retrieve chunks
    const retrievedChunks = await querySimilarChunks(queryVector, parsedTopK, documentId || null);

    // Send retrieved sources first
    res.write(`data: ${JSON.stringify({ type: 'sources', sources: retrievedChunks })}\n\n`);

    // 3. Stream generated answer
    await streamRAGAnswer({
      query: query.trim(),
      retrievedChunks,
      conversationHistory: history,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
      },
      onDone: (result) => {
        res.write(`data: ${JSON.stringify({ type: 'done', answer: result.answer, provider: result.provider })}\n\n`);
        res.end();
      },
      onError: (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      },
    });
  } catch (error) {
    console.error('[Query Stream Error]', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}
