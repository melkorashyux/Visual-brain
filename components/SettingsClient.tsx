"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_FONT_ID,
  DEFAULT_HEADER_SIZE_ID,
  FONT_OPTIONS,
  FONT_STORAGE_KEY,
  HEADER_SIZE_OPTIONS,
  HEADER_SIZE_STORAGE_KEY,
  applyTheme,
  isValidHex,
} from "@/lib/theme";

interface SettingsResponse {
  analysisProvider: "anthropic" | "ollama";
  anthropicApiKey: string; // masked
  anthropicApiKeySet: boolean;
  analysisModel: string;
  ollamaHost: string;
  ollamaModel: string;
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-14 flex items-center gap-3 first:mt-0">
      <span className="tracked-label text-accent">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function SettingsClient() {
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState<"anthropic" | "ollama">("ollama");
  const [maskedKey, setMaskedKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [analysisModel, setAnalysisModel] = useState("");
  const [ollamaHost, setOllamaHost] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [hexInput, setHexInput] = useState(DEFAULT_ACCENT);
  const [headerSizeId, setHeaderSizeId] = useState(DEFAULT_HEADER_SIZE_ID);

  const [extensionToken, setExtensionToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<"idle" | "copied" | "regenerated" | "error">("idle");

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: SettingsResponse) => {
        setProvider(data.analysisProvider);
        setMaskedKey(data.anthropicApiKey);
        setKeySet(data.anthropicApiKeySet);
        setAnalysisModel(data.analysisModel);
        setOllamaHost(data.ollamaHost);
        setOllamaModel(data.ollamaModel);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    fetch("/api/extension-token")
      .then((res) => res.json())
      .then((data: { token?: string }) => setExtensionToken(data.token ?? ""))
      .catch(() => {});
  }, []);

  // localStorage isn't available during SSR, so state starts at the defaults
  // (matching what the server rendered) and is synced to the saved values
  // right after mount — the same reason the no-flash script in layout.tsx
  // exists, this just keeps the *highlighted* option in sync too.
  useEffect(() => {
    const savedFont = localStorage.getItem(FONT_STORAGE_KEY) || DEFAULT_FONT_ID;
    const savedAccent = localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT;
    const savedHeaderSize =
      localStorage.getItem(HEADER_SIZE_STORAGE_KEY) || DEFAULT_HEADER_SIZE_ID;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFontId(savedFont);
    setAccent(savedAccent);
    setHexInput(savedAccent);
    setHeaderSizeId(savedHeaderSize);
  }, []);

  async function save() {
    setStatus("saving");
    const body: Record<string, string> = {
      analysisProvider: provider,
      analysisModel,
      ollamaHost,
      ollamaModel,
    };
    if (apiKeyInput.trim()) body.anthropicApiKey = apiKeyInput.trim();

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      const data: SettingsResponse = await res.json();
      setMaskedKey(data.anthropicApiKey);
      setKeySet(data.anthropicApiKeySet);
      setApiKeyInput("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  function flashTokenStatus(next: "copied" | "regenerated" | "error") {
    setTokenStatus(next);
    setTimeout(() => setTokenStatus("idle"), 2000);
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(extensionToken);
      flashTokenStatus("copied");
    } catch {
      flashTokenStatus("error");
    }
  }

  async function regenerateToken() {
    if (!confirm("Generate a new token? The extension will stop working until you paste the new one into it.")) {
      return;
    }
    try {
      const res = await fetch("/api/extension-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExtensionToken(data.token);
      flashTokenStatus("regenerated");
    } catch {
      flashTokenStatus("error");
    }
  }

  function pickFont(id: string) {
    setFontId(id);
    localStorage.setItem(FONT_STORAGE_KEY, id);
    applyTheme(id, accent, headerSizeId);
  }

  function pickAccent(hex: string) {
    if (!isValidHex(hex)) return;
    setAccent(hex);
    setHexInput(hex);
    localStorage.setItem(ACCENT_STORAGE_KEY, hex);
    applyTheme(fontId, hex, headerSizeId);
  }

  function pickHeaderSize(id: string) {
    setHeaderSizeId(id);
    localStorage.setItem(HEADER_SIZE_STORAGE_KEY, id);
    applyTheme(fontId, accent, id);
  }

  function resetDefaults() {
    localStorage.removeItem(FONT_STORAGE_KEY);
    localStorage.removeItem(ACCENT_STORAGE_KEY);
    localStorage.removeItem(HEADER_SIZE_STORAGE_KEY);
    setFontId(DEFAULT_FONT_ID);
    setAccent(DEFAULT_ACCENT);
    setHexInput(DEFAULT_ACCENT);
    setHeaderSizeId(DEFAULT_HEADER_SIZE_ID);
    applyTheme(DEFAULT_FONT_ID, DEFAULT_ACCENT, DEFAULT_HEADER_SIZE_ID);
  }

  const BackLink = (
    <Link
      href="/"
      className="tracked-label mb-6 inline-flex items-center gap-2 text-muted transition-colors duration-150 hover:text-text"
    >
      <span aria-hidden="true">←</span> Library
    </Link>
  );

  if (!loaded) {
    return (
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-12">
        {BackLink}
        <h1 className="page-heading">Settings</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-12">
      {BackLink}
      <h1 className="page-heading">Settings</h1>
      <p className="mt-3 max-w-lg text-muted">
        Analysis provider, local UI preferences, and developer tools. Everything here is
        stored locally on this machine only — never synced or bundled into the app.
      </p>

      <GroupHeading>Settings</GroupHeading>

      <div className="mt-8 flex max-w-[900px] flex-col gap-10">
        <section>
          <p className="tracked-label mb-3 text-dim">Provider</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                { id: "anthropic" as const, label: "Claude (Anthropic API)" },
                { id: "ollama" as const, label: "Ollama (local model)" },
              ]
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setProvider(option.id)}
                className={`flex-1 border px-3 py-2.5 text-left transition-colors duration-150 ${
                  provider === option.id
                    ? "border-accent bg-surface"
                    : "border-border hover:bg-surface"
                }`}
              >
                <span className="text-[14px]">{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        {provider === "anthropic" && (
          <section>
            <p className="tracked-label mb-3 text-dim">Anthropic API Key</p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={keySet ? maskedKey : "sk-ant-..."}
              className="field w-full max-w-md px-2.5 py-1.5"
              autoComplete="off"
            />
            <p className="mt-2 text-[11px] text-dim">
              {keySet
                ? "A key is already saved — leave blank to keep it, or paste a new one to replace it."
                : "No key saved yet. Get one from console.anthropic.com."}
            </p>

            <p className="tracked-label mb-3 mt-6 text-dim">Model</p>
            <input
              type="text"
              value={analysisModel}
              onChange={(e) => setAnalysisModel(e.target.value)}
              className="field w-full max-w-md px-2.5 py-1.5"
            />
          </section>
        )}

        {provider === "ollama" && (
          <section>
            <p className="tracked-label mb-3 text-dim">Ollama Host</p>
            <input
              type="text"
              value={ollamaHost}
              onChange={(e) => setOllamaHost(e.target.value)}
              className="field w-full max-w-md px-2.5 py-1.5"
            />

            <p className="tracked-label mb-3 mt-6 text-dim">Model</p>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              className="field w-full max-w-md px-2.5 py-1.5"
            />
            <p className="mt-2 text-[11px] text-dim">
              Requires Ollama running locally with this model pulled.
            </p>
          </section>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={status === "saving"}
            className="tracked-label border border-accent bg-accent px-4 py-2 text-bg disabled:opacity-50"
          >
            {status === "saving" ? "saving..." : "save"}
          </button>
          {status === "saved" && <span className="tracked-label text-accent">saved</span>}
          {status === "error" && (
            <span className="tracked-label text-red-500">failed to save</span>
          )}
        </div>
      </div>

      <GroupHeading>Chrome Extension</GroupHeading>

      <p className="mt-3 max-w-lg text-muted">
        Copy this token, open the Save to Visual Brain extension&apos;s popup, paste it into
        Visual Brain Token, then click Test Connection. It&apos;s unique to this install.
      </p>

      <section className="mt-8 max-w-[900px]">
        <p className="tracked-label mb-3 text-dim">Extension Token</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="field w-full max-w-md truncate px-2.5 py-1.5 text-[13px]">
            {extensionToken || "…"}
          </code>
          <div className="flex items-center gap-3">
            <button
              onClick={copyToken}
              disabled={!extensionToken}
              className="tracked-label border border-accent bg-accent px-4 py-2 text-bg disabled:opacity-50"
            >
              copy
            </button>
            <button
              onClick={regenerateToken}
              className="tracked-label border border-border px-4 py-2 text-dim transition-colors duration-150 hover:text-text"
            >
              regenerate
            </button>
            {tokenStatus === "copied" && <span className="tracked-label text-accent">copied</span>}
            {tokenStatus === "regenerated" && (
              <span className="tracked-label text-accent">new token — paste it into the extension</span>
            )}
            {tokenStatus === "error" && <span className="tracked-label text-red-500">failed</span>}
          </div>
        </div>
      </section>

      <GroupHeading>Developer</GroupHeading>

      <p className="mt-3 max-w-lg text-muted">
        Local UI preferences — font, accent color, and header size. Saved to this browser
        only, applied instantly across the app.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <section>
            <p className="tracked-label mb-3 text-dim">Font</p>
            <div className="flex flex-col gap-2">
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font.id}
                  onClick={() => pickFont(font.id)}
                  className={`flex items-center justify-between border px-3 py-2.5 text-left transition-colors duration-150 ${
                    fontId === font.id
                      ? "border-accent bg-surface"
                      : "border-border hover:bg-surface"
                  }`}
                >
                  <span style={{ fontFamily: font.value }} className="text-[14px]">
                    {font.label} — Aa 0123
                  </span>
                  {fontId === font.id && (
                    <span className="tracked-label text-accent">active</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="tracked-label mb-3 text-dim">Accent Color</p>
            <div className="flex flex-wrap gap-3">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  onClick={() => pickAccent(preset.hex)}
                  title={preset.name}
                  className={`flex flex-col items-center gap-1.5 border p-1.5 transition-colors duration-150 ${
                    accent.toLowerCase() === preset.hex.toLowerCase()
                      ? "border-accent"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  <span
                    className="block h-8 w-8 border border-border"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span className="tracked-label text-[9px] text-dim">{preset.name}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(hexInput) ? hexInput : DEFAULT_ACCENT}
                onChange={(e) => pickAccent(e.target.value)}
                className="h-9 w-9 cursor-pointer border border-border-strong bg-transparent p-0"
              />
              <input
                type="text"
                value={hexInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setHexInput(value);
                  if (isValidHex(value)) pickAccent(value);
                }}
                placeholder="#custom"
                className="field w-28 px-2 py-1.5"
              />
            </div>
          </section>

          <section>
            <p className="tracked-label mb-3 text-dim">Header Size</p>
            <p className="mb-3 text-[11px] text-dim">
              Controls the &ldquo;Visual Brain&rdquo; heading on the Library page.
            </p>
            <div className="flex flex-col gap-2">
              {HEADER_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => pickHeaderSize(option.id)}
                  className={`flex items-center justify-between border px-3 py-2.5 text-left transition-colors duration-150 ${
                    headerSizeId === option.id
                      ? "border-accent bg-surface"
                      : "border-border hover:bg-surface"
                  }`}
                >
                  <span
                    className="font-bold uppercase"
                    style={{ fontSize: `${14 * option.scale}px` }}
                  >
                    {option.label}
                  </span>
                  {headerSizeId === option.id && (
                    <span className="tracked-label text-accent">active</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <button
            onClick={resetDefaults}
            className="tracked-label self-start border border-border px-4 py-2 text-dim transition-colors duration-150 hover:text-text"
          >
            Reset to defaults
          </button>
        </div>

        <section>
          <p className="tracked-label mb-3 text-dim">Live Preview</p>
          <div className="flex flex-col gap-4 border border-border bg-surface p-5">
            <p className="tracked-label text-dim">Card Title</p>
            <h2 className="card-title">Sample Design Reference</h2>
            <p className="text-muted">
              This preview updates instantly as you change font or accent — no reload
              needed.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["brutalist", "dark mode", "grid"].map((tag) => (
                <span
                  key={tag}
                  className="tracked-label border border-border px-1.5 py-0.5 text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button className="tracked-label border border-accent bg-accent px-4 py-2 text-bg">
                Primary Action
              </button>
              <button className="tracked-label border border-border px-4 py-2 transition-colors duration-150 hover:bg-text hover:text-bg">
                Secondary
              </button>
            </div>
            <div className="field flex items-center gap-2 px-3 py-2">
              <span className="text-dim">/</span>
              <span className="text-dim">search preview...</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
