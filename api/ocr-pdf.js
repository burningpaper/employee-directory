// api/ocr-pdf.js
import { ImageAnnotatorClient } from '@google-cloud/vision';

// This would typically be set as an environment variable in Vercel
// For local development, you might use a .env file and a library like dotenv,
// or set up Application Default Credentials (ADC).
// Vercel will automatically pick up GOOGLE_APPLICATION_CREDENTIALS_JSON
// if you set it as an environment variable containing the JSON key content.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { base64PdfData } = req.body;

    if (!base64PdfData) {
      return res.status(400).json({ error: 'Missing base64PdfData in request body' });
    }

    let parsedCredentials;

    // Attempt to load credentials from Base64 encoded JSON
    if (process.env.GOOGLE_CREDENTIALS_JSON_BASE64) {
        console.log(`Found GOOGLE_CREDENTIALS_JSON_BASE64 environment variable.`);
        try {
            const decodedJson = Buffer.from(process.env.GOOGLE_CREDENTIALS_JSON_BASE64, 'base64').toString('utf-8');
            parsedCredentials = JSON.parse(decodedJson);
            console.log("GOOGLE_CREDENTIALS_JSON_BASE64 was successfully decoded and parsed as JSON.");

            // Add a basic check for essential properties of a service account key
            if (!parsedCredentials || !parsedCredentials.project_id || !parsedCredentials.client_email || !parsedCredentials.private_key) {
                console.error("Decoded and parsed credentials JSON is missing essential service account key properties (project_id, client_email, private_key) or is not an object.");
                return res.status(500).json({ error: 'Server configuration error: Incomplete or invalid Google Cloud credentials JSON.' });
            }
        } catch (e) {
            console.error("Error decoding/parsing GOOGLE_CREDENTIALS_JSON_BASE64. This is likely the cause of 'Could not load default credentials'. Check the Base64 encoded JSON content in Vercel environment variables.", e.message);
            return res.status(500).json({ error: 'Server configuration error: Malformed or invalid Base64 encoded Google Cloud credentials JSON.', details: e.message, stack: process.env.NODE_ENV !== 'production' ? e.stack : undefined });
        }
    // Fallback for local development using a file path or if GOOGLE_APPLICATION_CREDENTIALS_JSON (raw JSON) is still preferred by some.
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // This case is for GOOGLE_APPLICATION_CREDENTIALS pointing to a file path.
        // The client will attempt to load this path if parsedCredentials is not set.
        console.log(`Found GOOGLE_APPLICATION_CREDENTIALS environment variable (points to a file path).`);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        // This is a fallback if you still have the raw JSON in an old variable.
        // It's better to use the Base64 method for serverless.
        console.warn("Found GOOGLE_APPLICATION_CREDENTIALS_JSON (raw JSON). Consider using GOOGLE_CREDENTIALS_JSON_BASE64 for better reliability in serverless environments.");
        parsedCredentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON); // Assuming it's valid if it exists
    } else {
        console.error("Google Cloud credentials environment variables are NOT set. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON (with JSON content) or GOOGLE_APPLICATION_CREDENTIALS (path to file) environment variable.");
        return res.status(500).json({ error: 'Server configuration error: Google Cloud credentials not set.' });
    }

    // Explicitly pass credentials if parsed from GOOGLE_APPLICATION_CREDENTIALS_JSON
    // Otherwise, let the client attempt its default credential discovery (e.g., from GOOGLE_APPLICATION_CREDENTIALS path)
    const clientOptions = parsedCredentials ? { credentials: parsedCredentials } : {};
    const client = new ImageAnnotatorClient(clientOptions);

    const request = {
      requests: [
        {
          inputConfig: {
            content: base64PdfData, // Pass the base64 string directly
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          // Optionally, add imageContext for language hints if needed
          // imageContext: {
          //   languageHints: ['en'],
          // },
        },
      ],
    };

    console.log('Sending request to Google Cloud Vision API...');
    const [result] = await client.batchAnnotateFiles(request);
    
    console.log('Raw Google Cloud Vision API result (first response):', JSON.stringify(result.responses[0], null, 2));
    
    const fullTextAnnotation = result.responses[0]?.fullTextAnnotation;
    console.log('Extracted fullTextAnnotation.text (length ' + (fullTextAnnotation?.text?.length || 0) + '):', (fullTextAnnotation?.text || '').substring(0, 500) + '...');
    res.status(200).json({ extractedText: fullTextAnnotation?.text || '' });

  } catch (error) {
    console.error('Error calling Google Cloud Vision API:', error);
    res.status(500).json({ error: 'Failed to process PDF with Google Cloud Vision API', details: error.message });
  }
}