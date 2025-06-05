// linkedin-extractor.js
// 1. Receive base64 encoded PDF data.
// 2. Prompt GPT-4o to extract structured JSON of work experience from the PDF.

// Import the prompt text from the external file
import linkedinPrompt from './linkedin-prompt.txt?raw';
// Import pdfjs-dist library
import * as pdfjsLib from 'pdfjs-dist';

// Import the URL of the worker script using Vite's ?url syntax
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined') { // Ensure this only runs in the browser
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;

// Helper function to extract text from a base64 encoded PDF
async function extractTextFromBase64Pdf(base64PdfData) {
  const pdfData = Uint8Array.from(atob(base64PdfData), c => c.charCodeAt(0));
  console.log("PDF.js: Decoded base64 data, length:", pdfData.length);
  const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
  console.log("PDF.js: Document loaded, number of pages:", pdfDocument.numPages);
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    console.log(`PDF.js: Processing page ${pageNum}`);
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    console.log(`PDF.js: Page ${pageNum} textContent items count:`, textContent?.items?.length);
    let pageText = '';

    if (textContent && textContent.items && textContent.items.length > 0) {
      // Normalize and sort items.
      const items = textContent.items.map(item => ({
        // Log first few raw items for inspection
        // if (pageNum === 1 && items.length < 5) { // Corrected placement of this log
        //   console.log("PDF.js: Raw item data (page 1, first 5):", item);
        // }
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      })).sort((a, b) => {
        // Sort primarily by Y coordinate, then by X if Y is similar
        // Log first few raw items for inspection - moved here for correct scope
        // This log is very verbose, enable only if needed for deep debugging specific items
        // if (pageNum === 1 && items.indexOf(a) < 2) console.log("PDF.js: Raw item data (page 1, first 2 for sorting):", a, b);
        if (Math.abs(a.y - b.y) > Math.min(a.height, b.height) * 0.5) { // Heuristic: if y-diff is more than half item height
          return a.y - b.y;
        }
        return a.x - b.x;
      });

      let currentLineBuffer = '';
      let lastItemProcessed = null;

      for (const item of items) {
        if (item.str.trim() === '') continue; // Skip items that are only whitespace

        if (lastItemProcessed) {
          const yDifference = Math.abs(item.y - lastItemProcessed.y);
          const xDifference = item.x - (lastItemProcessed.x + lastItemProcessed.width);

          // Condition for a new line: significant change in Y, or starting to the left of previous item on a close Y.
          if (yDifference > Math.min(item.height, lastItemProcessed.height) * 0.7 || (item.x < lastItemProcessed.x && yDifference > item.height * 0.15) ) {
            pageText += currentLineBuffer.trim() + '\n';
            currentLineBuffer = '';
          } else if (xDifference > item.height * 0.2) { // Condition for a space: horizontal gap is noticeable
            currentLineBuffer += ' ';
          }
        }
        currentLineBuffer += item.str;
        lastItemProcessed = item;
      }
      pageText += currentLineBuffer.trim(); // Add any remaining text in the buffer
      console.log(`PDF.js: Page ${pageNum} processed text (first 200 chars):`, pageText.substring(0,200));
    }
    fullText += pageText.trim() + '\n\n'; // Add double newlines between pages
  }
  console.log("PDF.js: Final Extracted PDF Text for AI (length " + fullText.length + "):", fullText.substring(0, 1500) + (fullText.length > 1500 ? "..." : "")); // Log a larger snippet
  return fullText.trim();
}

export async function extractWorkExperienceFromPdfData(base64PdfData) {
  if (!OPENAI_API_KEY) {
    console.error("OpenAI API Key is not configured (VITE_OPENAI_KEY). Extraction step will be skipped.");
    throw new Error("OpenAI API Key is not configured.");
  }

  const extractedText = await extractTextFromBase64Pdf(base64PdfData);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          // Combine the main prompt with the extracted PDF text
          content: `${linkedinPrompt}\n\n--- PDF DOCUMENT CONTENT START ---\n${extractedText}\n--- PDF DOCUMENT CONTENT END ---`
        }
      ],
      temperature: 0 // Temperature is 0 for deterministic output
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI API Error:", {
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
    });
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error && errorJson.error.message) {
        throw new Error(`OpenAI API Error: ${errorJson.error.message}`);
      }
    } catch (e) { /* Ignore if errorBody is not JSON */ }
    throw new Error(`OpenAI API request failed with status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  console.log("Raw content from OpenAI API:", content); // Log the raw content

  // The 'content' should be a JSON string representing an array of job objects.

  if (typeof content === 'string') {
    try {
      let jsonStringToParse = content.trim();
      if (jsonStringToParse.startsWith("```json") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(7, jsonStringToParse.length - 3).trim();
      } else if (jsonStringToParse.startsWith("```") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(3, jsonStringToParse.length - 3).trim();
      }
      const parsedResult = JSON.parse(jsonStringToParse);
      if (Array.isArray(parsedResult)) {
        return { extractedText, workExperience: parsedResult };
      } else {
        console.warn("GPT response was valid JSON but not an array:", parsedResult);
        return { extractedText, workExperience: [] }; // Expecting an array
      }
    } catch (e) {
      console.error("Failed to parse GPT-4o response content as JSON:", content, "Error:", e);
      return { extractedText, workExperience: [] };
    }
  }

  console.warn("No valid string content found in GPT-4o response:", data);
  return { extractedText, workExperience: [] };
}
