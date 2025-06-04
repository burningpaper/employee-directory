// linkedin-extractor.js
// 1. Upload screenshot to OpenAI vision API
// 2. Prompt GPT-4o to extract structured JSON of work experience only

// The original linkedinPrompt is not directly used in the new OCR-first flow for the GPT-4o call,
// as the prompt to GPT-4o will be dynamically generated based on OCR results.
// import linkedinPrompt from './linkedin-prompt.txt?raw';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;
const GOOGLE_VISION_API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_VISION_API_KEY;

// Placeholder for OCR service call and initial parsing of job entries
async function performOcrAndInitialParse(base64Image) {
  if (!GOOGLE_VISION_API_KEY) {
    console.error("Google Cloud Vision API Key is not configured (VITE_GOOGLE_CLOUD_VISION_API_KEY). OCR step will be skipped.");
    // Fallback to placeholder or throw error
    return [
      { "Company": "Placeholder (No API Key)", "role": "Placeholder Engineer", "start date": "Jan 2020", "end date": "Present", "rawOcrTextForBlock": "API Key Missing..." }
    ];
  }

  const visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;

  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image, // The base64 string of the image, without the data:image/png;base64, prefix
        },
        features: [
          {
            type: "TEXT_DETECTION", // Or DOCUMENT_TEXT_DETECTION for denser text
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(visionApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Google Cloud Vision API Error:", errorData);
      throw new Error(`Google Cloud Vision API request failed: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const detections = data.responses?.[0]?.textAnnotations;

    if (!detections || detections.length === 0) {
      console.log("Google Cloud Vision API: No text detected.");
      return [];
    }

    // The first detection (detections[0]) is usually the full text.
    // Subsequent detections are individual words/blocks with bounding boxes.
    console.log("Google Cloud Vision API - Full detected text:", detections[0].description);
    // console.log("Google Cloud Vision API - All detections:", detections);

    // ❗ CRITICAL: Implement parsing logic here!
    // This is where you'll need to analyze 'detections' (text blocks and their positions)
    // to identify and structure job entries (Company, role, start date, end date, rawOcrTextForBlock).
    // This is a complex step and highly dependent on the visual layout of LinkedIn profiles.
    console.warn("OCR STEP: Google Vision API call successful. Implement parsing logic for the detected text to extract structured job entries.");
    // For now, returning a placeholder based on the full text:
    return [
      { "Company": "Company (from OCR - NEEDS PARSING)", "role": "Role (from OCR - NEEDS PARSING)", "start date": "Date (NEEDS PARSING)", "end date": "Date (NEEDS PARSING)", "rawOcrTextForBlock": detections[0].description }
    ];

  } catch (error) {
    console.error("Error in performOcrAndInitialParse:", error);
    return []; // Return empty or handle error appropriately
  }
}

export async function extractWorkExperienceFromImage(base64Image) {
  const ocrExtractedJobs = await performOcrAndInitialParse(base64Image);

  if (!ocrExtractedJobs || ocrExtractedJobs.length === 0) {
    console.log("OCR step did not find any job entries or failed. Returning empty array.");
    return [];
  }

  // Dynamically construct the prompt for GPT-4o to find descriptions based on OCR data
  const gpt4oPromptForDescriptions = `
You are an AI assistant. You will be provided with an image of a LinkedIn profile and a list of job entries that were pre-extracted using an OCR process.
Each pre-extracted entry includes the Company, Role, Start Date, End Date, and potentially the raw OCR text for that job block.

Your specific task is to:
1. For each pre-extracted job entry provided below, meticulously locate the corresponding section in the IMAGE.
2. Extract ONLY the detailed job description text associated with that specific entry from the IMAGE. The description typically follows the company, role, and date information within the same visual block.
3. The company names, roles, and dates in your output MUST EXACTLY MATCH those provided in the pre-extracted entries. DO NOT substitute, normalize, or 'correct' company names, roles, or dates based on your general knowledge or visual interpretation if it differs from the provided OCR data. Your focus is solely on extracting the description text from the image for the given structured entries.
4. The output MUST be a JSON array. Each object in the array must correspond to one of the pre-extracted job entries and include all original fields (Company, role, "start date", "end date") plus the 'description' you extract from the image.
5. If no distinct description text is found for an entry in the image, the 'description' field for that entry should be an empty string ("").

Pre-extracted job entries (use these exact Company, role, start date, end date values in your output):
${JSON.stringify(ocrExtractedJobs.map(job => ({ Company: job.Company, role: job.role, "start date": job["start date"], "end date": job["end date"], rawOcrTextForBlock: job.rawOcrTextForBlock })), null, 2)}

Format your response as a single JSON array of objects. Each object must have these exact keys: "Company", "role", "start date", "end date", "description".
Example of one object in the output array:
{
  "Company": "Example Company Inc.",
  "role": "Example Role",
  "start date": "Month YYYY",
  "end date": "Month YYYY or 'Present'",
  "description": "The detailed description text extracted VERBATIM from the image for this specific job entry."
}

If multiple entries were provided in the 'Pre-extracted job entries' section, your response will be an array of such objects, maintaining the same order.
Do NOT wrap the final JSON array in markdown code blocks (e.g., \`\`\`json).
The API call is set to temperature 0 for deterministic output.
`;

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
              text: gpt4oPromptForDescriptions
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

  // The 'content' should now be a JSON string representing an array of job objects,
  // where each object includes Company, role, start date, end date (from OCR)
  // and description (from GPT-4o based on the image).

  if (typeof content === 'string') {
    try {
      let jsonStringToParse = content.trim();
      if (jsonStringToParse.startsWith("```json") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(7, jsonStringToParse.length - 3).trim();
      } else if (jsonStringToParse.startsWith("```") && jsonStringToParse.endsWith("```")) {
        jsonStringToParse = jsonStringToParse.substring(3, jsonStringToParse.length - 3).trim();
      }
      // It's generally safer to let the JSON parser handle escape sequences
      // unless specific problematic patterns are observed.
      // jsonStringToParse = jsonStringToParse.replace(/\\(?![nrtbf"'\\])/g, '\\\\');
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
