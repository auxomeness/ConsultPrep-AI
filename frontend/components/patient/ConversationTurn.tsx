import { useId } from "react";

type ConversationTurnProps = {
  label: string;
  text: string;
  kind: "question" | "response";
  description?: string;
};

export default function ConversationTurn({ label, text, kind, description }: ConversationTurnProps) {
  const labelId = useId();
  const isResponse = kind === "response";

  return (
    <article
      aria-labelledby={labelId}
<<<<<<< Updated upstream
      className={`flex w-full items-start gap-3 ${isResponse ? "justify-end" : "justify-start"}`}
    >
      {!isResponse && (
        <span aria-hidden="true" className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-contrast">C</span>
      )}
      <div className={`min-w-0 max-w-[min(88%,44rem)] ${isResponse ? "rounded-3xl bg-user-bubble px-5 py-3 text-user-bubble-foreground" : "text-assistant-bubble-foreground"}`}>
        <h3 id={labelId} className="sr-only">{label}</h3>
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-lg leading-8">
          {text}
        </p>
        {description && <p className="mt-2 text-sm leading-6 text-muted">{description}</p>}
      </div>
=======
      className={`flex min-w-0 flex-col ${kind === "response" ? "items-end" : "items-start"}`}
    >
      <h3 id={labelId} className="mb-2 px-1 text-sm font-semibold text-muted">
        {label}
      </h3>
      <p className={`max-w-[92%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-5 py-4 text-base leading-7 text-foreground sm:max-w-[85%] ${kind === "response" ? "rounded-tr-md bg-secondary" : "rounded-tl-md border border-line bg-surface"}`}>
        {text}
      </p>
      {description && <p className="mt-2 max-w-[92%] px-1 text-sm leading-6 text-muted sm:max-w-[85%]">{description}</p>}
>>>>>>> Stashed changes
    </article>
  );
}
