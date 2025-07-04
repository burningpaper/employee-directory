// /Users/jarred/employee-directory/api/process-linkedin-pdf.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';

// Import the ES Module version of pdfjs-dist and its GlobalWorkerOptions
// This allows direct access to GlobalWorkerOptions without needing the full pdfjsLib object.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.disableWorker = true;


// Ensure your VITE_OPENAI_KEY is set as an environment variable in Vercel
const OPENAI_API_KEY = process.env.VITE_OPENAI_KEY;

// Airtable Configuration - ensure these are set in Vercel environment variables
const AIRTABLE_BASE_ID = process.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_PAT = process.env.VITE_AIRTABLE_PAT; // Personal Access Token for Airtable
const WORK_EXPERIENCE_TABLE_NAME = 'Work Experience'; // Adjust if your table name is different

let openai; // Declare openai client variable

if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set. OpenAI client will not be initialized.");
} else {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

if (!AIRTABLE_BASE_ID || !AIRTABLE_PAT) {
    console.error("FATAL ERROR: AIRTABLE_BASE_ID or AIRTABLE_PAT environment variables are not set. Cannot save to Airtable.");
    // Consider how to handle this: throw an error, or let it proceed and fail at saveExperienceToAirtable
}

async function extractExperienceTextFromPdfBuffer(pdfBuffer) {
    try {
        // Convert Buffer to Uint8Array for pdf.js
        const uint8Array = new Uint8Array(pdfBuffer);
        const loadingTask = getDocument({ // Use getDocument directly
            data: uint8Array // isWorkerDisabled is not needed when GlobalWorkerOptions.workerSrc is null
        });
        const pdfDocument = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            // textContent.items is an array of text items.
            // Concatenate them, adding a space for separation.
            // Handle potential diacritics or special characters by joining item.str
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }

        console.log("Full text extracted by pdfjs-dist (first 2000 chars):\n", fullText.substring(0, 2000)); // Log full text
        console.log(`Extracted ${fullText.length} characters from PDF using pdfjs-dist.`);

        // Reverting to the working solution: Send the entire extracted text to OpenAI.
        // Rely on OpenAI's intelligence and the prompt's instructions to filter and prioritize.
        // The "Prioritize the most recent roles" instruction in the prompt is key here.
        const textToSendToOpenAI = fullText.trim();
        console.log("Full text sent to OpenAI (length: " + textToSendToOpenAI.length + ", first 1000 chars):\n", textToSendToOpenAI.substring(0, 1000));
        return textToSendToOpenAI;
    } catch (error) {
        console.error("Error parsing PDF content with pdfjs-dist:", error.message, error.stack);
        throw new Error(`Failed to parse PDF content. Original error: ${error.name} - ${error.message}`);
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
                        "You are a helpful assistant that extracts structured work history data from LinkedIn Experience sections. " +
                        "Only return valid JSON. No markdown. No explanation. The JSON should be an object with a single key 'job_experiences', " +
                        "which is an array of job objects." // Ensure no trailing invisible characters here
                    ),
                },
                {
                    "role": "user",
                    "content": "Extract and return a JSON array of job experiences from this Experience section.\\n\\n" + // Using escaped newlines
                               "For each role, include:\\n- Company\\n- Role Held at the Company\\n- Start Date (month and year if available, e.g., \"Jan 2020\")\\n- End Date (month and year if available, or \"Present\", e.g., \"Dec 2022\" or \"Present\")\\n- Years Worked There (e.g., \"2 yrs 3 mos\" or \"Less than a year\")\\n- Brief Description (max 70 words, summarize key responsibilities and achievements)\\n\\n" +
                               "List each distinct role **separately**, even if from the same company (e.g., promotion from 'Software Engineer' to 'Senior Software Engineer' at the same company should be two entries).\\n\\n" +
                               "Ignore irrelevant content. Return only a JSON object with a single key \"job_experiences\".\\n\\n" +
                               "Prioritize the most recent roles. Here is the text:\n\n" + // Added prioritization hint
                               `${experienceText}`
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

async function saveExperienceToAirtable(employeeRecordId, jobExperiences) {
    if (!AIRTABLE_BASE_ID || !AIRTABLE_PAT) {
        console.warn("Airtable credentials not configured. Skipping save to Airtable.");
        return { success: false, message: "Airtable credentials not configured on server." };
    }
    if (!employeeRecordId) {
        console.warn("Employee Record ID not provided. Skipping save to Airtable.");
        return { success: false, message: "Employee Record ID not provided." };
    }

    try {
        const recordsToCreate = jobExperiences.map(job => ({
            fields: {
                'Company': job.Company,
                'Role': job['Role Held at the Company'], // Assuming 'Role' is the field name in Airtable
                'Start Date': job['Start Date'],     // Airtable can often parse common date strings
                // Airtable cannot parse "Present" as a date. Send null for ongoing roles.
                'End Date': job['End Date'] === 'Present' ? null : job['End Date'],
                'Description': job['Brief Description'],
                'Employee Code': [employeeRecordId] // Link to the employee record in Airtable.
                // 'Years Worked There': job['Years Worked There'], // Optional: if you have a field for this
            }
        }));

        if (recordsToCreate.length === 0) {
            return { success: true, message: "No job experiences to save." };
        }

        const airtableApiUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(WORK_EXPERIENCE_TABLE_NAME)}`;
        const CHUNK_SIZE = 10; // Airtable API limit
        let allResponses = [];
        let allSuccess = true;

        for (let i = 0; i < recordsToCreate.length; i += CHUNK_SIZE) {
            const chunk = recordsToCreate.slice(i, i + CHUNK_SIZE);
            console.log(`Sending chunk of ${chunk.length} records to Airtable...`);

            const response = await fetch(airtableApiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_PAT}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ records: chunk })
            });

            const responseData = await response.json();
            allResponses.push({ status: response.status, data: responseData });

            if (!response.ok) {
                console.error(`Airtable API error on chunk starting at index ${i}:`, response.status, responseData);
                allSuccess = false;
                break; // Stop on the first error
            }
        }

        if (allSuccess) {
            return { success: true, message: `Successfully created ${recordsToCreate.length} records in Airtable.`, data: allResponses };
        } else {
            const firstError = allResponses.find(r => r.status >= 400);
            return { success: false, message: "An error occurred while saving records to Airtable.", ...firstError };
        }
    } catch (error) {
        console.error("Unexpected error in saveExperienceToAirtable:", error);
        return { success: false, message: "An unexpected error occurred during the Airtable save process.", details: error.message };
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

    // Check if critical clients/configs were initialized
    if (!openai || !AIRTABLE_BASE_ID || !AIRTABLE_PAT) {
        return res.status(500).json({ error: "Server configuration error", details: "OpenAI API key not configured or client not initialized." });
    }

    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form data:', err);
            return res.status(500).json({ error: 'Failed to parse form data', details: err.message });
        }

        const pdfFile = files.linkedinPdf?.[0];
        const employeeRecordId = fields.employeeRecordId?.[0]; // Retrieve employeeRecordId

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

            let airtableSaveResult = { success: false, message: "Save to Airtable not attempted." };
            if (experienceJson && experienceJson.job_experiences && experienceJson.job_experiences.length > 0) {
                if (!employeeRecordId) {
                    console.warn("employeeRecordId not received from frontend. Cannot link experience to employee.");
                    airtableSaveResult = { success: false, message: "Employee ID not provided for Airtable linking."};
                } else {
                    airtableSaveResult = await saveExperienceToAirtable(employeeRecordId, experienceJson.job_experiences);
                    console.log("Airtable save result:", airtableSaveResult);
                }
            }

            res.status(200).json({ ...experienceJson, airtableSaveStatus: airtableSaveResult });

        } catch (error) {
            console.error('Error processing PDF for experience extraction:', error);
            res.status(500).json({ error: 'Failed to process PDF for experience extraction', details: error.message, airtableSaveStatus: { success: false, message: "Error occurred before Airtable save attempt."} });
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