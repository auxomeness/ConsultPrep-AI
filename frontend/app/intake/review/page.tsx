import Link from "next/link";
import PatientReview from "@/components/patient/PatientReview";
import { reviewFixture } from "@/lib/review-fixture";

export default function ReviewPreviewPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
      <nav aria-label="Page navigation">
        <Link href="/intake" className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus">
          <span aria-hidden="true">←</span> Back to intake preview
        </Link>
      </nav>

      <div className="mt-7 rounded-2xl border border-line bg-preview px-5 py-4 text-sm leading-6 text-preview-foreground" role="note">
        <strong>Synthetic review preview.</strong> This made-up example is separate from your intake draft. No AI generated it, no patient record was retrieved, and nothing can be saved, confirmed, or submitted here.
      </div>

      <header className="mt-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Patient review preview</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Review the example brief</h1>
        <p className="mt-3 text-base leading-7 text-muted">Read the draft, then open a source to see the exact supporting statement. The original responses and their information states appear below.</p>
      </header>

      <PatientReview state={{ kind: "ready", data: reviewFixture }} />
    </main>
  );
}
