"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

type ResponseComposerProps = {
  label: string;
  instructions: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onValidCheck?: (value: string) => void;
};

export default function ResponseComposer({
  label,
  instructions,
  placeholder,
  value,
  onChange,
  onValidCheck,
}: ResponseComposerProps) {
  const [error, setError] = useState<string | null>(null);
  const [locallyChecked, setLocallyChecked] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const instructionsId = `${fieldId}-instructions`;
  const errorId = `${fieldId}-error`;

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    onChange(nextValue);
    setLocallyChecked(false);
    if (error && nextValue.trim()) {
      setError(null);
    }
  }

  function handleCheck() {
    if (!value.trim()) {
      setError("Enter a concern before checking your response.");
      setLocallyChecked(false);
      fieldRef.current?.focus();
      return;
    }

    setError(null);
    setLocallyChecked(true);
    onValidCheck?.(value);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-base font-semibold text-foreground">
          {label}
        </label>
        <p id={instructionsId} className="text-sm leading-6 text-muted">
          {instructions}
        </p>
      </div>

      <textarea
        ref={fieldRef}
        id={fieldId}
        value={value}
        onChange={handleChange}
        rows={6}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${instructionsId} ${errorId}` : instructionsId}
        className="mt-5 block min-h-40 w-full resize-y rounded-lg border border-line bg-field px-4 py-3 text-base leading-7 text-foreground placeholder:text-muted focus:border-accent focus:outline-3 focus:outline-offset-2 focus:outline-focus"
        placeholder={placeholder}
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

      {onValidCheck && (
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
      )}
    </div>
  );
}
