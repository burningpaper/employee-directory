// linkedin-extractor.js
// 1. Receive base64 encoded PDF data.
// 2. Prompt GPT-4o to extract structured JSON of work experience from the PDF.

// Import the prompt text from the external file
import linkedinPrompt from './linkedin-prompt.txt?raw';
// Import pdfjs-dist library
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Import the URL of the worker script using Vite's ?url syntax
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined') { // Ensure this only runs in the browser
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;

// Helper function to OCR text from a base64 encoded PDF (image-based)
async function extractTextFromBase64Pdf(base64PdfData) {
  const pdfData = Uint8Array.from(atob(base64PdfData), c => c.charCodeAt(0));
  console.log("PDF.js: Decoded base64 data, length:", pdfData.length);
  const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
  console.log("PDF.js: Document loaded, number of pages:", pdfDocument.numPages);
  let fullText = '';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    console.log(`PDF.js: Processing page ${pageNum}`);
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // Increase scale for better OCR
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    const imageDataUrl = canvas.toDataURL('image/png');
    console.log(`Tesseract.js: Starting OCR for page ${pageNum}`);

    try {
      const { data: { text } } = await Tesseract.recognize(
        imageDataUrl,
        'eng', // English language
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`Tesseract.js: OCR progress page ${pageNum}: ${Math.round(m.progress * 100)}%`);
            } else {
              console.log(`Tesseract.js: ${m.status} (page ${pageNum})`);
            }
          }
        }
      );
      console.log(`Tesseract.js: Page ${pageNum} OCR result (first 200 chars):`, text.substring(0, 200));
      fullText += text + '\n\n'; // Add newlines between pages
    } catch (ocrError) {
      console.error(`Tesseract.js: OCR failed for page ${pageNum}:`, ocrError);
      fullText += `[OCR Error on Page ${pageNum}]\n\n`;
    }
  }
  if (canvas.parentNode) { // Clean up canvas if it was appended to DOM (not in this snippet)
    canvas.parentNode.removeChild(canvas);
  } else { // Or just clear it if it was never appended
    canvas.width = 0;
    canvas.height = 0;
  }

  console.log("Tesseract.js: Final OCR'd Text for AI (length " + fullText.length + "):", fullText.substring(0, 1500) + (fullText.length > 1500 ? "..." : ""));
  return fullText.trim();
}

export async function extractWorkExperienceFromPdfData(base64PdfData) {
  if (!OPENAI_API_KEY) {
    console.error("OpenAI API Key is not configured (VITE_OPENAI_KEY). Extraction step will be skipped.");
    // Return an empty structure but include the (potentially empty) extractedText for display
    return { extractedText: await extractTextFromBase64Pdf(base64PdfData).catch(e => {
        console.error("Error during PDF text extraction for display:", e);
        return `Error during PDF text extraction: ${e.message}`;
    }), workExperience: [] };
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
