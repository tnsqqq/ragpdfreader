import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

let openaiClient = null;

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY || (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-') ? process.env.OPENAI_API_KEY : null);
  return key && key.trim().length > 0 ? key.trim() : null;
}

function getOpenAIApiKey() {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim().startsWith('sk-') ? key.trim() : null;
}

function getOpenAIClient() {
  const key = getOpenAIApiKey();
  if (!openaiClient && key) {
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

const SYSTEM_PROMPT = `You are a comprehensive Document QA assistant.
Answer the user's question thoroughly and accurately based on the provided document excerpts.
- Give a complete, detailed answer covering all relevant points mentioned in the document.
- Use clear bullet points or paragraphs where helpful.
- Do not include conversational filler like "Based on the text" or "I hope this helps". Provide the direct, full answer.`;

/**
 * Calls Google Gemini REST API (handles both API Key and Bearer token)
 */
async function callGemini(query, retrievedChunks, geminiKey) {
  const model = process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';
  const contextBlock = (retrievedChunks || [])
    .map((c, i) => `[Excerpt ${i + 1}, Page ${c.page || 1}]:\n${c.text}`)
    .join('\n\n');

  const promptText = `DOCUMENT CONTENT:\n${contextBlock}\n\nQUESTION: ${query}\n\nPlease provide a full and comprehensive answer based on the document content above.`;

  // Check if Bearer token (AQ. or ya29.) vs API Key (AIzaSy...)
  const isBearer = geminiKey.startsWith('AQ.') || geminiKey.startsWith('ya29.');
  const url = isBearer
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const headers = { 'Content-Type': 'application/json' };
  if (isBearer) {
    headers['Authorization'] = `Bearer ${geminiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${promptText}` }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Gemini status ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned empty response');
  }

  return {
    answer: text.trim(),
    provider: 'gemini',
    model,
  };
}

/**
 * Full, comprehensive extractive synthesizer.
 * Extracts all relevant paragraphs, sections, and bullet points so the answer is never cut off or limited to one line.
 */
function synthesizeExtractiveAnswer(query, retrievedChunks) {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      answer: `Not found in the uploaded document.`,
      sources: [],
      provider: 'local_extractive',
    };
  }

  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const queryTerms = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
  const isBroadQuery =
    queryTerms.length <= 2 ||
    /\b(all|summarize|summary|skills|experience|education|overview|tell me|explain|what are|details|about|project|work|background|full|list)\b/i.test(
      query
    );

  // Group chunks and extract meaningful paragraphs or logical blocks
  const sections = [];
  const seenTexts = new Set();

  for (const chunk of retrievedChunks) {
    const rawText = chunk.text || '';
    // Split into paragraphs or major sections
    const blocks = rawText.split(/(?:\r?\n){2,}/);

    for (const block of blocks) {
      const cleanBlock = block.trim();
      if (!cleanBlock || cleanBlock.length < 10) continue;

      // Score relevance
      const lowerBlock = cleanBlock.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (lowerBlock.includes(term)) matchCount++;
      }

      const key = cleanBlock.slice(0, 80);
      if (!seenTexts.has(key)) {
        seenTexts.add(key);
        sections.push({
          text: cleanBlock,
          score: matchCount,
          page: chunk.page || 1,
        });
      }
    }
  }

  // If specific query, prioritize sections that contain matching terms
  if (!isBroadQuery) {
    const scored = sections.filter((s) => s.score > 0);
    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      // Return the top matching comprehensive sections
      const answer = scored
        .slice(0, 5)
        .map((s) => s.text)
        .join('\n\n');
      return {
        answer,
        sources: retrievedChunks,
        provider: 'local_extractive',
      };
    }
  }

  // If broad query or general information request, present the complete content from the retrieved chunks
  const fullContent = sections
    .slice(0, 6)
    .map((s) => s.text)
    .join('\n\n');

  return {
    answer: fullContent || retrievedChunks[0]?.text || 'Not found in document.',
    sources: retrievedChunks,
    provider: 'local_extractive',
  };
}

/**
 * Generates direct, complete answer to query.
 */
export async function generateRAGAnswer({ query, retrievedChunks, conversationHistory = [] }) {
  const geminiKey = getGeminiApiKey();
  const openAIKey = getOpenAIApiKey();

  // 1. Try Gemini if configured
  if (geminiKey) {
    try {
      const result = await callGemini(query, retrievedChunks, geminiKey);
      return {
        answer: result.answer,
        sources: retrievedChunks,
        provider: 'gemini',
        model: result.model,
      };
    } catch (err) {
      console.warn(`[RAGService] Gemini note: ${err.message}. Using comprehensive document extraction.`);
    }
  }

  // 2. Try OpenAI if configured
  if (openAIKey) {
    const client = getOpenAIClient();
    const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
    try {
      const contextBlock = (retrievedChunks || []).map((c) => `[Page ${c.page}]: ${c.text}`).join('\n\n');
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `DOCUMENT EXCERPTS:\n${contextBlock}\n\nQUESTION: ${query}\n\nPlease give a thorough and complete answer.` },
        ],
        temperature: 0.1,
      });

      return {
        answer: response.choices[0]?.message?.content?.trim() || 'No answer found.',
        sources: retrievedChunks,
        provider: 'openai',
        model,
      };
    } catch (err) {
      console.warn(`[RAGService] OpenAI note: ${err.message}. Using comprehensive document extraction.`);
    }
  }

  // 3. Fallback to comprehensive document extraction
  return synthesizeExtractiveAnswer(query, retrievedChunks);
}

/**
 * Streaming answer support
 */
export async function streamRAGAnswer({ query, retrievedChunks, conversationHistory = [], onToken, onDone, onError }) {
  try {
    const result = await generateRAGAnswer({ query, retrievedChunks, conversationHistory });
    const words = result.answer.split(' ');
    let full = '';
    for (let i = 0; i < words.length; i++) {
      const piece = (i === 0 ? '' : ' ') + words[i];
      full += piece;
      onToken(piece);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    onDone({ answer: full, sources: retrievedChunks, provider: result.provider });
  } catch (err) {
    onError(err);
  }
}
