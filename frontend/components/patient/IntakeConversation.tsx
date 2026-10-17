"use client";

<<<<<<< Updated upstream
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { recordPatientAnswer } from "@consultprep/ai/workflow";
import type { IntakeState as StructuredIntakeState } from "@consultprep/ai";
=======
import { useEffect, useState } from "react";
import { takeLandingDraft } from "../../lib/preview-draft";
>>>>>>> Stashed changes
import ConversationTurn from "./ConversationTurn";

type IntakeState = Record<string, unknown>;
type BriefFact = { text: string; sourceResponseIds: string[]; originalText: string[] };
type Brief = {
  status: "ai_generated_draft" | "patient_confirmed";
  reasonForConsultation: BriefFact[];
  currentSymptoms: BriefFact[];
  symptomTimeline: BriefFact[];
  relevantBackground: BriefFact[];
  importantUnansweredQuestions: Array<{ question: string; status: string }>;
  sourceTraceability: Array<{ responseId: string; originalText: string }>;
};
type Turn = { kind: "question" | "response"; text: string };
type ConversationSnapshot = {
  id: string;
  title: string;
  state: IntakeState | null;
  turns: Turn[];
  brief: Brief | null;
  safetyStopped: boolean;
  saved: boolean;
};

const BUSY_STATUSES = [
  "Reading your message",
  "Updating your notes",
  "Reviewing what you’ve shared",
  "Choosing a follow-up question",
  "Preparing a response",
];

function conversationTitle(turns: Turn[]) {
  const firstResponse = turns.find((turn) => turn.kind === "response")?.text;
  if (!firstResponse) return "New consultation";
  return firstResponse.length > 34 ? `${firstResponse.slice(0, 34).trimEnd()}…` : firstResponse;
}

async function requestIntake(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/demo/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = result.error as { message?: string } | undefined;
    throw new Error(error?.message ?? "The intake request could not be completed.");
  }
  return result;
}

function asBrief(value: unknown): Brief | null {
  if (!value || typeof value !== "object") return null;
  return value as Brief;
}

function displayAssistantMessage(value: unknown): string {
  if (typeof value !== "string") return "I’m sorry, I couldn’t prepare a reply. Please try again.";
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "assistantMessage" in parsed) {
      return displayAssistantMessage((parsed as { assistantMessage?: unknown }).assistantMessage);
    }
  } catch {
    // Regular assistant text does not need JSON decoding.
  }
  return text || "I’m sorry, I couldn’t prepare a reply. Please try again.";
}

export default function IntakeConversation() {
  const [state, setState] = useState<IntakeState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyStatusIndex, setBusyStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [safetyStopped, setSafetyStopped] = useState(false);
  const [conversationId, setConversationId] = useState("conversation-1");
  const [savedConversations, setSavedConversations] = useState<ConversationSnapshot[]>([]);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [isActiveSaved, setIsActiveSaved] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const nextConversationId = useRef(2);
  const answerFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const composerStartRectRef = useRef<DOMRect | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToLatestMessageRef = useRef(false);
  const activeRequestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
<<<<<<< Updated upstream
    if (!busy) return;
    const interval = window.setInterval(() => {
      setBusyStatusIndex((index) => (index + 1) % BUSY_STATUSES.length);
    }, 1_400);
    return () => window.clearInterval(interval);
  }, [busy]);

  const hasStartedConversation = Boolean(state);
  useLayoutEffect(() => {
    const startRect = composerStartRectRef.current;
    const composer = composerRef.current;
    composerStartRectRef.current = null;
    if (!startRect || !composer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const endRect = composer.getBoundingClientRect();
    const deltaX = startRect.left - endRect.left;
    const deltaY = startRect.top - endRect.top;
    const scaleX = startRect.width / endRect.width;
    const scaleY = startRect.height / endRect.height;
    composer.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left" },
        { transform: "translate(0, 0) scale(1, 1)", transformOrigin: "top left" },
      ],
      { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [hasStartedConversation]);

  useEffect(() => {
    if (!shouldScrollToLatestMessageRef.current) return;
    const chat = chatScrollRef.current;
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    shouldScrollToLatestMessageRef.current = false;
  }, [turns, brief]);

  useLayoutEffect(() => {
    const field = answerFieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 40), 160)}px`;
  }, [draft]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem("consultprep.saved-consultations") ?? "[]");
        if (Array.isArray(stored)) {
          const saved = stored.filter((item): item is ConversationSnapshot => (
            item && typeof item === "object" &&
            typeof item.id === "string" && typeof item.title === "string" &&
            Array.isArray(item.turns) && item.saved === true
          ));
          setSavedConversations(saved);
          for (const conversation of saved) {
            const match = /^conversation-(\d+)$/.exec(conversation.id);
            if (match) nextConversationId.current = Math.max(nextConversationId.current, Number(match[1]) + 1);
          }
        }
      } catch {
        // Ignore unavailable or malformed browser storage.
      }
      setStorageReady(true);
=======
    const timeout = window.setTimeout(() => {
      const handoff = takeLandingDraft();
      if (handoff !== null) setInitialDraft(handoff);
>>>>>>> Stashed changes
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

<<<<<<< Updated upstream
  useEffect(() => {
    if (!storageReady) return;
    const storedConversations = savedConversations.filter((conversation) => conversation.saved);
    if (isActiveSaved && (state || turns.length > 0)) {
      storedConversations.unshift({
        id: conversationId,
        title: activeTitle ?? conversationTitle(turns),
        state,
        turns,
        brief,
        safetyStopped,
        saved: true,
      });
    }
    let errorTimeout: number | undefined;
    try {
      localStorage.setItem("consultprep.saved-consultations", JSON.stringify(storedConversations));
    } catch {
      errorTimeout = window.setTimeout(() => {
        setError("This browser could not save the consultation. Check its storage settings and try again.");
      }, 0);
    }
    return () => window.clearTimeout(errorTimeout);
  }, [storageReady, savedConversations, conversationId, activeTitle, isActiveSaved, state, turns, brief, safetyStopped]);

  function newConversation() {
    if (busy) return;
    if (state || turns.length > 0) {
      setSavedConversations((previous) => [
        { id: conversationId, title: activeTitle ?? conversationTitle(turns), state, turns, brief, safetyStopped, saved: isActiveSaved },
        ...previous.filter((conversation) => conversation.id !== conversationId),
      ]);
    }
    setConversationId(`conversation-${nextConversationId.current++}`);
    setActiveTitle(null);
    setIsActiveSaved(false);
    setState(null);
    setTurns([]);
    setBrief(null);
    setSafetyStopped(false);
    setError(null);
    setDraft("");
  }

  function openConversation(conversation: ConversationSnapshot) {
    if (busy || conversation.id === conversationId) return;
    const current = state || turns.length > 0
      ? { id: conversationId, title: activeTitle ?? conversationTitle(turns), state, turns, brief, safetyStopped, saved: isActiveSaved }
      : null;
    setSavedConversations((previous) => [
      ...(current ? [current] : []),
      ...previous.filter((item) => item.id !== conversationId && item.id !== conversation.id),
    ]);
    setConversationId(conversation.id);
    setActiveTitle(conversation.title);
    setIsActiveSaved(conversation.saved);
    setState(conversation.state);
    shouldScrollToLatestMessageRef.current = true;
    setTurns(conversation.turns);
    setBrief(conversation.brief);
    setSafetyStopped(conversation.safetyStopped);
    setDraft("");
    setError(null);
  }

  function conversationById(id: string): ConversationSnapshot | null {
    if (id === conversationId && (state || turns.length > 0)) {
      return { id, title: activeTitle ?? conversationTitle(turns), state, turns, brief, safetyStopped, saved: isActiveSaved };
    }
    return savedConversations.find((conversation) => conversation.id === id) ?? null;
  }

  function showConversationMenu(id: string, x: number, y: number) {
    setContextMenu({ id, x: Math.max(8, Math.min(x, window.innerWidth - 220)), y: Math.max(8, Math.min(y, window.innerHeight - 240)) });
  }

  function renameConversation(id: string) {
    const conversation = conversationById(id);
    setContextMenu(null);
    if (!conversation) return;
    const title = window.prompt("Rename consultation", conversation.title)?.trim();
    if (!title) return;
    if (id === conversationId) setActiveTitle(title);
    else setSavedConversations((previous) => previous.map((item) => item.id === id ? { ...item, title } : item));
  }

  function duplicateConversation(id: string) {
    const conversation = conversationById(id);
    setContextMenu(null);
    if (!conversation) return;
    const duplicate = {
      ...conversation,
      id: `conversation-${nextConversationId.current++}`,
      title: `${conversation.title} (copy)`,
      saved: false,
    };
    setSavedConversations((previous) => [duplicate, ...previous]);
  }

  function toggleSavedConversation(id: string) {
    const conversation = conversationById(id);
    setContextMenu(null);
    if (!conversation) return;
    const saved = !conversation.saved;
    if (id === conversationId) setIsActiveSaved(saved);
    else setSavedConversations((previous) => previous.map((item) => item.id === id ? { ...item, saved } : item));
  }

  function deleteConversation(id: string) {
    const conversation = conversationById(id);
    setContextMenu(null);
    if (!conversation || !window.confirm(`Delete “${conversation.title}”?`)) return;
    setSavedConversations((previous) => previous.filter((item) => item.id !== id));
    if (id === conversationId) {
      setConversationId(`conversation-${nextConversationId.current++}`);
      setActiveTitle(null);
      setIsActiveSaved(false);
      setState(null);
      setTurns([]);
      setBrief(null);
      setSafetyStopped(false);
      setDraft("");
    }
  }

  function stopGenerating() {
    const controller = activeRequestControllerRef.current;
    if (!controller) return;
    controller.abort();
    activeRequestControllerRef.current = null;
    setBusy(false);
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy || safetyStopped) return;
    const answer = draft.trim();
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    let activeState = state;
    setDraft("");
    setBusyStatusIndex(0);
    setBusy(true);
    setError(null);
    setBrief(null);
    try {
      if (!activeState) {
        composerStartRectRef.current = composerRef.current?.getBoundingClientRect() ?? null;
        const started = await requestIntake({ operation: "start" }, controller.signal);
        activeState = started.state as IntakeState;
        setState(activeState);
        shouldScrollToLatestMessageRef.current = true;
        setTurns([
          { kind: "question", text: displayAssistantMessage(started.assistantMessage) },
          { kind: "response", text: answer },
        ]);
      } else {
        const alreadyDisplayed = turns.at(-1)?.kind === "response" && turns.at(-1)?.text === answer;
        if (!alreadyDisplayed) {
          shouldScrollToLatestMessageRef.current = true;
          setTurns((previous) => [...previous, { kind: "response", text: answer }]);
        }
      }
      const result = await requestIntake({ operation: "turn", state: activeState, text: answer }, controller.signal);
      setState(result.state as IntakeState);
      shouldScrollToLatestMessageRef.current = true;
      setTurns((previous) => [...previous, { kind: "question", text: displayAssistantMessage(result.assistantMessage) }]);
      setSafetyStopped(result.safety === true);
    } catch (cause) {
      if (controller.signal.aborted) {
        if (activeState) setState(recordPatientAnswer(activeState as unknown as StructuredIntakeState, answer).state);
        else setDraft((current) => current || answer);
      } else {
        setDraft((current) => current || answer);
        setError(cause instanceof Error ? cause.message : "The AI service could not process this answer.");
      }
    } finally {
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        setBusy(false);
      }
    }
  }

  async function createBrief() {
    if (!state || busy || safetyStopped) return;
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    setBusyStatusIndex(0);
    setBusy(true);
    setError(null);
    try {
      const result = await requestIntake({ operation: "brief", state }, controller.signal);
      shouldScrollToLatestMessageRef.current = true;
      setBrief(asBrief(result.brief));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not create the draft summary.");
    } finally {
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        setBusy(false);
      }
    }
  }

  async function confirmBrief() {
    if (!state || busy || !brief) return;
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    setBusyStatusIndex(0);
    setBusy(true);
    setError(null);
    try {
      const result = await requestIntake({ operation: "confirm", state }, controller.signal);
      setState(result.state as IntakeState);
      shouldScrollToLatestMessageRef.current = true;
      setBrief(asBrief(result.brief));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not confirm the draft summary.");
    } finally {
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        setBusy(false);
      }
    }
  }

  const currentConversation: ConversationSnapshot | null = state || turns.length > 0
    ? { id: conversationId, title: activeTitle ?? conversationTitle(turns), state, turns, brief, safetyStopped, saved: isActiveSaved }
    : null;
  const recentConversations = [
    ...(currentConversation ? [currentConversation] : []),
    ...savedConversations.filter((conversation) => conversation.id !== conversationId),
  ];

  function renderComposer(centered: boolean) {
    return (
      <form
        ref={composerRef}
        onSubmit={submitAnswer}
        className="mx-auto mb-6 w-full max-w-2xl"
      >
        <label htmlFor="patient-answer" className="sr-only">Your message</label>
        <div className="flex items-center gap-3 rounded-full border border-line bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-focus/30">
          <textarea
            ref={answerFieldRef}
            id="patient-answer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            maxLength={8_000}
            aria-label="Your answer"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="block max-h-40 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-base leading-6 text-foreground placeholder:text-muted focus:outline-none disabled:opacity-60"
            placeholder="Message ConsultPrep…"
          />
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? stopGenerating : undefined}
            disabled={!busy && !draft.trim()}
            aria-label={busy ? "Stop generating" : "Send answer"}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold leading-none text-accent-contrast hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">{busy ? "■" : "↑"}</span>
          </button>
        </div>
        <div className="flex items-center justify-end gap-3 px-2 pt-2">
          {!centered && (
            <button type="button" onClick={createBrief} disabled={busy || turns.length < 2} className="shrink-0 text-xs font-medium text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50">
              Review summary
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background text-foreground">
      <aside aria-label="Conversations" className="hidden h-full min-h-0 w-56 shrink-0 flex-col border-r border-line bg-[#f7f8f7] px-3 py-4 sm:flex">
        <button
          type="button"
          onClick={newConversation}
          disabled={busy}
          className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-[#edf1ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
        >
          <span aria-hidden="true" className="text-xl leading-none text-accent">＋</span>
          New consultation
        </button>
        <h2 className="mb-2 mt-8 px-2 text-xs font-semibold text-muted">Recent</h2>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain" aria-label="Recent conversations">
          {recentConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group relative flex items-center gap-1 rounded-lg px-1 ${conversation.id === conversationId ? "bg-[#e8eeea]" : "hover:bg-[#edf1ee]"}`}
            >
              <button
                type="button"
                onClick={() => openConversation(conversation)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  showConversationMenu(conversation.id, event.clientX, event.clientY);
                }}
                aria-current={conversation.id === conversationId ? "page" : undefined}
                className={`min-w-0 flex-1 truncate rounded-lg bg-transparent px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ${conversation.id === conversationId ? "text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {conversation.title}
              </button>
              <button
                type="button"
                aria-label={`Options for ${conversation.title}`}
                aria-haspopup="menu"
                onClick={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  showConversationMenu(conversation.id, bounds.right - 190, bounds.bottom + 4);
                }}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-transparent text-muted opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus group-hover:opacity-100"
              >
                <span aria-hidden="true">···</span>
              </button>
            </div>
          ))}
          {recentConversations.length === 0 && <p className="px-3 py-2 text-sm text-muted">Your conversations will appear here.</p>}
        </nav>
      </aside>

      {contextMenu && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close conversation menu" onClick={() => setContextMenu(null)} />
          <div aria-label="Consultation options" className="fixed z-50 min-w-40 rounded-xl border border-line bg-surface p-1 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button type="button" onClick={() => renameConversation(contextMenu.id)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-[#edf1ee] focus-visible:outline-2 focus-visible:outline-focus">Rename</button>
            <button type="button" onClick={() => duplicateConversation(contextMenu.id)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-[#edf1ee] focus-visible:outline-2 focus-visible:outline-focus">Duplicate</button>
            <button type="button" onClick={() => toggleSavedConversation(contextMenu.id)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-[#edf1ee] focus-visible:outline-2 focus-visible:outline-focus">
              {conversationById(contextMenu.id)?.saved ? "Remove from saved" : "Save on this device"}
            </button>
            <div className="my-1 border-t border-line" />
            <button type="button" onClick={() => deleteConversation(contextMenu.id)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-error hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-focus">Delete</button>
          </div>
        </>
      )}

      <section aria-labelledby="conversation-title" className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 sm:px-8">
      <div className="px-4 pt-3 sm:hidden">
        <button type="button" onClick={newConversation} disabled={busy} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50">
          ＋ New consultation
        </button>
=======
  function updateInitialDraft(value: string) {
    setInitialDraft(value);
    setCheckedResponse(null);
  }

  return (
    <section aria-labelledby="conversation-title" className="mt-9">
      <h2 id="conversation-title" className="sr-only">Conversation preview</h2>
      <div className="space-y-7">
        <ConversationTurn label="Initial intake question" text={initialQuestion} kind="question" />
        <ResponseComposer
          label="Your initial concern"
          instructions="Write in your own words. Use made-up information."
          placeholder="For example, I would like to discuss a concern that began this week."
          value={initialDraft}
          onChange={updateInitialDraft}
          onValidCheck={setCheckedResponse}
        />

        {checkedResponse !== null && (
          <>
            <ConversationTurn
              label="Your response · Local preview"
              text={checkedResponse}
              kind="response"
              description="Shown exactly as entered. This is a local preview, not a saved response."
            />
            <ConversationTurn
              label="Synthetic preview question"
              text={syntheticFollowUp}
              kind="question"
              description="A fixed example. It was not generated by AI or written by a clinician."
            />
            <ResponseComposer
              label="Your response to the synthetic preview question"
              instructions="Add a made-up response. This local draft is not saved."
              placeholder="For example, the made-up concern began this week."
              value={followUpDraft}
              onChange={setFollowUpDraft}
            />
          </>
        )}
>>>>>>> Stashed changes
      </div>
      <h2 id="conversation-title" className="sr-only">Intake conversation</h2>

      <div className="flex min-h-0 flex-1 flex-col">
        {!state ? (
          <div className="intake-welcome flex min-h-0 flex-1 flex-col items-center justify-center py-8 text-center">
            <span aria-hidden="true" className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-contrast">C</span>
            <h3 className="mt-5 text-3xl font-semibold tracking-tight">Ready to prepare for your visit?</h3>
            <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-muted">Tell me what you’d like to discuss. I’ll help organize your concerns for a healthcare professional.</p>
          </div>
        ) : (
          <div ref={chatScrollRef} className="intake-chat scrollbar-hidden min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain py-8" aria-live="polite" aria-busy={busy}>
            {turns.map((turn, index) => (
              <div key={`${index}-${turn.kind}`}>
                <ConversationTurn
                  label={turn.kind === "question" ? "ConsultPrep" : "Your response"}
                  text={turn.text}
                  kind={turn.kind}
                />
              </div>
            ))}
            {busy && (
              <div role="status" aria-label={BUSY_STATUSES[busyStatusIndex]} className="flex items-center gap-3 pl-0 text-sm text-muted">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-preview text-xs font-bold text-accent">C</span>
                <span className="inline-flex items-center gap-1.5">
                  <span>{BUSY_STATUSES[busyStatusIndex]}</span>
                  <span aria-hidden="true" className="inline-flex items-center gap-1 py-1">
                    <span className="typing-dot size-1.5 rounded-full bg-muted" />
                    <span className="typing-dot size-1.5 rounded-full bg-muted" />
                    <span className="typing-dot size-1.5 rounded-full bg-muted" />
                  </span>
                </span>
              </div>
            )}
            {safetyStopped && (
              <p role="alert" className="rounded-xl border border-error bg-surface p-5 text-base leading-7 text-error">
                The routine intake has stopped after urgent guidance. This demo does not assess or rule out emergencies.
              </p>
            )}
            {brief && <BriefReview brief={brief} busy={busy} onConfirm={confirmBrief} />}
          </div>
        )}
        <p className="max-w-xl self-center text-center text-xs leading-5 text-muted">
          ConsultPrep AI can make mistakes. Check important information with a qualified healthcare professional.
        </p>
        {!safetyStopped && !brief && renderComposer(!state)}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-error bg-surface px-4 py-3 text-sm leading-6 text-error">{error}</p>}
      </section>
    </div>
  );
}

function BriefReview({ brief, busy, onConfirm }: { brief: Brief; busy: boolean; onConfirm: () => void }) {
  const section = (title: string, facts: BriefFact[]) => facts.length > 0 && (
    <section className="mt-5" aria-label={title}>
      <h4 className="font-semibold">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
        {facts.map((fact, index) => <li key={`${title}-${index}`}>{fact.text} <span className="text-muted">({fact.sourceResponseIds.join(", ")})</span></li>)}
      </ul>
    </section>
  );

  return (
    <section aria-labelledby="brief-title" className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
        {brief.status === "patient_confirmed" ? "Confirmed · Not submitted" : "AI-generated draft · Review before confirming"}
      </p>
      <h3 id="brief-title" className="mt-2 text-xl font-semibold">Consultation summary</h3>
      {section("Reason for consultation", brief.reasonForConsultation)}
      {section("Symptoms reported", brief.currentSymptoms)}
      {section("Timeline", brief.symptomTimeline)}
      {section("Relevant context", brief.relevantBackground)}
      {brief.importantUnansweredQuestions.length > 0 && (
        <section className="mt-5" aria-label="Information still to clarify">
          <h4 className="font-semibold">Information still to clarify</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
            {brief.importantUnansweredQuestions.map((item, index) => <li key={`${item.status}-${index}`}>{item.question} <span className="text-muted">({item.status.replaceAll("_", " ")})</span></li>)}
          </ul>
        </section>
      )}
      {brief.sourceTraceability.length > 0 && (
        <details className="mt-5 border-t border-line pt-4">
          <summary className="cursor-pointer font-semibold">Original answers used for this draft</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">
            {brief.sourceTraceability.map((source) => <li key={source.responseId}>{source.originalText}</li>)}
          </ol>
        </details>
      )}
      <p className="mt-5 text-sm leading-6 text-muted">This summary organizes what was shared. It is not a diagnosis or treatment advice, and no clinician has reviewed it.</p>
      {brief.status !== "patient_confirmed" && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-5 py-3 font-semibold text-accent-contrast hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus disabled:opacity-60"
        >
          {busy ? "Confirming…" : "This summary is accurate"}
        </button>
      )}
    </section>
  );
}
