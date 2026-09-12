import { createImageAnalysisHandler } from "@/lib/image-analysis";

// Runtime server configuration only. Never use NEXT_PUBLIC_ for these values.
const handle = createImageAnalysisHandler(() => ({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_VISION_MODEL,
  accessCode: process.env.IMAGE_ANALYSIS_ACCESS_CODE,
}));

export const GET = handle;
export const POST = handle;
