// linkedin-extractor.js
// 1. Receive base64 encoded PDF data.
// 2. Prompt GPT-4o to extract structured JSON of work experience from the PDF.

// Import the prompt text from the external file
import linkedinPrompt from './linkedin-prompt.txt?raw';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;
// const GOOGLE_VISION_API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_VISION_API_KEY; // Removed

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
          content: [
            {
              type: "text",
              text: linkedinPrompt // Using the updated prompt from linkedin-prompt.txt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64PdfData}` // Sending PDF data
              }
              // Note: Using image_url for PDFs is experimental with GPT-4o.
              // If this doesn't work well, client-side PDF text extraction before sending to OpenAI would be more robust.
            }
          ]
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
