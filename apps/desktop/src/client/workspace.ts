import { invoke } from "@tauri-apps/api/core";

export const ensureWorkspace = async (slug: string): Promise<string> =>
  invoke<string>("ensure_workspace", { slug });

export const writeNote = async (
  slug: string,
  name: string,
  contents: string,
): Promise<void> => invoke("write_note", { slug, name, contents });

export const readFileInWorkspace = async (
  slug: string,
  relativePath: string,
): Promise<string> => invoke("read_workspace_file", { slug, relativePath });

export const listWorkspaceFiles = async (
  slug: string,
  relativeDir: string,
): Promise<ReadonlyArray<string>> =>
  invoke("list_workspace_files", { slug, relativeDir });
