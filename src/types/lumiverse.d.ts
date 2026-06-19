type LumiverseStorageApi = {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
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
  sendToFrontend(payload: unknown): void;
  onFrontendMessage(handler: (payload: unknown, userId?: string) => void | Promise<void>): void;
  on(event: string, handler: (payload: any) => void | Promise<void>): void;
  log(...args: unknown[]): void;
};

type LumiverseDrawerTabHandle = {
  activate(): void;
};

type LumiverseFloatWidgetHandle = {
  setVisible(visible: boolean): void;
  setPosition?(position: { x: number; y: number }): void;
  onDragEnd?(handler: (position: { x: number; y: number }) => void): void;
};

type LumiverseFrontendContext = {
  ui: {
    registerDrawerTab(options: {
      id: string;
      title: string;
      icon?: string;
      render(root: HTMLElement): void;
    }): LumiverseDrawerTabHandle;
    createFloatWidget(options: {
      id: string;
      title?: string;
      position?: { x: number; y: number };
      render(root: HTMLElement): void;
    }): LumiverseFloatWidgetHandle;
  };
  events: {
    on(event: string, handler: (payload: any) => void | Promise<void>): void;
  };
  dom: {
    addStyle(css: string): void;
  };
  sendToBackend(payload: unknown): void;
  onBackendMessage(handler: (payload: unknown) => void): void;
};
