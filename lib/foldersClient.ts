import type { Folder } from "@/lib/types";

async function unwrap<T>(res: Response, key: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body[key] as T;
}

export async function fetchFolders(): Promise<Folder[]> {
  const res = await fetch("/api/folders");
  return unwrap<Folder[]>(res, "folders");
}

export async function createFolderApi(name: string): Promise<Folder> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return unwrap<Folder>(res, "folder");
}

export async function renameFolderApi(id: string, name: string): Promise<Folder> {
  const res = await fetch(`/api/folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return unwrap<Folder>(res, "folder");
}

export async function deleteFolderApi(id: string): Promise<void> {
  const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
}
