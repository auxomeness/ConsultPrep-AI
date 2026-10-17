import Link from "next/link";
import IntakeConversation from "@/components/patient/IntakeConversation";

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
        <strong>Frontend development preview.</strong> Use made-up information only. No patient session is created, nothing is saved or submitted, no AI service is called, and no clinician receives this information.
      </div>

      <header className="mt-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Patient intake preview</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Describe your main concern
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Check an initial concern locally, then explore how your exact wording and one synthetic follow-up would appear in a conversation.
        </p>
      </header>

      <IntakeConversation />

      <section aria-labelledby="states-preview-title" className="mt-12 border-t border-line pt-8">
        <h2 id="states-preview-title" className="text-xl font-semibold">Explore information states</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          A separate synthetic preview compares provisional information labels. Leaving this page clears the local response drafts.
        </p>
        <Link
          href="/intake/states"
          className="mt-5 inline-flex min-h-12 items-center rounded-lg border border-accent px-5 py-3 font-semibold text-accent hover:bg-preview focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          View information-state preview
        </Link>
      </section>
    </main>
  );
}
