"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How do I keep my knees comfortable in a squat?",
  "What should I do if a rep hurts?",
  "How should I set up my camera?",
];
// The API accepts the last 10 turns; older ones stay on screen but are not sent.
const HISTORY_SENT = 10;

// General guidance chat backed by POST /ai/chat. Nothing about the user's plan,
// reps, or feedback is sent: only what they type in this conversation.
export function Assistant({
  token,
  demo,
}: {
  token: () => string;
  demo: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setError("");
    setDraft("");
    const history = turns.slice(-HISTORY_SENT);
    setTurns((t) => [...t, { role: "user", content: message }]);
    setSending(true);
    try {
      const data: { reply: string } = await apiFetch("/ai/chat", token(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: data.reply || "I could not come up with an answer. Please try rephrasing.",
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant could not answer.");
      // Let them retry the same question.
      setTurns((t) => t.slice(0, -1));
      setDraft(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">QUESTIONS, ANSWERED KINDLY</span>
          <h1>Ask PhysioTrace.</h1>
          <p>
            General help with technique, setup, and using the app. Your
            therapist knows your recovery best.
          </p>
        </div>
      </div>
      <div className="panel assistant-panel">
        <p className="assistant-notice" role="note">
          ⓘ General guidance, not medical advice. It does not see your plan or
          your camera. Stop if you feel pain and ask your therapist.
        </p>
        {demo ? (
          <div className="empty-state">
            <h3>The assistant needs an account.</h3>
            <p>
              Sign in from your dashboard to ask questions. Answers come from
              the AI provider set up on the PhysioTrace server.
            </p>
          </div>
        ) : (
          <>
            <div className="assistant-log" aria-live="polite">
              {turns.length === 0 && (
                <div className="assistant-suggestions">
                  <span className="muted">Try asking:</span>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="secondary"
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {turns.map((turn, i) => (
                <div key={i} className={"bubble bubble-" + turn.role}>
                  <span className="sr-only">
                    {turn.role === "user" ? "You said" : "PhysioTrace said"}
                  </span>
                  {turn.content}
                </div>
              ))}
              {sending && (
                <div className="bubble bubble-assistant bubble-thinking">
                  Thinking…
                </div>
              )}
              <div ref={end} />
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <form
              className="assistant-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <label className="sr-only" htmlFor="assistant-input">
                Your question
              </label>
              <textarea
                id="assistant-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder="Ask about technique, setup, or the app…"
              />
              <button className="primary" disabled={sending || !draft.trim()}>
                {sending ? "Sending…" : "Send →"}
              </button>
            </form>
            <p className="muted assistant-limit">
              Up to 20 questions a day. Conversations are not saved.
            </p>
          </>
        )}
      </div>
    </>
  );
}
