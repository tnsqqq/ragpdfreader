import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import multer from 'multer';

import { initVectorStore } from './services/chromaService.js';
import documentRoutes from './routes/documentRoutes.js';
import queryRoutes from './routes/queryRoutes.js';
import statusRoutes from './routes/statusRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 5000);

async function getAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startPort + 1));
        return;
      }

      reject(error);
    });

    server.listen(startPort, '0.0.0.0', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Enable CORS for frontend development
app.use(
  cors({
    origin: true, // Allow all origins for dev flexibility
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static file hosting for uploaded files preview
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Register API Routes
app.use('/api/documents', documentRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/status', statusRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Document RAG API Server',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      status: 'GET /api/status',
      uploadDocument: 'POST /api/documents/upload',
      listDocuments: 'GET /api/documents',
      getDocument: 'GET /api/documents/:id',
      deleteDocument: 'DELETE /api/documents/:id',
      query: 'POST /api/query',
      queryStream: 'POST /api/query/stream',
    },
  });
});

// Multer & General Error Handling Middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File is too large. Maximum allowed size is 10 MB.',
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  if (err) {
    console.error('[Unhandled Server Error]', err);
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal server error occurred.',
    });
  }

  next();
});

// Initialize vector store and start listening
async function startServer() {
  try {
    console.log('--- Initializing Document RAG Backend ---');
    await initVectorStore();

    const port = await getAvailablePort(DEFAULT_PORT);
    const resolvedPort = Number(port);

    app.listen(resolvedPort, () => {
      const chosenPort = resolvedPort;
      const portMessage = chosenPort === DEFAULT_PORT ? `http://localhost:${chosenPort}` : `http://localhost:${chosenPort} (fallback from port ${DEFAULT_PORT})`;
      console.log(`\n Document RAG Backend running at: ${portMessage}`);
      console.log(` Health check: http://localhost:${chosenPort}/health`);
      console.log(` System status: http://localhost:${chosenPort}/api/status`);
      console.log(` API endpoints ready for PDF & TXT indexing and queries\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
