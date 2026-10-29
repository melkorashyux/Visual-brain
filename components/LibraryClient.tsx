"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UNSORTED_FOLDER_NAME, type Folder, type BrainItem } from "@/lib/types";
import { SearchBar } from "@/components/SearchBar";
import { FilterBar } from "@/components/FilterBar";
import { FolderSidebar } from "@/components/FolderSidebar";
import { ItemCard } from "@/components/ItemCard";
import { AnalyzingCard } from "@/components/AnalyzingCard";
import { DetailModal } from "@/components/DetailModal";
import { Lightbox } from "@/components/Lightbox";
import { ExportToast } from "@/components/ExportToast";
import { uploadFiles, type UploadTask } from "@/lib/uploadClient";
import { fetchFolders } from "@/lib/foldersClient";
import { fetchTags } from "@/lib/tagsClient";
import { exportForClaude, type ExportResult } from "@/lib/exportClient";

interface PendingUpload {
  tempId: string;
  previewUrl: string;
  status: "analyzing" | "error";
  message?: string;
}

const VIEW_STORAGE_KEY = "visual-brain-view";

export function LibraryClient({ initialItems }: { initialItems: BrainItem[] }) {
  const [items, setItems] = useState<BrainItem[]>(initialItems);
  const [folders, setFolders] = useState<Folder[]>([]);
  // The registry of all known tags (seeded + user-added) — the single source
  // of truth shared with the Ollama/Claude prompt, independent of which tags
  // happen to be in use on current items.
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [view, setView] = useState<"detail" | "grid">("detail");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<BrainItem | null>(null);
  const [lightboxItem, setLightboxItem] = useState<BrainItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFolderTarget, setBulkFolderTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteState, setBulkDeleteState] = useState<"idle" | "pending" | "confirm">("idle");
  const [bulkDeleteLabel, setBulkDeleteLabel] = useState("delete");
  const bulkDeleteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reloadFolders = useCallback(() => {
    fetchFolders()
      .then(setFolders)
      .catch(() => {});
  }, []);

  const reloadTags = useCallback(() => {
    fetchTags()
      .then(setKnownTags)
      .catch(() => {});
  }, []);

  const reloadItems = useCallback(() => {
    fetch("/api/items")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { items: BrainItem[] }) => setItems(data.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    reloadFolders();
    reloadTags();
  }, [reloadFolders, reloadTags]);

  // localStorage isn't available during SSR, so state starts at "detail"
  // (matching what the server rendered) and is synced to the saved value
  // right after mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "detail") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(stored);
    }
  }, []);

  const pickView = useCallback((next: "detail" | "grid") => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }, []);

  // Items saved from elsewhere — the Chrome extension, another tab, another
  // window — land via a separate request this tab never sees, so an
  // already-open Library tab goes stale. Catch up immediately whenever the
  // tab regains visibility/focus, and poll while it's visible so items saved
  // from a window that never lost focus (e.g. a second monitor) still show
  // up on their own.
  const hasPending = useMemo(
    () => items.some((item) => item.analysis_status === "pending"),
    [items],
  );

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      reloadItems();
      reloadFolders();
      reloadTags();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    // While something is still analyzing (e.g. a Chrome extension save
    // that just landed), poll more often so its card flips from
    // "Analyzing…" to real data quickly instead of sitting for 5s.
    const intervalId = window.setInterval(
      () => {
        if (document.visibilityState === "visible") reloadItems();
      },
      hasPending ? 1500 : 5000,
    );

    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, [reloadItems, reloadFolders, reloadTags, hasPending]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );

  // `knownTags` (the full registry, alphabetical) is the source of truth for
  // which tags exist; sort that by current usage so the most-relevant tags
  // still surface first in the filter bar, same UX as before.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...knownTags].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [items, knownTags]);

  const libraryEmpty = items.length === 0 && pending.length === 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeFolderId && item.folder_id !== activeFolderId) return false;
      if (activeCategory && item.category !== activeCategory) return false;
      if (activeTags.length > 0 && !activeTags.every((t) => item.tags.includes(t))) return false;
      if (!q) return true;
      const haystack = [item.title, item.description, item.design_notes, ...item.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, activeCategory, activeTags, activeFolderId]);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // Any change to the selection invalidates a pending/animating "confirm
  // delete" — safer than letting a stale confirm apply to a different set
  // of items, and avoids a scramble animation finishing against a count
  // that's no longer accurate.
  const resetBulkDelete = useCallback(() => {
    if (bulkDeleteTimerRef.current) clearInterval(bulkDeleteTimerRef.current);
    setBulkDeleteState("idle");
    setBulkDeleteLabel("delete");
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
    resetBulkDelete();
  }, [resetBulkDelete]);

  const toggleSelected = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      resetBulkDelete();
    },
    [resetBulkDelete],
  );

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filtered.map((i) => i.id)));
    resetBulkDelete();
  }, [filtered, resetBulkDelete]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    resetBulkDelete();
  }, [resetBulkDelete]);

  // Clears the scramble interval if the component unmounts mid-animation.
  useEffect(() => {
    return () => {
      if (bulkDeleteTimerRef.current) clearInterval(bulkDeleteTimerRef.current);
    };
  }, []);

  // Applies a per-item PATCH to every selected item and merges the results
  // back into local state. Selection is left intact afterward so category,
  // tags, and folder can all be assigned in one pass over the same batch.
  const bulkPatch = useCallback(
    async (ids: string[], buildPayload: (item: BrainItem) => Record<string, unknown>) => {
      const targets = items.filter((i) => ids.includes(i.id));
      const results = await Promise.all(
        targets.map(async (item) => {
          const res = await fetch(`/api/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(item)),
          });
          if (!res.ok) return null;
          const { item: updated } = await res.json();
          return updated as BrainItem;
        }),
      );
      setItems((prev) => prev.map((item) => results.find((r) => r?.id === item.id) ?? item));
    },
    [items],
  );

  async function runBulkMove() {
    if (!bulkFolderTarget || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await bulkPatch(Array.from(selectedIds), () => ({ folder_id: bulkFolderTarget }));
      reloadFolders();
      setBulkFolderTarget("");
    } finally {
      setBulkBusy(false);
    }
  }

  const BULK_SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const BULK_DELETE_HOLD_MS = 2000;

  // Same scramble-decode hold as the detail modal's delete button: the label
  // dissolves into random characters and re-locks into "confirm delete (N)"
  // over two seconds before the second click can actually delete anything.
  function startBulkDeleteHold() {
    setBulkDeleteState("pending");
    const target = `confirm delete (${selectedIds.size})`;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion) {
      const start = performance.now();
      bulkDeleteTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - start;
        const lockedCount = Math.floor((elapsed / BULK_DELETE_HOLD_MS) * target.length);
        let out = "";
        for (let i = 0; i < target.length; i++) {
          out +=
            i < lockedCount || target[i] === " "
              ? target[i]
              : BULK_SCRAMBLE_CHARS[Math.floor(Math.random() * BULK_SCRAMBLE_CHARS.length)].toLowerCase();
        }
        setBulkDeleteLabel(out);
      }, 40);
    }

    setTimeout(() => {
      if (bulkDeleteTimerRef.current) clearInterval(bulkDeleteTimerRef.current);
      setBulkDeleteLabel(target);
      setBulkDeleteState("confirm");
    }, BULK_DELETE_HOLD_MS);
  }

  async function runBulkDelete() {
    if (selectedIds.size === 0) return;
    if (bulkDeleteState === "idle") {
      startBulkDeleteHold();
      return;
    }
    if (bulkDeleteState === "pending") return;

    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => fetch(`/api/items/${id}`, { method: "DELETE" })));
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      setSelectedIds(new Set());
      resetBulkDelete();
      reloadFolders();
    } finally {
      setBulkBusy(false);
    }
  }

  async function runExport(ids: string[]) {
    if (ids.length === 0) return;
    setExportError(null);
    try {
      const result = await exportForClaude(ids);
      setExportResult(result);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    }
  }

  function handleExportFolder(folderId: string) {
    runExport(items.filter((i) => i.folder_id === folderId).map((i) => i.id));
  }

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const tasks: UploadTask[] = imageFiles.map((file) => ({ file }));
      const tempIds = imageFiles.map(() => crypto.randomUUID());

      setPending((prev) => [
        ...imageFiles.map((file, i) => ({
          tempId: tempIds[i],
          previewUrl: URL.createObjectURL(file),
          status: "analyzing" as const,
        })),
        ...prev,
      ]);

      uploadFiles(tasks, {
        onDone: (_task, index, item) => {
          setPending((prev) => prev.filter((p) => p.tempId !== tempIds[index]));
          setItems((prev) => [item, ...prev]);
          reloadFolders();
        },
        onError: (_task, index, message) => {
          setPending((prev) =>
            prev.map((p) =>
              p.tempId === tempIds[index] ? { ...p, status: "error", message } : p,
            ),
          );
        },
      });
    },
    [reloadFolders],
  );

  return (
    <main
      className="w-full flex-1 px-6 py-12"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <h1 className="hero-heading">
        Visual Brain
      </h1>

      <div className="mt-10 flex flex-col gap-8 sm:flex-row">
        <FolderSidebar
          folders={folders}
          activeFolderId={activeFolderId}
          onFolderChange={setActiveFolderId}
          onFoldersChanged={reloadFolders}
          onExportFolder={handleExportFolder}
        />

        <div className="min-w-0 flex-1">
          {libraryEmpty ? (
            // Nothing to search or filter yet, so only the drop zone shows.
            <div
              className={`flex flex-col items-center justify-center gap-4 border border-dashed py-24 text-center transition-colors duration-150 ${
                dragOver ? "border-accent" : "border-border-strong"
              }`}
            >
              <p className="tracked-label text-dim">Your library is empty</p>
              <p className="max-w-xs text-muted">
                Drop screenshots here, or right-click any image on the web with the Chrome
                extension.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="tracked-label mt-2 border border-accent bg-accent px-4 py-2 text-bg"
              >
                + Add Screenshots
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6">
                <SearchBar value={search} onChange={setSearch} />
                <FilterBar
                  categories={categories}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  tags={tags}
                  activeTags={activeTags}
                  onTagToggle={toggleTag}
                />
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <p className="tracked-label text-dim">
                    {filtered.length} item{filtered.length === 1 ? "" : "s"}
                  </p>
                  {selectMode && (
                    <>
                      <button
                        onClick={selectAllFiltered}
                        className="tracked-label text-muted hover:text-text"
                      >
                        select all
                      </button>
                      {selectedIds.size > 0 && (
                        <button
                          onClick={clearSelection}
                          className="tracked-label text-muted hover:text-text"
                        >
                          clear ({selectedIds.size})
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!selectMode && (
                    <div className="flex border border-border">
                      <button
                        onClick={() => pickView("detail")}
                        className={`tracked-label border-r border-border bg-surface px-3 py-1.5 transition-colors duration-150 ${
                          view === "detail"
                            ? "text-accent"
                            : "text-muted hover:text-text"
                        }`}
                      >
                        detail
                      </button>
                      <button
                        onClick={() => pickView("grid")}
                        className={`tracked-label bg-surface px-3 py-1.5 transition-colors duration-150 ${
                          view === "grid"
                            ? "text-accent"
                            : "text-muted hover:text-text"
                        }`}
                      >
                        grid
                      </button>
                    </div>
                  )}
                  <button
                    onClick={toggleSelectMode}
                    className={`tracked-label border px-3 py-1.5 transition-colors duration-150 ${
                      selectMode
                        ? "border-accent text-accent"
                        : "border-border text-muted hover:text-text"
                    }`}
                  >
                    {selectMode ? "cancel" : "select"}
                  </button>
                  {!selectMode && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="tracked-label border border-accent bg-accent px-3 py-1.5 text-bg"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>

              {selectMode && selectedIds.size > 0 && (
                <div className="mt-4 flex flex-col gap-3 border border-accent bg-surface px-4 py-3">
                  <p className="tracked-label text-accent">{selectedIds.size} selected</p>

                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={bulkFolderTarget}
                          onChange={(e) => setBulkFolderTarget(e.target.value)}
                          disabled={bulkBusy}
                          className="field px-2 py-1"
                        >
                          <option value="">move to…</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name === UNSORTED_FOLDER_NAME ? "Unsorted" : folder.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={runBulkMove}
                          disabled={!bulkFolderTarget || bulkBusy}
                          className="tracked-label border border-accent bg-accent px-3 py-1.5 text-bg disabled:opacity-50"
                        >
                          {bulkBusy ? "…" : "move"}
                        </button>
                      </div>

                      <button
                        onClick={() => runExport(Array.from(selectedIds))}
                        className="tracked-label border border-border px-3 py-1.5 transition-colors duration-150 hover:bg-text hover:text-bg"
                      >
                        export for claude
                      </button>
                    </div>

                    <button
                      onClick={runBulkDelete}
                      disabled={bulkDeleteState === "pending" || bulkBusy}
                      className={`tracked-label border px-3 py-1.5 transition-colors duration-150 disabled:cursor-default disabled:opacity-50 ${
                        bulkDeleteState === "idle"
                          ? "border-border text-dim hover:border-red-500 hover:text-red-500"
                          : bulkDeleteState === "confirm"
                            ? "border-red-500 text-red-500 hover:border-red-700 hover:text-red-700"
                            : "border-red-500 text-red-500"
                      }`}
                    >
                      {bulkBusy ? "…" : bulkDeleteState === "idle" ? "delete" : bulkDeleteLabel}
                    </button>
                  </div>
                  {exportError && <p className="text-[11px] text-accent">{exportError}</p>}
                </div>
              )}

              <div
                className={`mt-4 grid ${
                  view === "grid"
                    ? "grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8"
                    : "grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
                } ${dragOver ? "outline outline-1 outline-dashed outline-accent" : ""}`}
              >
                {pending.map((p) => (
                  <AnalyzingCard key={p.tempId} previewUrl={p.previewUrl} status={p.status} />
                ))}
                {filtered.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    view={view}
                    onClick={() => setSelected(item)}
                    onExpand={() => setLightboxItem(item)}
                    selectMode={selectMode}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelected(item.id)}
                  />
                ))}
              </div>

              {filtered.length === 0 && pending.length === 0 && (
                <p className="mt-16 text-center text-muted">No items match your filters.</p>
              )}
            </>
          )}
        </div>
      </div>

      {selected && (
        <DetailModal
          key={selected.id}
          item={selected}
          folders={folders}
          tags={knownTags}
          onTagsChanged={setKnownTags}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            setSelected(updated);
            reloadFolders();
          }}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((i) => i.id !== id));
            setSelected(null);
            reloadFolders();
          }}
        />
      )}

      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}

      {exportResult && (
        <ExportToast
          path={exportResult.exportDir}
          count={exportResult.fileCount}
          onDismiss={() => setExportResult(null)}
        />
      )}
    </main>
  );
}
