import type { FrontendSettings } from "../../shared/types/lwe.js";
import { createDefaultFrontendSettings } from "../../shared/schema/settings.js";
import type { JsonStorage, StorageStat } from "./types.js";

type SpindleStorageApi = {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StorageStat>;
  getJson<T>(path: string, options: { fallback: T }): Promise<T>;
  setJson(path: string, value: unknown, options?: { indent?: number }): Promise<void>;
};

type SpindleUserStorageApi = {
  getJson<T>(path: string, options: { fallback: T; userId?: string }): Promise<T>;
  setJson(path: string, value: unknown, options: { indent?: number; userId?: string }): Promise<void>;
};

export function createSpindleStorage(storage: SpindleStorageApi): JsonStorage {
  return {
    read: (path) => storage.read(path),
    write: (path, data) => storage.write(path, data),
    list: (prefix) => storage.list(prefix),
    exists: (path) => storage.exists(path),
    stat: (path) => storage.stat(path),
    getJson: (path, fallback) => storage.getJson(path, { fallback }),
    setJson: (path, value) => storage.setJson(path, value, { indent: 2 })
  };
}

export function createFrontendSettingsRepository(userStorage: SpindleUserStorageApi) {
  const path = "settings/frontend.json";
  return {
    async load(userId?: string): Promise<FrontendSettings> {
      return userStorage.getJson(
        path,
        userId
          ? {
              fallback: createDefaultFrontendSettings(),
              userId
            }
          : {
              fallback: createDefaultFrontendSettings()
            }
      );
    },
    async save(settings: FrontendSettings, userId?: string): Promise<void> {
      await userStorage.setJson(
        path,
        settings,
        userId
          ? {
              indent: 2,
              userId
            }
          : {
              indent: 2
            }
      );
    }
  };
}
