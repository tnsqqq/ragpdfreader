import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractDocumentText } from './services/pdfService.js';
import { chunkDocument } from './services/chunkingService.js';
import { generateBatchEmbeddings, generateQueryEmbedding } from './services/embeddingService.js';
import {
  initVectorStore,
  addDocumentChunks,
  querySimilarChunks,
  getAllDocuments,
  deleteDocument,
} from './services/chromaService.js';
import { generateRAGAnswer } from './services/ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('====================================================');
  console.log('          DOCUMENT RAG PIPELINE TEST SUITE          ');
  console.log('====================================================\n');

  // Step 1: Create a test document
  const testDocPath = path.join(__dirname, 'test_sample_doc.txt');
  const sampleContent = `
Document Title: NovaCore Autonomous AI Platform Specification
Release Date: Q3 2026
Version: 4.2 Enterprise Edition

Section 1: Architecture Overview
The NovaCore AI platform integrates an agentic reasoning engine with an ultra-low latency vector retrieval pipeline. 
NovaCore supports hybrid indexing across dense semantic embeddings and sparse BM25 lexical tokens. 
The distributed cluster scales horizontally across Kubernetes nodes, supporting up to 100,000 queries per second with sub-15ms p99 latency.

Section 2: Security and Encryption
All document vectors and raw text segments are encrypted at rest using AES-256-GCM. 
In-transit network communication requires TLS 1.3 with mutual authentication (mTLS). 
Role-Based Access Control (RBAC) allows administrators to isolate document collections by organization, tenant, and project levels.

Section 3: Pricing and Resource Limits
The Enterprise Tier starts at $4,999 per month and includes up to 50 million monthly query tokens, 100 GB vector storage, and dedicated 24/7 technical support.
Overages are billed at $0.0001 per 1,000 retrieval tokens. Dedicated VPC peering and on-premise air-gapped deployments are available upon request.
`;

  fs.writeFileSync(testDocPath, sampleContent.trim(), 'utf-8');
  console.log(' [1/6] Created sample test document:', testDocPath);

  try {
    // Step 2: Extract text
    console.log(' [2/6] Extracting document text...');
    const extracted = await extractDocumentText(testDocPath);
    console.log(`       Extraction successful: ${extracted.numPages} page(s), ${extracted.fullText.length} characters.`);

    // Step 3: Chunk document
    console.log(' [3/6] Chunking document...');
    const testDocId = 'test-doc-' + Date.now();
    const chunks = chunkDocument(extracted, testDocId, 'NovaCore_Specification.txt', {
      maxTokens: 100,
      overlapTokens: 25,
    });
    console.log(`       Generated ${chunks.length} chunks.`);

    // Step 4: Generate Embeddings
    console.log(' [4/6] Generating embeddings...');
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateBatchEmbeddings(chunkTexts);
    console.log(`       Generated ${embeddings.length} vectors of dimension ${embeddings[0]?.length}.`);

    // Step 5: Index in Vector Store
    console.log(' [5/6] Initializing vector store & indexing chunks...');
    await initVectorStore();
    await addDocumentChunks(chunks, embeddings, {
      documentId: testDocId,
      filename: 'NovaCore_Specification.txt',
      originalName: 'NovaCore_Specification.txt',
      numPages: extracted.numPages,
      fileSize: fs.statSync(testDocPath).size,
      uploadedAt: new Date().toISOString(),
    });

    const docs = getAllDocuments();
    console.log(`       Indexed successfully. Total documents registered: ${docs.length}.`);

    // Step 6: Query Retrieval & Answer Generation
    console.log(' [6/6] Testing query retrieval & answer generation...');
    const testQuestions = [
      'What encryption standard is used for data at rest in NovaCore?',
      'How much does the Enterprise Tier cost per month?',
    ];

    for (const question of testQuestions) {
      console.log(`\n    Question: "${question}"`);
      const queryVec = await generateQueryEmbedding(question);
      const hits = await querySimilarChunks(queryVec, 3, testDocId);

      console.log(`    Retrieved ${hits.length} passages:`);
      hits.forEach((h, i) => {
        console.log(`      [Hit ${i + 1}] Similarity: ${(h.similarity * 100).toFixed(1)}% | Page ${h.page}: "${h.text.slice(0, 70)}..."`);
      });

      const ragResponse = await generateRAGAnswer({
        query: question,
        retrievedChunks: hits,
      });

      console.log(`    Answer Preview (${ragResponse.provider}):`);
      console.log(`    ${ragResponse.answer.split('\n')[0]}...`);
    }

    // Cleanup test file & document
    await deleteDocument(testDocId);
    if (fs.existsSync(testDocPath)) fs.unlinkSync(testDocPath);

    console.log('\n====================================================');
    console.log('           ALL RAG PIPELINE TESTS PASSED!          ');
    console.log('====================================================\n');
  } catch (err) {
    if (fs.existsSync(testDocPath)) fs.unlinkSync(testDocPath);
    console.error('\n Test execution failed:', err);
    process.exit(1);
  }
}

runTest();
