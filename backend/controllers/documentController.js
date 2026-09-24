import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { extractDocumentText } from '../services/pdfService.js';
import { chunkDocument } from '../services/chunkingService.js';
import { generateBatchEmbeddings } from '../services/embeddingService.js';
import {
  addDocumentChunks,
  getAllDocuments,
  getDocumentById,
  getDocumentChunks,
  deleteDocument as deleteFromVectorStore,
} from '../services/chromaService.js';

/**
 * Handles uploading and processing a PDF or TXT document.
 */
export async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please upload a PDF or TXT document.',
      });
    }

    const { originalname, path: filePath, size, mimetype, filename: storedFilename } = req.file;
    const documentId = uuidv4();

    console.log(`[Upload] Processing document: "${originalname}" (Size: ${(size / 1024).toFixed(1)} KB)`);

    // 1. Extract text from document
    const extracted = await extractDocumentText(filePath);

    if (!extracted.fullText || extracted.fullText.trim().length === 0) {
      // Remove empty uploaded file
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(422).json({
        success: false,
        error: 'The uploaded document contains no readable text or is an image-only scan.',
      });
    }

    // 2. Chunk document with semantic boundaries & overlap
    const chunks = chunkDocument(extracted, documentId, originalname, {
      maxTokens: 500,
      overlapTokens: 100,
    });

    console.log(`[Upload] Document generated ${chunks.length} chunks across ${extracted.numPages} page(s).`);

    // 3. Generate embeddings for all chunks
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateBatchEmbeddings(chunkTexts);

    // 4. Index in Vector Store
    const documentInfo = {
      documentId,
      filename: originalname,
      storedFilename,
      originalName: originalname,
      numPages: extracted.numPages,
      fileSize: size,
      mimeType: mimetype,
      uploadedAt: new Date().toISOString(),
    };

    await addDocumentChunks(chunks, embeddings, documentInfo);

    return res.status(201).json({
      success: true,
      message: `Document "${originalname}" successfully processed and indexed.`,
      document: {
        id: documentId,
        filename: originalname,
        numPages: extracted.numPages,
        totalChunks: chunks.length,
        totalTokens: chunks.reduce((acc, c) => acc + (c.tokenCount || 0), 0),
        uploadedAt: documentInfo.uploadedAt,
        fileSize: size,
      },
    });
  } catch (error) {
    console.error('[Upload Error]', error);
    // Cleanup file if an error occurred during processing
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // ignore
      }
    }
    return res.status(500).json({
      success: false,
      error: `Failed to process document: ${error.message}`,
    });
  }
}

/**
 * Returns list of all indexed documents.
 */
export async function listDocuments(req, res) {
  try {
    const docs = getAllDocuments();
    return res.json({
      success: true,
      count: docs.length,
      documents: docs,
    });
  } catch (error) {
    console.error('[List Documents Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve documents.',
    });
  }
}

/**
 * Retrieves single document details and chunk previews.
 */
export async function getDocumentDetails(req, res) {
  try {
    const { id } = req.params;
    const doc = getDocumentById(id);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found.',
      });
    }

    const chunks = getDocumentChunks(id);

    return res.json({
      success: true,
      document: doc,
      chunks,
    });
  } catch (error) {
    console.error('[Get Document Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get document details.',
    });
  }
}

/**
 * Deletes a document and its chunks.
 */
export async function deleteDocument(req, res) {
  try {
    const { id } = req.params;
    const doc = getDocumentById(id);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found.',
      });
    }

    // Delete from vector store
    await deleteFromVectorStore(id);

    // Remove stored physical file if found
    if (doc.storedFilename) {
      const filePath = path.join(path.dirname(doc.storedFilename), '..', 'uploads', doc.storedFilename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('[Delete] Could not remove file on disk:', e.message);
        }
      }
    }

    return res.json({
      success: true,
      message: `Document "${doc.filename}" was deleted successfully.`,
    });
  } catch (error) {
    console.error('[Delete Document Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete document.',
    });
  }
}
