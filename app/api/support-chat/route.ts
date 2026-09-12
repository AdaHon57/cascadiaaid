import { createSupportChatHandler } from "@/lib/support-chat";

const handle = createSupportChatHandler(() => ({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_SUPPORT_MODEL,
}));

export const POST = handle;
