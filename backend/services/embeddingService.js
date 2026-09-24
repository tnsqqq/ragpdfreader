import dotenv from 'dotenv';
import OpenAI from 'openai';
import crypto from 'crypto';

dotenv.config();

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '') {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Deterministic 1536-dimensional local vector generator for testing and offline environments.
 * Uses term-frequency hashing over words and character n-grams to produce normalized unit vectors.
 */
function generateLocalDeterministicEmbedding(text, dimensions = 1536) {
  const vector = new Array(dimensions).fill(0);
  if (!text || text.trim() === '') {
    return vector;
  }

  const cleanText = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = cleanText.split(/\s+/).filter((t) => t.length > 0);

  // Bag of words & bigrams hashing
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const hash = crypto.createHash('sha256').update(word).digest();
    const index = hash.readUInt16BE(0) % dimensions;
    const sign = (hash.readUInt8(2) % 2 === 0) ? 1 : -1;
    vector[index] += sign * (1.0 + Math.log(1 + (word.length / 5)));

    // Bigram
    if (i < tokens.length - 1) {
      const bigram = `${word}_${tokens[i + 1]}`;
      const biHash = crypto.createHash('sha256').update(bigram).digest();
      const biIndex = biHash.readUInt16BE(0) % dimensions;
      const biSign = (biHash.readUInt8(2) % 2 === 0) ? 1 : -1;
      vector[biIndex] += biSign * 1.5;
    }
  }

  // L2 normalize vector
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  for (let i = 0; i < dimensions; i++) {
    vector[i] = vector[i] / norm;
  }

  return vector;
}

/**
 * Checks whether active OpenAI API key is configured.
 */
export function isOpenAIConfigured() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.trim().length > 0 && !key.includes('your_api_key'));
}

/**
 * Generates an embedding for a single text query.
 * @param {string} text
 * @returns {Promise<number[]>} 1536-dimensional vector
 */
export async function generateQueryEmbedding(text) {
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const client = getOpenAIClient();

  if (client && isOpenAIConfigured() && process.env.EMBEDDING_PROVIDER !== 'local_test') {
    try {
      const response = await client.embeddings.create({
        model,
        input: text.trim(),
      });
      return response.data[0].embedding;
    } catch (err) {
      console.warn(`[EmbeddingService] OpenAI embedding failed (${err.message}). Falling back to local test vector.`);
      return generateLocalDeterministicEmbedding(text);
    }
  }

  return generateLocalDeterministicEmbedding(text);
}

/**
 * Generates embeddings for an array of text chunks (with batching).
 * @param {string[]} texts
 * @returns {Promise<number[][]>} Array of 1536-dimensional vectors
 */
export async function generateBatchEmbeddings(texts) {
  if (!texts || texts.length === 0) return [];

  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const client = getOpenAIClient();

  if (client && isOpenAIConfigured() && process.env.EMBEDDING_PROVIDER !== 'local_test') {
    try {
      const BATCH_SIZE = 50;
      const allEmbeddings = [];

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const response = await client.embeddings.create({
          model,
          input: batch.map((t) => t.trim() || ' '),
        });
        for (const item of response.data) {
          allEmbeddings.push(item.embedding);
        }
      }

      return allEmbeddings;
    } catch (err) {
      console.warn(`[EmbeddingService] OpenAI batch embedding failed (${err.message}). Falling back to local test vectors.`);
      return texts.map((t) => generateLocalDeterministicEmbedding(t));
    }
  }

  return texts.map((t) => generateLocalDeterministicEmbedding(t));
}
