// linkedin-extractor.js
// 1. Receive base64 encoded PDF data.
// 2. Prompt GPT-4o to extract structured JSON of work experience from the PDF.

// Import the prompt text from the external file
import linkedinPrompt from './linkedin-prompt.txt?raw';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;

// Helper function to get OCR'd text from a base64 encoded PDF via our backend API
async function extractTextFromBase64Pdf(base64PdfData) {
  console.log("Sending PDF data to backend for OCR...");
  const response = await fetch('/api/ocr-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64PdfData }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response from OCR API' }));
    console.error('Error from OCR API:', response.status, errorData);
    throw new Error(`OCR API request failed: ${errorData.error || response.statusText}`);
  }

  const data = await response.json();
  console.log("Text extracted via Google Cloud Vision API (length " + (data.extractedText?.length || 0) + "):", (data.extractedText || '').substring(0, 1500) + ((data.extractedText?.length || 0) > 1500 ? "..." : ""));
  return data.extractedText || '';
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
