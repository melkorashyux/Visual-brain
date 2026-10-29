import { getSettings } from "@/lib/settings";

export interface OllamaStatus {
  running: boolean;
  hasModel: boolean;
  model: string;
}

/** Ollama lists "gemma3" as "gemma3:latest", so an untagged name matches that. */
function sameModel(installed: string, wanted: string): boolean {
  return installed === wanted || (!wanted.includes(":") && installed === `${wanted}:latest`);
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const { ollamaHost, ollamaModel } = getSettings();
  try {
    const res = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    if (!res.ok) return { running: false, hasModel: false, model: ollamaModel };
    const data = (await res.json()) as { models?: { name: string }[] };
    const hasModel = (data.models ?? []).some((m) => sameModel(m.name, ollamaModel));
    return { running: true, hasModel, model: ollamaModel };
  } catch {
    return { running: false, hasModel: false, model: ollamaModel };
  }
}
