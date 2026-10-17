import { useId } from "react";

type ConversationTurnProps = {
  label: string;
  text: string;
  kind: "question" | "response";
  description?: string;
};

export default function ConversationTurn({ label, text, kind, description }: ConversationTurnProps) {
  const labelId = useId();

  return (
    <article
      aria-labelledby={labelId}
      className={`rounded-xl border border-line p-5 sm:p-6 ${kind === "response" ? "bg-preview" : "bg-surface"}`}
    >
      <h3 id={labelId} className="text-sm font-semibold text-foreground">
        {label}
      </h3>
      <p className="mt-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-base leading-7 text-foreground">
        {text}
      </p>
      {description && <p className="mt-3 text-sm leading-6 text-muted">{description}</p>}
    </article>
  );
}
