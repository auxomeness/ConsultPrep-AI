import Link from "next/link";
import PatientReview from "@/components/patient/PatientReview";
import { reviewFixture } from "@/lib/review-fixture";

export default function ReviewPreviewPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <nav aria-label="Page navigation">
        <Link href="/intake" className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus">
          <span aria-hidden="true">←</span> Back to intake preview
        </Link>
      </nav>

      <div className="mt-9 rounded-xl border border-line bg-preview px-5 py-4 text-sm leading-6 text-preview-foreground" role="note">
        <strong>Synthetic review preview.</strong> This page uses made-up fixture data shaped to Member 1&apos;s brief contract. It is not linked to your intake preview draft. No AI generated this example, no patient record or brief was retrieved, and nothing can be saved, confirmed, or submitted here.
      </div>

      <header className="mt-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Patient review preview</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Review statements and sources</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">Compare original patient wording, current information states, and a synthetic consultation brief. Open each source to see the exact supporting statement.</p>
      </header>

      <PatientReview state={{ kind: "ready", data: reviewFixture }} />
    </main>
  );
}
