type LumiverseStorageApi = {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  getJson<T>(path: string, options?: { fallback?: T; userId?: string }): Promise<T>;
  setJson(path: string, value: unknown, options?: { indent?: number; userId?: string }): Promise<void>;
};

type LumiverseCharacterRecord = {
  id?: string;
  name?: string;
  description?: string;
  scenario?: string;
};

type LumiverseChatRecord = {
  id?: string;
  name?: string;
  character_id?: string;
  characterId?: string;
  scenario?: string;
};

type LumiverseMessageRecord = {
  id: string;
  role: string;
  content: string;
};

declare const spindle: {
  permissions: {
    has(permission: string): boolean;
  };
  storage: LumiverseStorageApi;
  userStorage: LumiverseStorageApi;
  variables: {
    chat: {
      set(chatId: string, key: string, value: string): Promise<void>;
    };
  };
  characters: {
    get(characterId: string): Promise<LumiverseCharacterRecord | null>;
  };
  chats: {
    get(chatId: string): Promise<LumiverseChatRecord | null>;
    getActive(): Promise<LumiverseChatRecord | null>;
  };
  chat: {
    getMessages(chatId: string): Promise<LumiverseMessageRecord[]>;
    updateMessage(
      chatId: string,
      messageId: string,
      patch: { content: string; skipChunkRebuild?: boolean },
    ): Promise<void>;
  };
  toast?: {
    error(message: string): void;
    warning?(message: string): void;
    info?(message: string): void;
    success?(message: string): void;
  };
  sendToFrontend(payload: unknown, userId?: string): void;
  onFrontendMessage(handler: (payload: unknown, userId?: string) => void | Promise<void>): () => void;
  on(event: string, handler: (payload: any) => void | Promise<void>): void;
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
};

type LumiverseDrawerTabHandle = {
  root: HTMLElement;
  activate(): void;
  destroy(): void;
};

type LumiverseFloatWidgetHandle = {
  root: HTMLElement;
  setVisible(visible: boolean): void;
  moveTo(x: number, y: number): void;
  getPosition(): { x: number; y: number };
  isVisible(): boolean;
  destroy(): void;
  onDragEnd(handler: (position: { x: number; y: number }) => void): () => void;
};

type LumiverseFrontendContext = {
  ui: {
    registerDrawerTab(options: {
      id: string;
      title: string;
      shortName?: string;
      description?: string;
      headerTitle?: string;
      iconSvg?: string;
      iconUrl?: string;
    }): LumiverseDrawerTabHandle;
    createFloatWidget(options: {
      width: number;
      height: number;
      initialPosition?: { x: number; y: number };
      snapToEdge?: boolean;
      tooltip?: string;
      chromeless?: boolean;
    }): LumiverseFloatWidgetHandle;
  };
  events: {
    on(event: string, handler: (payload: any) => void | Promise<void>): () => void;
  };
  dom: {
    addStyle(css: string): () => void;
    cleanup(): void;
  };
  sendToBackend(payload: unknown): void;
  onBackendMessage(handler: (payload: unknown) => void): () => void;
};
