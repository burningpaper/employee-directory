// linkedin-extractor.js
// 1. Upload screenshot to OpenAI vision API
// 2. Prompt GPT-4o to extract structured JSON of work experience only

// Import the prompt text from the external file
import linkedinPrompt from './linkedin-prompt.txt?raw';

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
        // Setting temperature to 0 makes the output more deterministic and less creative.
        {
          role: "user",
          content: [
            {
              type: "text",
              text: linkedinPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0 // Set temperature to 0 for deterministic output
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

  if (typeof content === 'string') {
    try {
      let jsonStringToParse = content.trim();
      if (jsonStringToParse.startsWith("```json") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(7, jsonStringToParse.length - 3).trim();
      } else if (jsonStringToParse.startsWith("```") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(3, jsonStringToParse.length - 3).trim();
      }
      jsonStringToParse = jsonStringToParse.replace(/\\(?![nrtbf"'\\])/g, '\\\\');
      return JSON.parse(jsonStringToParse);
    } catch (e) {
      console.warn("Failed to parse GPT response content as JSON:", content, "Error:", e);
      return [];
    }
  }

  console.warn("No valid content found in GPT response:", data);
  return [];
}
