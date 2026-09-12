export interface SupportSource {
  id: string;
  title: string;
  href: string;
  content: string;
  summary: string;
  kind: "site-guide" | "illustrative" | "official";
  reviewedAt?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SupportReply {
  answer: string;
  sources: SupportSource[];
  mode: "generated" | "excerpts" | "no-match";
  notice?: string;
}

export interface SupportMessage extends ChatTurn {
  id: string;
  reply?: SupportReply;
}

export const SUPPORT_SESSION_KEY = "cascadia-support-chat-v1";
export const MAX_CHAT_INPUT = 2000;
export const MAX_SUPPORT_ANSWER = 600;
export const MAX_CHAT_HISTORY = 12;
