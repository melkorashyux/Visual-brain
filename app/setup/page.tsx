import { Nav } from "@/components/Nav";
import { SetupClient } from "@/components/SetupClient";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const { analysisModel, ollamaModel } = getSettings();

  return (
    <>
      <Nav />
      <SetupClient claudeModel={analysisModel} ollamaModel={ollamaModel} />
    </>
  );
}
