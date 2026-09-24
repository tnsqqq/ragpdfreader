import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

/**
 * Extracts text from a PDF file preserving individual page numbers.
 * @param {string} filePath Absolute path to the PDF file
 * @returns {Promise<{ numPages: number, pages: Array<{ pageNumber: number, text: string }>, fullText: string }>}
 */
export async function extractTextFromPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pages = [];

  const options = {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });

      let lastY;
      let text = '';
      for (const item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += '\n' + item.str;
        }
        lastY = item.transform[5];
      }

      // pageIndex is 0-indexed in pdfjs
      const pageNumber = (typeof pageData.pageIndex === 'number' ? pageData.pageIndex : pages.length) + 1;
      const cleanText = text.trim();

      pages.push({
        pageNumber,
        text: cleanText,
      });

      return text;
    },
  };

  try {
    const data = await pdfParse(dataBuffer, options);
    // Sort pages by page number ascending
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      numPages: data.numpages || pages.length,
      pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: (data.text || '').trim() }],
      fullText: data.text || '',
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF document: ${error.message}`);
  }
}

/**
 * Extracts text from a TXT file.
 * @param {string} filePath Absolute path to the TXT file
 * @returns {Promise<{ numPages: number, pages: Array<{ pageNumber: number, text: string }>, fullText: string }>}
 */
export async function extractTextFromTxt(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const cleanText = content.trim();

    return {
      numPages: 1,
      pages: [{ pageNumber: 1, text: cleanText }],
      fullText: cleanText,
    };
  } catch (error) {
    throw new Error(`Failed to read TXT document: ${error.message}`);
  }
}

/**
 * Route-agnostic extractor based on file extension
 */
export async function extractDocumentText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return extractTextFromPdf(filePath);
  } else if (ext === '.txt') {
    return extractTextFromTxt(filePath);
  } else {
    throw new Error(`Unsupported document extension: ${ext}`);
  }
}
