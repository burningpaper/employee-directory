// /Users/jarred/employee-directory/api/process-linkedin-pdf.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';

// Ensure your VITE_OPENAI_KEY is set as an environment variable in Vercel
const OPENAI_API_KEY = process.env.VITE_OPENAI_KEY;
let openai; // Declare openai client variable

if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set. OpenAI client will not be initialized.");
} else {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

async function extractExperienceTextFromPdfBuffer(pdfBuffer) {
    try {
        const data = await pdfParse(pdfBuffer);
        const fullText = data.text;

        const experienceStart = fullText.toLowerCase().indexOf("experience");
        if (experienceStart === -1) {
            console.warn("Could not find 'Experience' section heading in PDF text.");
            // Fallback: return all text, or a significant portion if too long
            return fullText.substring(0, 15000); // Limit to avoid overly large OpenAI prompts
        }

        let experienceText = fullText.substring(experienceStart);

        // Keywords to stop extraction (these often appear after the experience section)
        const stopKeywords = ["education", "licenses & certifications", "certifications", "volunteering", "skills", "projects", "courses", "honors & awards", "languages", "publications"];
        const lowerExperienceText = experienceText.toLowerCase();
        let earliestStopIndex = -1;

        for (const kw of stopKeywords) {
            // Search for the keyword *after* "experience" itself
            const idx = lowerExperienceText.indexOf(kw, "experience".length);
            if (idx > 0) {
                if (earliestStopIndex === -1 || idx < earliestStopIndex) {
                    earliestStopIndex = idx;
                }
            }
        }

        if (earliestStopIndex > 0) {
            experienceText = experienceText.substring(0, earliestStopIndex);
        }

        return experienceText.trim();
    } catch (error) {
        console.error("Error parsing PDF content:", error);
        throw new Error("Failed to parse PDF content.");
    }
}

async function callOpenAIForExperienceJson(experienceText) {
    if (!experienceText || experienceText.trim().length === 0) {
        throw new Error("No text provided to OpenAI for processing.");
    }
    console.log(`Sending ${experienceText.length} characters of experience text to OpenAI.`);

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Or your preferred model
            messages: [
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that extracts structured work history data from LinkedIn Experience sections. "
                        "Only return valid JSON. No markdown. No explanation. The JSON should be an object with a single key 'job_experiences', "
                        "which is an array of job objects."
                    ),
                },
                {
                    "role": "user",
                    "content": `Extract and return a JSON array of job experiences from this Experience section.\n\nFor each role, include:\n- Company\n- Role Held at the Company\n- Start Date (month and year if available, e.g., "Jan 2020")\n- End Date (month and year if available, or "Present", e.g., "Dec 2022" or "Present")\n- Years Worked There (e.g., "2 yrs 3 mos" or "Less than a year")\n- Brief Description (max 70 words, summarize key responsibilities and achievements)\n\nList each distinct role **separately**, even if from the same company (e.g., promotion from 'Software Engineer' to 'Senior Software Engineer' at the same company should be two entries).\n\nIgnore irrelevant content. Return only a JSON object with a single key "job_experiences".\n\nHere is the text:\n\n${experienceText}`
                }
            ],
            response_format: { type: "json_object" }, // For newer models that support JSON mode
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error("OpenAI returned an empty response content.");
        }
        // The model should return JSON directly when response_format is json_object
        return JSON.parse(content);

    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        let errorMessage = "Failed to process text with OpenAI.";
        if (error.response && error.response.data) {
            errorMessage += ` Details: ${JSON.stringify(error.response.data)}`;
        } else if (error.message) {
            errorMessage += ` Details: ${error.message}`;
        }
        throw new Error(errorMessage);
    }
}

export const config = {
    api: {
        bodyParser: false, // Required for formidable to parse multipart/form-data
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    // Check if the openai client was initialized (i.e., if API key was present)
    if (!openai) {
        return res.status(500).json({ error: "Server configuration error", details: "OpenAI API key not configured or client not initialized." });
    }

    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form data:', err);
            return res.status(500).json({ error: 'Failed to parse form data', details: err.message });
        }

        const pdfFile = files.linkedinPdf?.[0];

        if (!pdfFile) {
            return res.status(400).json({ error: 'No PDF file uploaded. Ensure the file input name is "linkedinPdf".' });
        }

        try {
            const pdfBuffer = fs.readFileSync(pdfFile.filepath);
            const experienceText = await extractExperienceTextFromPdfBuffer(pdfBuffer);

            if (!experienceText || experienceText.trim().length < 50) { // Arbitrary short length check
                 console.warn("Extracted experience text is very short or empty:", experienceText);
                 return res.status(400).json({ error: "Could not extract sufficient experience text from the PDF.", details: "The 'Experience' section might be missing, unclear, or too short." });
            }

            const experienceJson = await callOpenAIForExperienceJson(experienceText);
            res.status(200).json(experienceJson);

        } catch (error) {
            console.error('Error processing PDF for experience extraction:', error);
            res.status(500).json({ error: 'Failed to process PDF for experience extraction', details: error.message });
        } finally {
            // Clean up the temporary file uploaded by formidable
            if (pdfFile && pdfFile.filepath) {
                fs.unlink(pdfFile.filepath, unlinkErr => {
                    if (unlinkErr) console.error("Error deleting temp file:", unlinkErr);
                });
            }
        }
    });
}