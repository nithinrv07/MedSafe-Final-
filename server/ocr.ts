import { GoogleGenAI } from '@google/genai';

export interface OcrResult {
  title: string;
  category: string;
  doctorName: string;
  details: string;
  medicines: string;
}

/** Offline stand-in used when no Gemini key is configured. Picks a template from the file name. */
export function simulateOcr(fileName: string): OcrResult {
  const n = fileName.toLowerCase();
  if (n.includes('xray') || n.includes('x-ray'))
    return { title: 'Chest X-Ray scan', category: 'Diagnosis', doctorName: 'Self Uploaded', details: 'Sample text: mild bilateral pulmonary infiltration. No acute fractures. Heart size normal.', medicines: '' };
  if (n.includes('mri'))
    return { title: 'Brain MRI scan', category: 'Diagnosis', doctorName: 'Self Uploaded', details: 'Sample text: normal ventricles and sulci. No focal mass effect or acute ischaemia.', medicines: '' };
  if (n.includes('ecg') || n.includes('ekg'))
    return { title: 'ECG chart', category: 'Lab Report', doctorName: 'Self Uploaded', details: 'Sample text: normal sinus rhythm at 72 bpm. Normal axis, no ST-segment changes.', medicines: '' };
  if (n.includes('prescription') || n.includes('rx'))
    return { title: 'Prescription', category: 'Prescription', doctorName: 'Self Uploaded', details: 'Sample text: Lisinopril 20 mg once daily for hypertension.', medicines: 'Lisinopril' };
  return { title: 'Scanned document', category: 'Lab Report', doctorName: 'Self Uploaded', details: '', medicines: '' };
}

export function isGeminiConfigured(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k !== 'MY_GEMINI_API_KEY' && !k.includes('xxxx');
}

const CATEGORIES = ['Prescription', 'Lab Report', 'Diagnosis', 'Immunization'];

export async function analyzeWithGemini(image: string): Promise<OcrResult> {
  const m = image.match(/^data:([A-Za-z0-9.+\/-]+);base64,(.+)$/);
  const mimeType = m ? m[1] : 'image/png';
  const data = m ? m[2] : image;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType, data } },
      'Read this clinical scan, report, or prescription and extract its properties as a JSON object matching the schema. Do not invent values that are not in the document.',
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Short title of the record' },
          category: { type: 'STRING', enum: CATEGORIES },
          doctorName: { type: 'STRING', description: "Doctor's name, or 'Self Uploaded' if not found" },
          details: { type: 'STRING', description: 'Findings / report text' },
          medicines: { type: 'STRING', description: 'Comma-separated list of medicines' },
        },
        required: ['title', 'category', 'doctorName', 'details', 'medicines'],
      } as any,
    },
  });

  if (!response.text) throw new Error('Empty response from Gemini');
  const parsed = JSON.parse(response.text);
  return {
    title: String(parsed.title ?? '').slice(0, 200),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : 'Lab Report',
    doctorName: String(parsed.doctorName ?? 'Self Uploaded').slice(0, 120),
    details: String(parsed.details ?? '').slice(0, 20_000),
    medicines: String(parsed.medicines ?? '').slice(0, 2_000),
  };
}
