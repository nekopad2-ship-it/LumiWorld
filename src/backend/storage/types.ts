export type StorageStat = {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
};

export type JsonStorage = {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StorageStat>;
  getJson<T>(path: string, fallback: T): Promise<T>;
  setJson(path: string, value: unknown): Promise<void>;
};
