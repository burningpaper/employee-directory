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
  const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    let pageText = '';

    if (textContent && textContent.items) {
      // Sort items by their y then x coordinates to approximate reading order
      const Y_THRESHOLD = 1.5; // Adjust as needed: multiplier for item height to detect new line
      const X_THRESHOLD_SPACE = 0.2; // Adjust as needed: multiplier for item height to detect space

      const sortedItems = textContent.items.slice().sort((a, b) => {
        const yDiff = a.transform[5] - b.transform[5]; // transform[5] is y
        // A common height, e.g., height of 'M', could be used for threshold,
        // but using a fraction of item height is simpler here.
        // For now, using a small fixed threshold or comparing directly.
        if (Math.abs(yDiff) > (a.height * Y_THRESHOLD * 0.5 || 1) ) { // Heuristic for new line
            return yDiff;
        }
        return a.transform[4] - b.transform[4]; // transform[4] is x
      });

      let lastY = null;
      for (const item of sortedItems) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > (item.height * Y_THRESHOLD * 0.5 || 1)) {
          pageText += '\n'; // New line
        } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
          pageText += ' '; // Add a space if not starting a new line and no space exists
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
    }
    fullText += pageText.trim() + '\n\n'; // Add double newlines between pages
  }
  console.log("Extracted PDF Text for AI (length " + fullText.length + "):", fullText.substring(0, 1000) + (fullText.length > 1000 ? "..." : "")); // Log a snippet
  return fullText.trim();
}

export async function extractWorkExperienceFromPdfData(base64PdfData) {
  if (!OPENAI_API_KEY) {
    console.error("OpenAI API Key is not configured (VITE_OPENAI_KEY). Extraction step will be skipped.");
    throw new Error("OpenAI API Key is not configured.");
  }

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
          content: `${linkedinPrompt}\n\n--- PDF DOCUMENT CONTENT START ---\n${await extractTextFromBase64Pdf(base64PdfData)}\n--- PDF DOCUMENT CONTENT END ---`
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
        return parsedResult;
      } else {
        console.warn("GPT response was valid JSON but not an array:", parsedResult);
        return []; // Expecting an array
      }
    } catch (e) {
      console.error("Failed to parse GPT-4o response content as JSON:", content, "Error:", e);
      return [];
    }
  }

  console.warn("No valid string content found in GPT-4o response:", data);
  return [];
}
