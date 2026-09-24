import express from 'express';
import { upload } from '../middleware/uploadMiddleware.js';
import {
  uploadDocument,
  listDocuments,
  getDocumentDetails,
  deleteDocument,
} from '../controllers/documentController.js';

const router = express.Router();

// Upload document (PDF or TXT)
router.post('/upload', upload.single('file'), uploadDocument);

// Get list of all uploaded documents
router.get('/', listDocuments);

// Get single document details with its chunks
router.get('/:id', getDocumentDetails);

// Delete document and its embeddings
router.delete('/:id', deleteDocument);

export default router;
