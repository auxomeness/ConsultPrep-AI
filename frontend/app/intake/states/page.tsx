import Link from "next/link";
import InformationStatePreview from "@/components/patient/InformationStatePreview";

export default function InformationStatesPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
      <nav aria-label="Page navigation">
        <Link
          href="/intake"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span aria-hidden="true">←</span>
          Back to intake preview
        </Link>
      </nav>

      <div className="mt-7 rounded-2xl border border-line bg-preview px-5 py-4 text-sm leading-6 text-preview-foreground" role="note">
        <strong>Synthetic UI-development preview.</strong> These five answer labels use the current information-status vocabulary. Every example is made up, was not produced by AI, and is not saved or connected to a patient or clinician record.
      </div>

      <header className="mt-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Patient information preview</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Information states</h1>
        <p className="mt-3 text-base leading-7 text-muted">See how five different answer states appear in a made-up example. Original wording stays visible when a response exists.</p>
      </header>

      <InformationStatePreview />
    </main>
  );
}
