import { getVectorStoreStats } from '../services/chromaService.js';
import { isOpenAIConfigured } from '../services/embeddingService.js';

export function getSystemStatus(req, res) {
  try {
    const vectorStats = getVectorStoreStats();
    const openAIConfigured = isOpenAIConfigured();

    return res.json({
      success: true,
      status: 'operational',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      vectorStore: vectorStats,
      ai: {
        isOpenAIConfigured: openAIConfigured,
        chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        embeddingProvider: openAIConfigured && process.env.EMBEDDING_PROVIDER !== 'local_test' ? 'openai' : 'local_deterministic',
      },
      server: {
        port: process.env.PORT || 5000,
        nodeVersion: process.version,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
