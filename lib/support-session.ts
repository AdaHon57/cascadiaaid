import { supportKnowledge } from "@/data/support-knowledge";
import { MAX_CHAT_INPUT } from "@/types/support-chat";
import type { SupportMessage, SupportReply } from "@/types/support-chat";

export function parseSupportReply(value: unknown): SupportReply {
  const data = value as Partial<SupportReply> | null;
  if (
    !data ||
    typeof data.answer !== "string" ||
    !data.answer.trim() ||
    data.answer.length > 6000 ||
    !["generated", "excerpts", "no-match"].includes(data.mode ?? "") ||
    !Array.isArray(data.sources)
  )
    throw new Error("Support returned an unreadable response. Please try again.");
  const sources = data.sources.map((source) => {
    const known = supportKnowledge.find((item) => item.id === source?.id);
    if (!known) throw new Error("Support returned an unknown source. Please try again.");
    return known;
  });
  return {
    answer: data.answer,
    mode: data.mode!,
    sources,
    notice: typeof data.notice === "string" ? data.notice.slice(0, 200) : undefined,
  };
}

export function restoreSupportSession(raw: string | null): SupportMessage[] {
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(data) || data.length > 24) return [];
    return data.map((item): SupportMessage => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string" ||
        !item.content.trim() ||
        item.content.length > (item.role === "user" ? MAX_CHAT_INPUT : 6000)
      )
        throw new Error("Invalid saved chat");
      return {
        id: item.id,
        role: item.role,
        content: item.content,
        reply: item.role === "assistant" ? parseSupportReply(item.reply) : undefined,
      };
    });
  } catch {
    return [];
  }
}
