import IntakeConversation from "@/components/patient/IntakeConversation";

export default function IntakePreviewPage() {
  return (
    <main id="main-content" className="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full flex-col overflow-hidden bg-background">
      <h1 className="sr-only">Prepare for a clinician visit</h1>
      <IntakeConversation />
    </main>
  );
}
