import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  rowToItem,
  SEED_TAGS,
  UNSORTED_FOLDER_NAME,
  type AnalysisStatus,
  type Folder,
  type BrainItem,
  type BrainItemRow,
} from "@/lib/types";
import { migrateTaxonomy } from "@/lib/taxonomyMigration";
import { DATA_DIR, UPLOADS_DIR } from "@/lib/paths";

const DB_PATH = path.join(DATA_DIR, "visual-brain.db");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

declare global {
  var __brainDb: Database.Database | undefined;
  var __unsortedFolderId: string | undefined;
}

function createConnection() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      design_notes TEXT NOT NULL DEFAULT '',
      colors TEXT NOT NULL DEFAULT '[]',
      typography TEXT NOT NULL DEFAULT '',
      layout TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      folder_id TEXT,
      analysis_status TEXT NOT NULL DEFAULT 'complete',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateAddFolderIdColumn(db);
  migrateAddAnalysisStatusColumn(db);

  const unsortedId = ensureUnsortedFolder(db);
  db.prepare("UPDATE items SET folder_id = ? WHERE folder_id IS NULL").run(unsortedId);

  removeSampleItems(db);
  seedTagsIfEmpty(db);
  migrateTaxonomy(db);

  return db;
}

/** Older databases created before folders existed won't have this column. */
function migrateAddFolderIdColumn(db: Database.Database) {
  const columns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "folder_id")) {
    db.exec("ALTER TABLE items ADD COLUMN folder_id TEXT");
  }
}

/** Older databases created before background analysis existed won't have this column. */
function migrateAddAnalysisStatusColumn(db: Database.Database) {
  const columns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "analysis_status")) {
    db.exec("ALTER TABLE items ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'complete'");
  }
}

function ensureUnsortedFolder(db: Database.Database): string {
  const existing = db
    .prepare("SELECT id FROM folders WHERE name = ?")
    .get(UNSORTED_FOLDER_NAME) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = randomUUID();
  db.prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)").run(
    id,
    UNSORTED_FOLDER_NAME,
    new Date().toISOString(),
  );
  return id;
}

// Older versions filled a new library with three sample items backed by
// bundled "__placeholder-N.svg" files. A new library now starts empty;
// this clears those samples out of libraries created before that.
function removeSampleItems(db: Database.Database) {
  const samples = db
    .prepare("SELECT filename FROM items WHERE filename LIKE '__placeholder-%'")
    .all() as { filename: string }[];
  if (samples.length === 0) return;

  db.prepare("DELETE FROM items WHERE filename LIKE '__placeholder-%'").run();
  for (const { filename } of samples) {
    fs.rm(path.join(UPLOADS_DIR, filename), { force: true }, () => {});
  }
}

function seedTagsIfEmpty(db: Database.Database) {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM tags").get() as { count: number };
  if (count > 0) return;

  const insert = db.prepare("INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)");
  const insertAll = db.transaction((names: readonly string[]) => {
    const now = new Date().toISOString();
    for (const name of names) insert.run(name, now);
  });
  insertAll(SEED_TAGS);
}

export function getDb(): Database.Database {
  if (!globalThis.__brainDb) {
    globalThis.__brainDb = createConnection();
  }
  return globalThis.__brainDb;
}

export function getUnsortedFolderId(): string {
  if (!globalThis.__unsortedFolderId) {
    globalThis.__unsortedFolderId = ensureUnsortedFolder(getDb());
  }
  return globalThis.__unsortedFolderId;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export function listFolders(): Folder[] {
  return getDb()
    .prepare(
      `SELECT f.id, f.name, f.created_at, COUNT(i.id) as item_count
       FROM folders f
       LEFT JOIN items i ON i.folder_id = f.id
       GROUP BY f.id
       ORDER BY CASE WHEN f.name = ? THEN 0 ELSE 1 END, f.name COLLATE NOCASE ASC`,
    )
    .all(UNSORTED_FOLDER_NAME) as Folder[];
}

export function getFolder(id: string): Folder | null {
  const row = getDb()
    .prepare(
      `SELECT f.id, f.name, f.created_at, COUNT(i.id) as item_count
       FROM folders f LEFT JOIN items i ON i.folder_id = f.id
       WHERE f.id = ?
       GROUP BY f.id`,
    )
    .get(id) as Folder | undefined;
  return row ?? null;
}

export class DuplicateFolderError extends Error {}
export class ProtectedFolderError extends Error {}

export function createFolder(name: string): Folder {
  const trimmed = name.trim();
  const existing = getDb()
    .prepare("SELECT id FROM folders WHERE name = ? COLLATE NOCASE")
    .get(trimmed) as { id: string } | undefined;
  if (existing) throw new DuplicateFolderError(`Folder "${trimmed}" already exists`);

  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)")
    .run(id, trimmed, new Date().toISOString());
  return getFolder(id)!;
}

export function renameFolder(id: string, name: string): Folder | null {
  const folder = getFolder(id);
  if (!folder) return null;
  if (folder.name === UNSORTED_FOLDER_NAME) {
    throw new ProtectedFolderError("The Unsorted folder can't be renamed");
  }

  const trimmed = name.trim();
  const existing = getDb()
    .prepare("SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND id != ?")
    .get(trimmed, id) as { id: string } | undefined;
  if (existing) throw new DuplicateFolderError(`Folder "${trimmed}" already exists`);

  getDb().prepare("UPDATE folders SET name = ? WHERE id = ?").run(trimmed, id);
  return getFolder(id);
}

export function deleteFolder(id: string): boolean {
  const folder = getFolder(id);
  if (!folder) return false;
  if (folder.name === UNSORTED_FOLDER_NAME) {
    throw new ProtectedFolderError("The Unsorted folder can't be deleted");
  }

  const unsortedId = getUnsortedFolderId();
  const db = getDb();
  const moveAndDelete = db.transaction(() => {
    db.prepare("UPDATE items SET folder_id = ? WHERE folder_id = ?").run(unsortedId, id);
    db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  });
  moveAndDelete();
  return true;
}

// ---------------------------------------------------------------------------
// Tags — the single source of truth for both the UI and the analysis prompt.
// Seeded once from SEED_TAGS; users can add more, and every addition here is
// what makes a tag selectable by the model on future items.
// ---------------------------------------------------------------------------

export function listTags(): string[] {
  return (
    getDb().prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

/** Insert-or-ignore for each name; returns the full, updated tag list. */
export function addTags(names: string[]): string[] {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length > 0) {
    const insert = getDb().prepare("INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)");
    const insertAll = getDb().transaction((values: string[]) => {
      const now = new Date().toISOString();
      for (const name of values) insert.run(name, now);
    });
    insertAll(trimmed);
  }
  return listTags();
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function listItems(): BrainItem[] {
  const rows = getDb()
    .prepare("SELECT * FROM items ORDER BY created_at DESC")
    .all() as BrainItemRow[];
  return rows.map(rowToItem);
}

export function getItem(id: string): BrainItem | null {
  const row = getDb().prepare("SELECT * FROM items WHERE id = ?").get(id) as
    | BrainItemRow
    | undefined;
  return row ? rowToItem(row) : null;
}

export interface CreateItemInput {
  filename: string;
  title: string;
  category: string;
  tags: string[];
  description: string;
  design_notes: string;
  colors: string[];
  typography: string;
  layout: string;
  source_url?: string | null;
  folder_id?: string | null;
  analysis_status?: AnalysisStatus;
}

export function createItem(input: CreateItemInput): BrainItem {
  const id = randomUUID();
  const created_at = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO items (id, filename, title, category, tags, description, design_notes, colors, typography, layout, source_url, folder_id, analysis_status, created_at)
       VALUES (@id, @filename, @title, @category, @tags, @description, @design_notes, @colors, @typography, @layout, @source_url, @folder_id, @analysis_status, @created_at)`,
    )
    .run({
      id,
      filename: input.filename,
      title: input.title,
      category: input.category,
      tags: JSON.stringify(input.tags ?? []),
      description: input.description ?? "",
      design_notes: input.design_notes ?? "",
      colors: JSON.stringify(input.colors ?? []),
      typography: input.typography ?? "",
      layout: input.layout ?? "",
      source_url: input.source_url ?? null,
      folder_id: input.folder_id ?? getUnsortedFolderId(),
      analysis_status: input.analysis_status ?? "complete",
      created_at,
    });

  return getItem(id)!;
}

export type UpdateItemInput = Partial<
  Omit<CreateItemInput, "filename"> & { source_url: string | null; folder_id: string | null }
>;

export function updateItem(id: string, input: UpdateItemInput): BrainItem | null {
  const existing = getItem(id);
  if (!existing) return null;

  const next = {
    title: input.title ?? existing.title,
    category: input.category ?? existing.category,
    tags: input.tags ?? existing.tags,
    description: input.description ?? existing.description,
    design_notes: input.design_notes ?? existing.design_notes,
    colors: input.colors ?? existing.colors,
    typography: input.typography ?? existing.typography,
    layout: input.layout ?? existing.layout,
    source_url: input.source_url === undefined ? existing.source_url : input.source_url,
    folder_id:
      input.folder_id === undefined
        ? existing.folder_id
        : (input.folder_id ?? getUnsortedFolderId()),
    analysis_status: input.analysis_status ?? existing.analysis_status,
  };

  getDb()
    .prepare(
      `UPDATE items SET title=@title, category=@category, tags=@tags, description=@description,
       design_notes=@design_notes, colors=@colors, typography=@typography, layout=@layout,
       source_url=@source_url, folder_id=@folder_id, analysis_status=@analysis_status
       WHERE id=@id`,
    )
    .run({
      id,
      ...next,
      tags: JSON.stringify(next.tags),
      colors: JSON.stringify(next.colors),
    });

  return getItem(id);
}

export function deleteItem(id: string): boolean {
  const item = getItem(id);
  if (!item) return false;

  getDb().prepare("DELETE FROM items WHERE id = ?").run(id);

  fs.rm(path.join(UPLOADS_DIR, item.filename), { force: true }, () => {});

  return true;
}
