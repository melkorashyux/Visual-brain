"use client";

import { useCallback, useEffect, useState } from "react";

type Choice = "anthropic" | "ollama" | "none";

interface OllamaStatus {
  running: boolean;
  hasModel: boolean;
  model: string;
}

interface PullProgress {
  status: string;
  percent: number | null;
}

const OPTIONS: { id: Choice; label: string; detail: string }[] = [
  {
    id: "anthropic",
    label: "Claude",
    detail: "Best results. Uses your Anthropic API key — images are sent to Anthropic.",
  },
  {
    id: "ollama",
    label: "On this computer (Ollama)",
    detail: "Free and private. Runs a local model — results are simpler.",
  },
  {
    id: "none",
    label: "Use Visual Brain with no AI analysis",
    detail: "Save and organize images yourself, and add your own titles and tags.",
  },
];

/**
 * First-launch screen: pick how new images get titled and tagged — Claude,
 * a local Ollama model, or no AI at all.
 * Whatever is chosen is saved to the same settings the Settings page edits,
 * plus setupComplete so this screen never shows again.
 */
export function SetupClient({
  claudeModel,
  ollamaModel,
}: {
  claudeModel: string;
  ollamaModel: string;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(settings: Record<string, string>) {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, setupComplete: true }),
      });
      if (!res.ok) throw new Error();
      // A full load, not router.replace: the client router cached "/" as a
      // redirect to /setup on the way in and would follow it again.
      window.location.replace("/");
    } catch {
      setError("Couldn't save your choice. Try again.");
      setFinishing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-16">
      <p className="tracked-label text-accent">Welcome to Visual Brain</p>
      <h1 className="page-heading mt-3">How should new images be tagged?</h1>
      <p className="mt-3 text-muted">
        Visual Brain can title, tag and describe each image you save, or leave that to you.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => {
              setChoice(option.id);
              setError(null);
            }}
            className={`flex flex-col gap-1 border px-4 py-3 text-left transition-colors duration-150 ${
              choice === option.id
                ? "border-accent bg-surface"
                : "border-border-strong hover:bg-surface"
            }`}
          >
            <span className="text-[14px]">{option.label}</span>
            <span className="text-[12px] text-muted">{option.detail}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        You can switch anytime in Settings.
      </p>

      {choice === "anthropic" && (
        <ClaudeStep
          model={claudeModel}
          busy={finishing}
          onDone={(apiKey) =>
            finish({ analysisProvider: "anthropic", anthropicApiKey: apiKey, analysisModel: claudeModel })
          }
        />
      )}
      {choice === "ollama" && (
        <OllamaStep
          model={ollamaModel}
          busy={finishing}
          onDone={() => finish({ analysisProvider: "ollama" })}
        />
      )}

      {choice === "none" && (
        <button
          onClick={() => finish({ analysisProvider: "none" })}
          disabled={finishing}
          className="tracked-label mt-8 border border-accent bg-accent px-4 py-2 text-bg disabled:opacity-50"
        >
          continue
        </button>
      )}

      {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}
    </main>
  );
}

function ClaudeStep({
  model,
  busy,
  onDone,
}: {
  model: string;
  busy: boolean;
  onDone: (apiKey: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function testAndContinue() {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't check the key.");
      onDone(apiKey.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the key.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="mt-8">
      <p className="tracked-label mb-3 text-dim">Anthropic API Key</p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && apiKey.trim()) testAndContinue();
        }}
        placeholder="sk-ant-..."
        autoComplete="off"
        autoFocus
        className="field w-full px-2.5 py-1.5"
      />
      <p className="mt-2 text-[11px] text-muted">
        Create one at{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          console.anthropic.com
        </a>
        . It&apos;s stored only on this computer.
      </p>
      {error && <p className="mt-3 text-[12px] text-red-500">{error}</p>}
      <button
        onClick={testAndContinue}
        disabled={!apiKey.trim() || testing || busy}
        className="tracked-label mt-6 border border-accent bg-accent px-4 py-2 text-bg disabled:opacity-50"
      >
        {testing ? "checking…" : "check key & continue"}
      </button>
    </section>
  );
}

function OllamaStep({
  model,
  busy,
  onDone,
}: {
  model: string;
  busy: boolean;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/setup/ollama");
      setStatus(await res.json());
    } catch {
      setStatus({ running: false, hasModel: false, model });
    } finally {
      setChecking(false);
    }
  }, [model]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
  }, [check]);

  async function downloadModel() {
    setError(null);
    setProgress({ status: "starting download…", percent: null });
    try {
      const res = await fetch("/api/setup/ollama/pull", { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed.");
      }

      // Ollama streams one JSON object per line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            status?: string;
            total?: number;
            completed?: number;
            error?: string;
          };
          if (event.error) throw new Error(event.error);
          setProgress({
            status: event.status ?? "",
            percent:
              event.total && event.completed != null
                ? Math.round((event.completed / event.total) * 100)
                : null,
          });
        }
      }
      setProgress(null);
      await check();
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Download failed.");
    }
  }

  return (
    <section className="mt-8">
      <p className="tracked-label mb-3 text-dim">Ollama</p>

      {!status || checking ? (
        <p className="text-muted">Looking for Ollama…</p>
      ) : !status.running ? (
        <>
          <p className="text-muted">Ollama isn&apos;t running on this computer.</p>
          <p className="mt-2 text-[12px] text-muted">
            Install it from{" "}
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              ollama.com/download
            </a>
            , open it, then check again.
          </p>
          <button
            onClick={check}
            className="tracked-label mt-6 border border-border-strong px-4 py-2 transition-colors duration-150 hover:bg-text hover:text-bg"
          >
            check again
          </button>
        </>
      ) : !status.hasModel ? (
        <>
          <p className="text-muted">
            Ollama is running. It needs the <span className="text-text">{status.model}</span>{" "}
            model to look at images — a one-time download of about 3 GB.
          </p>
          {progress ? (
            <div className="mt-6">
              <div className="h-1.5 w-full bg-border">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${progress.percent ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {progress.status}
                {progress.percent != null && ` · ${progress.percent}%`}
              </p>
            </div>
          ) : (
            <button
              onClick={downloadModel}
              className="tracked-label mt-6 border border-accent bg-accent px-4 py-2 text-bg"
            >
              download model
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-muted">
            Ollama is ready with <span className="text-text">{status.model}</span>.
          </p>
          <button
            onClick={onDone}
            disabled={busy}
            className="tracked-label mt-6 border border-accent bg-accent px-4 py-2 text-bg disabled:opacity-50"
          >
            continue
          </button>
        </>
      )}

      {error && <p className="mt-3 text-[12px] text-red-500">{error}</p>}
    </section>
  );
}
