// linkedin-extractor.js
// 1. Upload screenshot to OpenAI vision API
// 2. Prompt GPT-4o to extract structured JSON of work experience only

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;

export async function extractWorkExperienceFromImage(base64Image) {
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
              content: `You are an AI assistant tasked with extracting structured work experience data from a screenshot of a LinkedIn profile. The screenshot has already been OCR-scanned into plain text. Use only the information that can be visually confirmed in the text. Do not guess or infer missing data. Return results in structured JSON format.

Instructions:
- Parse the text carefully and extract only confirmed work experience entries.
- Each job should include:
  - Company name (as it appears)
  - Job title
  - Start and end dates (if visible)
  - Description (if available)
- Do not include any companies or roles that are not explicitly listed.
- Do not fabricate job entries based on assumptions.
- If a piece of data is not clearly visible, omit it instead of guessing.

Format your response as:
[
  {
    "company": "Company Name",
    "title": "Job Title",
    "start": "Start Date",
    "end": "End Date",
    "description": "Description"
  },
  ...
]`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI API Error:", {
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
    });
    // Try to parse the error body as JSON for a more specific message
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

  if (typeof content === 'string') {
    try {
      // Attempt to clean markdown fences before parsing
      let jsonStringToParse = content.trim();
      if (jsonStringToParse.startsWith("```json") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(7, jsonStringToParse.length - 3).trim();
      } else if (jsonStringToParse.startsWith("```") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(3, jsonStringToParse.length - 3).trim();
      }
      // Attempt to fix bad Unicode escapes
      jsonStringToParse = jsonStringToParse.replace(/\\(?![nrtbf"'\\])/g, '\\\\');
      return JSON.parse(jsonStringToParse);
    } catch (e) {
      console.warn("Failed to parse GPT response content as JSON:", content, "Error:", e);
      // Optionally, you could throw an error here to be caught by profile.ts
      // throw new Error("Failed to parse GPT response content as JSON.");
      return []; // Return empty array if parsing fails
    }
  }

  console.warn("No valid content found in GPT response:", data);
  return []; // Return empty array if no content string
}
