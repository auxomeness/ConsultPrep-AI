import Link from "next/link";
import ResponseComposer from "@/components/patient/ResponseComposer";

export default function IntakePreviewPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <nav aria-label="Page navigation">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span aria-hidden="true">←</span>
          Back to introduction
        </Link>
      </nav>

      <div className="mt-9 rounded-xl border border-line bg-preview px-5 py-4 text-sm leading-6 text-preview-foreground" role="note">
        <strong>Frontend development preview.</strong> Use made-up information only. No session is created, and nothing you type is saved or sent.
      </div>

      <header className="mt-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Patient intake preview</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Describe your main concern
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          This page demonstrates the first question and local field validation. The full intake conversation is not connected yet.
        </p>
      </header>

      <section aria-labelledby="prompt-title" className="mt-10">
        <div className="mb-5 border-l-4 border-accent pl-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Synthetic initial prompt</p>
          <h2 id="prompt-title" className="mt-2 text-xl font-semibold leading-8">
            What would you like to discuss with a healthcare professional?
          </h2>
        </div>
        <ResponseComposer />
      </section>

      <p className="mt-8 text-sm leading-6 text-muted">
        Response saving, AI follow-up questions, review, and submission are unavailable in this preview.
      </p>
    </main>
  );
}
