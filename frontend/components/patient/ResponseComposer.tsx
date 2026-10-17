"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

export default function ResponseComposer() {
  const [concern, setConcern] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locallyChecked, setLocallyChecked] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const instructionsId = `${fieldId}-instructions`;
  const errorId = `${fieldId}-error`;

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    setConcern(nextValue);
    setLocallyChecked(false);
    if (error && nextValue.trim()) {
      setError(null);
    }
  }

  function handleCheck() {
    if (!concern.trim()) {
      setError("Enter a concern before checking your response.");
      setLocallyChecked(false);
      fieldRef.current?.focus();
      return;
    }

    setError(null);
    setLocallyChecked(true);
  }

  return (
    <form noValidate className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-base font-semibold text-foreground">
          Your initial concern
        </label>
        <p id={instructionsId} className="text-sm leading-6 text-muted">
          Write in your own words. Use made-up information in this preview.
        </p>
      </div>

      <textarea
        ref={fieldRef}
        id={fieldId}
        value={concern}
        onChange={handleChange}
        rows={6}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${instructionsId} ${errorId}` : instructionsId}
        className="mt-5 block min-h-40 w-full resize-y rounded-lg border border-line bg-field px-4 py-3 text-base leading-7 text-foreground placeholder:text-muted focus:border-accent focus:outline-3 focus:outline-offset-2 focus:outline-focus"
        placeholder="For example, I would like to discuss a concern that began this week."
      />

      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-error">
          {error}
        </p>
      )}

      {locallyChecked && (
        <p role="status" className="mt-4 rounded-lg border border-line bg-preview px-4 py-3 text-sm leading-6 text-preview-foreground">
          Local check complete. Your text has not been saved or sent.
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-sm leading-6 text-muted">
          This checks for entered text only. It does not create an intake or contact AI.
        </p>
        <button
          type="button"
          onClick={handleCheck}
          className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-lg bg-accent px-5 py-3 font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus sm:w-auto"
        >
          Check response locally
        </button>
      </div>
    </form>
  );
}
