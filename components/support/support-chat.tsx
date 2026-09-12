"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseSupportReply, restoreSupportSession } from "@/lib/support-session";
import { MAX_CHAT_HISTORY, MAX_CHAT_INPUT, SUPPORT_SESSION_KEY } from "@/types/support-chat";
import type { SupportMessage } from "@/types/support-chat";

const suggestions = ["How do I get started?", "I lost my ID", "How do I upload documents?"];

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<SupportMessage | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      // Browser-only session restoration intentionally happens after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(restoreSupportSession(sessionStorage.getItem(SUPPORT_SESSION_KEY)));
    } catch {
      setStorageWarning(true);
    }
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy, open]);

  function save(next: SupportMessage[]) {
    const bounded = next.slice(-24);
    setMessages(bounded);
    try {
      sessionStorage.setItem(SUPPORT_SESSION_KEY, JSON.stringify(bounded));
    } catch {
      setStorageWarning(true);
    }
  }
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  function clear() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError("");
    setFailed(null);
    setDraft("");
    save([]);
    input.current?.focus();
  }

  async function send(text: string, retry?: SupportMessage) {
    if (!text.trim() || controller.current) return;
    const user: SupportMessage = retry ?? {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    const history = retry
      ? messages.slice(
          0,
          messages.findIndex((item) => item.id === retry.id),
        )
      : messages;
    const next = [...history, user];
    save(next);
    setDraft("");
    setError("");
    setFailed(null);
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35_000)]),
        body: JSON.stringify({
          message: user.content,
          history: history.slice(-MAX_CHAT_HISTORY).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Support could not reply. Please try again.");
      const reply = parseSupportReply(data);
      if (abort.signal.aborted) return;
      save([...next, { id: crypto.randomUUID(), role: "assistant", content: reply.answer, reply }]);
    } catch (cause) {
      if (abort.signal.aborted) return;
      setFailed(user);
      setError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Support took too long to reply. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Could not reach support. Please try again.",
      );
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <aside
      aria-label="Cascadia Aid support"
      className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6"
    >
      {open && (
        <section
          id="support-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="support-chat-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
          className="mb-3 flex h-[min(620px,calc(100dvh-7rem))] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between gap-2 bg-teal-800 px-4 py-3 text-white">
            <div>
              <h2 id="support-chat-title" className="font-semibold">
                Cascadia support
              </h2>
              <p className="text-xs text-teal-100">Help with your recovery journey</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clear}
                className="min-h-11 rounded-lg px-2 text-xs font-medium hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-white"
              >
                New chat
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Minimize support chat"
                className="flex size-11 items-center justify-center rounded-lg text-2xl hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-white"
              >
                −
              </button>
            </div>
          </header>
          <div className="border-b bg-slate-50 px-4 py-2 text-xs leading-5 text-slate-600">
            Answers from the{" "}
            <Link href="/support" className="font-medium text-teal-800 underline">
              site guide
            </Link>
            . Recovery rules are illustrative, not eligibility decisions.
          </div>
          <div
            ref={transcript}
            role="log"
            aria-label="Support conversation"
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={0}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 focus-visible:outline-teal-700"
          >
            <div className="rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-900">What can I help you with?</p>
            </div>
            {!messages.length && (
              <div className="flex flex-col items-start gap-2">
                {suggestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void send(question)}
                    className="min-h-11 rounded-xl border border-teal-200 px-3 py-2 text-left text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-teal-700"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message) => (
              <article
                key={message.id}
                aria-label={message.role === "user" ? "You" : "Cascadia support"}
                className={
                  message.role === "user"
                    ? "ml-6 rounded-xl bg-teal-800 p-3 text-sm text-white"
                    : "mr-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-800"
                }
              >
                <p className="mb-1 text-xs font-semibold opacity-80">
                  {message.role === "user" ? "You" : "Cascadia support"}
                </p>
                <p className="whitespace-pre-wrap break-words leading-6">{message.content}</p>
                {message.reply?.notice && (
                  <p className="mt-3 text-xs leading-5 text-slate-500">{message.reply.notice}</p>
                )}
                {!!message.reply?.sources.length && (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
                    <p className="text-xs font-semibold text-slate-500">Sources</p>
                    {message.reply.sources.map((source) => (
                      <Link
                        key={source.id}
                        href={source.href}
                        className="block break-words text-xs font-medium leading-5 text-teal-800 underline underline-offset-2"
                      >
                        {source.title}
                        {source.kind === "illustrative" ? " (illustrative)" : ""}
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <p role="status" className="text-sm text-slate-500">
                Finding guidance for you…
              </p>
            )}
          </div>
          <div className="border-t p-3">
            {error && (
              <div role="alert" className="mb-2 text-xs text-red-700">
                <p>{error}</p>
                {failed && (
                  <button
                    type="button"
                    onClick={() => void send(failed.content, failed)}
                    className="min-h-11 font-semibold underline"
                  >
                    Retry message
                  </button>
                )}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="support-chat-input" className="sr-only">
                Your support question
              </label>
              <textarea
                ref={input}
                id="support-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                maxLength={MAX_CHAT_INPUT}
                placeholder="Ask a question…"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                className="max-h-28 min-h-12 min-w-0 flex-1 resize-y rounded-lg border border-slate-300 p-2 text-base leading-6 focus:outline-2 focus:outline-teal-700"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="min-h-12 rounded-lg bg-teal-800 px-3 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
              >
                Send
              </button>
            </form>
            {storageWarning && (
              <p role="status" className="mt-1 text-xs text-amber-800">
                Tab storage is unavailable; this chat may be lost on reload.
              </p>
            )}
          </div>
        </section>
      )}
      <div className="flex justify-end">
        <button
          ref={launcher}
          type="button"
          aria-expanded={open}
          aria-controls="support-chat-panel"
          onClick={() => (open ? close() : setOpen(true))}
          className="flex min-h-12 items-center gap-2 rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-teal-200" />
          {open ? "Minimize chat" : "Ask Cascadia"}
        </button>
      </div>
    </aside>
  );
}
