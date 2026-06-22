import type { JsonStorage, StorageStat } from "./types.js";

export function createInMemoryStorage(): JsonStorage {
  const files = new Map<string, string>();
  const modified = new Map<string, string>();

  function touch(path: string): void {
    modified.set(path, new Date().toISOString());
  }

  return {
    read(path) {
      const value = files.get(path);
      if (typeof value !== "string") {
        throw new Error(`Missing file: ${path}`);
      }
      return Promise.resolve(value);
    },
    write(path, data) {
      files.set(path, data);
      touch(path);
      return Promise.resolve();
    },
    list(prefix) {
      const paths = [...files.keys()].sort();
      if (!prefix) {
        return Promise.resolve(paths);
      }
      return Promise.resolve(paths.filter((path) => path.startsWith(prefix)));
    },
    exists(path) {
      return Promise.resolve(files.has(path));
    },
    stat(path) {
      const value = files.get(path);
      const timestamp = modified.get(path) ?? new Date().toISOString();
      const result: StorageStat = {
        exists: typeof value === "string",
        isFile: typeof value === "string",
        isDirectory: false,
        sizeBytes: value?.length ?? 0,
        modifiedAt: timestamp
      };
      return Promise.resolve(result);
    },
    getJson(path, fallback) {
      const raw = files.get(path);
      if (typeof raw !== "string") {
        return Promise.resolve(fallback);
      }
      return Promise.resolve(JSON.parse(raw) as typeof fallback);
    },
    setJson(path, value) {
      files.set(path, JSON.stringify(value, null, 2));
      touch(path);
      return Promise.resolve();
    }
  };
}
