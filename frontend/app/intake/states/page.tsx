import Link from "next/link";
import InformationStatePreview from "@/components/patient/InformationStatePreview";

export default function InformationStatesPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <nav aria-label="Page navigation">
        <Link
          href="/intake"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span aria-hidden="true">←</span>
          Back to intake preview
        </Link>
      </nav>

      <div className="mt-9 rounded-xl border border-line bg-preview px-5 py-4 text-sm leading-6 text-preview-foreground" role="note">
        <strong>Synthetic UI-development preview.</strong> These five labels are provisional. The examples are made up, were not produced by AI, and are not saved or connected to a patient or clinician record.
      </div>

      <header className="mt-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Patient information preview</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Information-state preview</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Compare how reported, unknown, unanswered, unclear, and conflicting information could be shown. Original patient wording stays visible when a response exists.
        </p>
      </header>

      <InformationStatePreview />
    </main>
  );
}
