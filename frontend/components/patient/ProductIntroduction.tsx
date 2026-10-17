"use client";

import { useState } from "react";
import Link from "next/link";
import { storeLandingDraft } from "../../lib/preview-draft";

export default function ProductIntroduction() {
  const [concern, setConcern] = useState("");

  return (
    <main id="main-content" className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-5xl flex-col justify-center px-5 pb-20 pt-14 sm:px-8 sm:pb-24 lg:px-12">
      <div className="mx-auto w-full max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Prepare for a healthcare conversation</p>
        <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground sm:text-6xl">ConsultPrep AI</h1>
        <p className="mt-4 text-xl font-medium text-muted sm:text-2xl">AI documents. Clinicians decide.</p>

        <section aria-labelledby="landing-prompt" className="mt-10 rounded-3xl border border-line bg-surface p-5 text-left shadow-sm sm:p-7">
          <h2 id="landing-prompt" className="sr-only">Start a preview concern</h2>
          <label htmlFor="landing-concern" className="block text-lg font-semibold text-foreground">What would you like to discuss?</label>
          <textarea
            id="landing-concern"
            value={concern}
            onChange={(event) => setConcern(event.target.value)}
            aria-describedby="landing-instructions"
            rows={3}
            placeholder="For example, a concern I would like to discuss..."
            className="mt-5 block min-h-28 w-full resize-y rounded-2xl border border-line bg-field px-4 py-3 text-base leading-7 text-foreground placeholder:text-muted focus:border-accent focus:outline-3 focus:outline-offset-2 focus:outline-focus"
          />
          <div className="mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <p id="landing-instructions" className="text-sm leading-6 text-muted">Use made-up information. This temporary browser-tab draft does not create a patient record.</p>
            <Link
              href="/intake"
              onClick={() => storeLandingDraft(concern)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 py-3 text-center font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
            >
<<<<<<< Updated upstream
              Try the AMD AI intake
              <span aria-hidden="true">→</span>
            </Link>
            <span className="max-w-xs text-sm leading-6 text-muted">
              Development demo. Nothing is saved to a patient record or sent to a clinician.
            </span>
          </div>
        </section>

        <aside className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8 lg:col-span-2" aria-labelledby="preview-title">
          <p className="inline-flex rounded-full bg-preview px-3 py-1 text-xs font-semibold uppercase tracking-wide text-preview-foreground">
            AMD AI demo
          </p>
          <h2 id="preview-title" className="mt-5 text-2xl font-semibold tracking-tight">
            Try an intake conversation
          </h2>
          <p className="mt-3 leading-7 text-muted">
            Talk through your concerns with AMD AI and review a source-linked draft summary.
          </p>
          <ul className="mt-6 space-y-3 border-t border-line pt-6 text-sm leading-6 text-foreground">
            <li>Your submitted answers are sent to AMD AI for a response.</li>
            <li>Nothing is saved to a patient record or sent to a clinician.</li>
          </ul>
        </aside>
      </div>

      <section className="mt-16 max-w-3xl border-t border-line pt-8" aria-labelledby="purpose-title">
        <h2 id="purpose-title" className="text-xl font-semibold tracking-tight">
          An aid for gathering information
        </h2>
        <p className="mt-3 leading-7 text-muted">
          ConsultPrep AI organizes what you share. It does not diagnose, prescribe, or replace professional medical judgment. A clinician has not reviewed this development demo.
=======
              Begin intake preview <span aria-hidden="true" className="ml-2">→</span>
            </Link>
          </div>
        </section>

        <p className="mx-auto mt-7 max-w-xl text-sm leading-6 text-muted">
          ConsultPrep AI organizes information before a consultation. It does not diagnose, prescribe medication, or replace professional medical judgment.
>>>>>>> Stashed changes
        </p>
        <details id="about" className="mx-auto mt-5 max-w-xl text-left text-sm leading-6 text-muted">
          <summary className="mx-auto w-fit cursor-pointer rounded-md font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus">How this preview works</summary>
          <p className="mt-3 rounded-2xl border border-line bg-elevated p-4">This preview checks text locally and shows synthetic examples. Nothing is sent to AI or a clinician. In the full workflow, a clinician would review the collected information.</p>
        </details>
      </div>
    </main>
  );
}
