import IntakeConversation from "@/components/patient/IntakeConversation";

export default function IntakePreviewPage() {
  return (
    <main id="main-content" className="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full flex-col overflow-hidden bg-background">
      <h1 className="sr-only">Prepare for a clinician visit</h1>
      <p className="mx-4 mt-2 rounded-xl bg-preview px-4 py-2 text-center text-xs leading-5 text-preview-foreground sm:mx-8" role="note">
        <strong>Development demo.</strong> Use made-up information. Answers may be sent to AMD AI. No patient record or clinician handoff is created.
      </p>
      <IntakeConversation />
    </main>
  );
}
