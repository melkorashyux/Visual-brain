"use client";

import { useEffect, useRef, useState } from "react";
import type { Folder } from "@/lib/types";
import { UNSORTED_FOLDER_NAME } from "@/lib/types";
import { createFolderApi, deleteFolderApi, renameFolderApi } from "@/lib/foldersClient";

export function FolderSidebar({
  folders,
  activeFolderId,
  onFolderChange,
  onFoldersChanged,
  onExportFolder,
}: {
  folders: Folder[];
  activeFolderId: string | null;
  onFolderChange: (id: string | null) => void;
  onFoldersChanged: () => void;
  onExportFolder: (folderId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitCreate() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    try {
      await createFolderApi(name);
      setNewName("");
      setCreating(false);
      setError(null);
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create folder");
    }
  }

  async function submitRename(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    try {
      await renameFolderApi(id, name);
      setError(null);
      setRenamingId(null);
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename folder");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFolderApi(id);
      if (activeFolderId === id) onFolderChange(null);
      onFoldersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete folder");
    }
  }

  const totalCount = folders.reduce((sum, f) => sum + f.item_count, 0);

  return (
    <aside className="w-full shrink-0 sm:w-48">
      <p className="tracked-label mb-3 text-dim">Folders</p>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onFolderChange(null)}
            className={`flex min-w-0 flex-1 items-center justify-between px-2 py-1.5 text-left transition-colors duration-150 ${
              activeFolderId === null ? "bg-surface text-accent" : "text-muted hover:text-text"
            }`}
          >
            <span className="truncate">All</span>
            <span className="text-dim">{totalCount}</span>
          </button>
          {/* Matches FolderMenu's trigger width so every row's count lands in the same column. */}
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        </div>

        {folders.map((folder) => (
          <div key={folder.id} className="group flex items-center gap-1">
            {renamingId === folder.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => submitRename(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename(folder.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="field w-full px-2 py-1.5"
              />
            ) : (
              <>
                <button
                  onClick={() => onFolderChange(folder.id)}
                  className={`flex min-w-0 flex-1 items-center justify-between px-2 py-1.5 text-left transition-colors duration-150 ${
                    activeFolderId === folder.id
                      ? "bg-surface text-accent"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <span className="truncate">{folder.name}</span>
                  <span className="text-dim">{folder.item_count}</span>
                </button>
                <FolderMenu
                  folder={folder}
                  onRename={() => {
                    setRenamingId(folder.id);
                    setRenameValue(folder.name);
                  }}
                  onExport={() => onExportFolder(folder.id)}
                  onDelete={() => handleDelete(folder.id)}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={submitCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCreate();
            if (e.key === "Escape") setCreating(false);
          }}
          placeholder="folder name"
          className="field mt-2 w-full px-2 py-1.5"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="tracked-label mt-2 px-2 py-1.5 text-dim hover:text-text"
        >
          + New Folder
        </button>
      )}

      {error && <p className="mt-2 px-2 text-[11px] text-accent">{error}</p>}
    </aside>
  );
}

function FolderMenu({
  folder,
  onRename,
  onExport,
  onDelete,
}: {
  folder: Folder;
  onRename: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [deleteState, setDeleteState] = useState<"idle" | "pending" | "confirm">("idle");
  const [deleteLabel, setDeleteLabel] = useState("delete");
  const deleteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetDelete() {
    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    setDeleteState("idle");
    setDeleteLabel("delete");
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        resetDelete();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        resetDelete();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    };
  }, []);

  const canManage = folder.name !== UNSORTED_FOLDER_NAME;
  const canExport = folder.item_count > 0;

  if (!canManage && !canExport) {
    // Nothing to do for this folder — keep the reserved width so counts still align.
    return <span className="h-6 w-6 shrink-0" aria-hidden="true" />;
  }

  // Same scramble-decode hold as the detail modal's delete button: the label
  // dissolves into random characters and re-locks into "confirm delete" in
  // red over two seconds before the second click can actually delete anything.
  const CONFIRM_LABEL = "confirm delete";
  const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DELETE_HOLD_MS = 2000;

  function startDeleteHold() {
    setDeleteState("pending");

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion) {
      const start = performance.now();
      deleteTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - start;
        const lockedCount = Math.floor((elapsed / DELETE_HOLD_MS) * CONFIRM_LABEL.length);
        let out = "";
        for (let i = 0; i < CONFIRM_LABEL.length; i++) {
          out +=
            i < lockedCount || CONFIRM_LABEL[i] === " "
              ? CONFIRM_LABEL[i]
              : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)].toLowerCase();
        }
        setDeleteLabel(out);
      }, 40);
    }

    setTimeout(() => {
      if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
      setDeleteLabel(CONFIRM_LABEL);
      setDeleteState("confirm");
    }, DELETE_HOLD_MS);
  }

  function handleDeleteClick() {
    if (deleteState === "idle") {
      startDeleteHold();
      return;
    }
    if (deleteState === "pending") return;
    setOpen(false);
    resetDelete();
    onDelete();
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Folder actions"
        aria-label="Folder actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-6 w-6 items-center justify-center text-dim opacity-0 transition-opacity duration-150 hover:text-accent group-hover:opacity-100 group-focus-within:opacity-100 aria-expanded:opacity-100 aria-expanded:text-accent"
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[168px] border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
        >
          {canExport && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport();
              }}
              className="tracked-label block w-full px-3 py-2 text-left text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text"
            >
              export for claude
            </button>
          )}
          {canManage && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              className="tracked-label block w-full px-3 py-2 text-left text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text"
            >
              rename
            </button>
          )}
          {canManage && (
            <button
              role="menuitem"
              onClick={handleDeleteClick}
              disabled={deleteState === "pending"}
              className={`tracked-label block w-full px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-hover disabled:cursor-default ${
                deleteState === "idle"
                  ? "text-muted hover:text-red-500"
                  : deleteState === "confirm"
                    ? "text-red-500 hover:text-red-700"
                    : "text-red-500"
              }`}
            >
              {deleteState === "idle" ? "delete" : deleteLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
