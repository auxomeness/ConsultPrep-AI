import IntakeConversation from "@/components/patient/IntakeConversation";

export default function IntakePreviewPage() {
  return (
    <main id="main-content" className="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full flex-col overflow-hidden bg-background">
      <h1 className="sr-only">Prepare for a clinician visit</h1>
      <p className="sr-only" role="note">
        This is a development demo. The conversation is not saved to a patient record or sent to a clinician.
      </p>
      <IntakeConversation />
    </main>
  );
}
