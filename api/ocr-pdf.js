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

    // Ensure credentials are set up.
    // If GOOGLE_APPLICATION_CREDENTIALS_JSON is set in Vercel env vars with the JSON content,
    // the Vision client library should pick it up.
    // For local dev, ensure ADC is configured (e.g., `gcloud auth application-default login`)
    // or GOOGLE_APPLICATION_CREDENTIALS points to your key file.
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error("Google Cloud credentials environment variables are NOT set.");
        return res.status(500).json({ error: 'Server configuration error: Google Cloud credentials not set.' });
    } else {
        // Log which variable is found (don't log the content!)
        console.log(`Google Cloud credentials environment variable found: ${process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ? 'GOOGLE_APPLICATION_CREDENTIALS_JSON' : 'GOOGLE_APPLICATION_CREDENTIALS'}`);
        console.error("Google Cloud credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS_JSON (with JSON content) or GOOGLE_APPLICATION_CREDENTIALS (path to file) environment variable.");
        return res.status(500).json({ error: 'Server configuration error: Google Cloud credentials not set.' });
    }

    const client = new ImageAnnotatorClient();

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
    const fullTextAnnotation = result.responses[0]?.fullTextAnnotation;

    res.status(200).json({ extractedText: fullTextAnnotation?.text || '' });

  } catch (error) {
    console.error('Error calling Google Cloud Vision API:', error);
    res.status(500).json({ error: 'Failed to process PDF with Google Cloud Vision API', details: error.message, stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined });
  }
}