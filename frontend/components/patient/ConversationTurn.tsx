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
    </article>
  );
}
