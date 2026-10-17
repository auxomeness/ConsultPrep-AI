import IntakeConversation from "@/components/patient/IntakeConversation";

export default function IntakePreviewPage() {
  return (
<<<<<<< Updated upstream
    <main id="main-content" className="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full flex-col overflow-hidden bg-background">
      <h1 className="sr-only">Prepare for a clinician visit</h1>
      <p className="sr-only" role="note">
        This is a development demo. The conversation is not saved to a patient record or sent to a clinician.
      </p>
      <IntakeConversation />
=======
    <main id="main-content" className="mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
      <nav aria-label="Page navigation">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span aria-hidden="true">←</span>
          Back to introduction
        </Link>
      </nav>

      <div className="mt-7 rounded-2xl border border-line bg-preview px-5 py-4 text-sm leading-6 text-preview-foreground" role="note">
        <strong>Frontend development preview.</strong> Use made-up information only. No patient session is created. Nothing is saved, submitted, or sent to AI or a clinician.
      </div>

      <header className="mt-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Patient intake preview</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Let&apos;s start with your concern</h1>
        <p className="mt-3 text-base leading-7 text-muted">Write in your own words. This preview checks your answer locally and shows one made-up follow-up question.</p>
      </header>

      <IntakeConversation />

      <section aria-labelledby="more-previews-title" className="mt-12 border-t border-line pt-7">
        <h2 id="more-previews-title" className="text-lg font-semibold">Explore the other previews</h2>
        <p className="mt-2 text-sm leading-6 text-muted">These use separate made-up examples. Leaving this page clears the local response drafts; your local drafts are not carried there.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/intake/states" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold text-accent hover:border-accent focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus">View information states</Link>
          <Link href="/intake/review" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold text-accent hover:border-accent focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus">View synthetic patient review</Link>
        </div>
      </section>
>>>>>>> Stashed changes
    </main>
  );
}
