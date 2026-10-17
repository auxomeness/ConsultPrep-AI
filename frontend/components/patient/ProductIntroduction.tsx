import Link from "next/link";

export default function ProductIntroduction() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:px-12 lg:pt-24">
      <div className="grid items-start gap-12 lg:grid-cols-5 lg:gap-16">
        <section className="lg:col-span-3" aria-labelledby="introduction-title">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            Pre-consultation preparation
          </p>
          <h1 id="introduction-title" className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Organize your concerns before the conversation.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-muted">
            ConsultPrep AI helps put what you want to discuss into clear words before a consultation with a healthcare professional.
          </p>
          <p className="mt-5 text-lg font-semibold text-foreground">
            AI documents. Clinicians decide.
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/intake"
              className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-accent px-6 py-3 text-center font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus sm:w-auto"
            >
              Preview patient intake
              <span aria-hidden="true">→</span>
            </Link>
            <span className="max-w-xs text-sm leading-6 text-muted">
              Frontend preview only. No patient record is created.
            </span>
          </div>
        </section>

        <aside className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8 lg:col-span-2" aria-labelledby="preview-title">
          <p className="inline-flex rounded-full bg-preview px-3 py-1 text-xs font-semibold uppercase tracking-wide text-preview-foreground">
            Development preview
          </p>
          <h2 id="preview-title" className="mt-5 text-2xl font-semibold tracking-tight">
            Try the first step
          </h2>
          <p className="mt-3 leading-7 text-muted">
            Explore the initial concern field and its local validation using made-up information.
          </p>
          <ul className="mt-6 space-y-3 border-t border-line pt-6 text-sm leading-6 text-foreground">
            <li>No information is saved or sent.</li>
            <li>AI questions and submission are not connected.</li>
            <li>Use synthetic information only.</li>
          </ul>
        </aside>
      </div>

      <section className="mt-16 max-w-3xl border-t border-line pt-8" aria-labelledby="purpose-title">
        <h2 id="purpose-title" className="text-xl font-semibold tracking-tight">
          An aid for gathering information
        </h2>
        <p className="mt-3 leading-7 text-muted">
          ConsultPrep AI does not diagnose conditions, prescribe medication, or replace professional medical judgment. When the full workflow is integrated, the information will be reviewed by a clinician.
        </p>
      </section>
    </main>
  );
}
