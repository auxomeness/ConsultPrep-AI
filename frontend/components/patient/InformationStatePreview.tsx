// UI-development fixtures only. Labels and shape are provisional, not an AI or backend contract.
const examples = [
  {
    label: "Reported",
    meaning: "The patient explicitly provided this information.",
    statements: [{ label: "Original patient statement", text: "I've had a headache since Monday." }],
    explanation: "Patient wording is visible here; it is not a medically verified finding.",
  },
  {
    label: "Unknown",
    meaning: "The patient explicitly said they do not know.",
    question: "What time did the symptom begin?",
    statements: [{ label: "Original patient response", text: "I don't know." }],
    explanation: "This is an expressed uncertainty, not a denial or missing response.",
  },
  {
    label: "Not answered",
    meaning: "A question was asked, but no patient answer was provided.",
    question: "Has this happened before?",
    statements: [],
    explanation: "No response is invented. This differs from Unknown and does not mean No.",
  },
  {
    label: "Unclear",
    meaning: "The patient answered, but the wording needs clarification.",
    question: "How often does this happen?",
    statements: [{ label: "Original patient response", text: "Sometimes." }],
    explanation: "The original wording remains visible; no more specific interpretation is chosen.",
  },
  {
    label: "Conflicting",
    meaning: "Two patient statements differ and the conflict is unresolved.",
    statements: [
      { label: "Original patient statement 1", text: "It started Monday." },
      { label: "Original patient statement 2", text: "It started Wednesday." },
    ],
    explanation: "Both statements remain visible. Neither is selected as correct.",
  },
] as const;

export default function InformationStatePreview() {
  return (
    <div className="mt-8 space-y-5">
      {examples.map((example) => (
        <article key={example.label} aria-labelledby={`state-${example.label.replaceAll(" ", "-").toLowerCase()}`} className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8">
          <h2 id={`state-${example.label.replaceAll(" ", "-").toLowerCase()}`} className="text-xl font-semibold leading-8">
            {example.label}
          </h2>
          <p className="mt-2 text-base leading-7 text-muted">{example.meaning}</p>

          {"question" in example && (
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-foreground">Original question</h3>
              <p className="mt-2 break-words [overflow-wrap:anywhere] leading-7">{example.question}</p>
            </div>
          )}

          <div className="mt-5 border-t border-line pt-5">
            <h3 className="text-sm font-semibold text-foreground">Patient response</h3>
            {example.statements.length > 0 ? (
              <ol className="mt-3 space-y-4">
                {example.statements.map((statement) => (
                  <li key={statement.label}>
                    <p className="text-sm font-medium text-muted">{statement.label}</p>
                    <blockquote className="mt-2 border-l-4 border-accent pl-4 break-words [overflow-wrap:anywhere] text-base leading-7 text-foreground">
                      {statement.text}
                    </blockquote>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-base leading-7 text-foreground">No patient response was provided for this question.</p>
            )}
          </div>

          <p className="mt-5 border-t border-line pt-5 text-sm leading-6 text-muted">{example.explanation}</p>
        </article>
      ))}
    </div>
  );
}
