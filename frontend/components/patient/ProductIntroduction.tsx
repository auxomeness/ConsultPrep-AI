import Link from "next/link";

export default function ProductIntroduction() {
  return (
    <main
      id="main-content"
      className="flex min-h-[calc(100dvh-69px)] items-center justify-center px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          ConsultPrep AI
        </h1>
        <p className="mt-4 text-xl font-medium text-foreground sm:text-2xl">
          AI documents. Clinicians decide.
        </p>
        <p className="mx-auto mt-20 max-w-lg text-base leading-7 text-muted sm:text-lg">
          Organize what you want to share before a healthcare consultation.
        </p>

        <Link
          href="/intake"
          className="mx-auto mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-8 py-3 text-base font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus sm:w-auto sm:min-w-48"
        >
          Begin intake
        </Link>

        <div className="mx-auto mt-10 max-w-lg space-y-2 text-sm leading-6 text-muted">
          <p>Demo only. Use made-up information; no patient record is created.</p>
          <p>ConsultPrep does not diagnose, prescribe, or replace professional medical judgment.</p>
        </div>
      </div>
    </main>
  );
}
