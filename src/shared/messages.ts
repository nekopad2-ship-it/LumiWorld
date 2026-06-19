import type { WorldGraph, WorldSummary } from "./types";

export type UiSettings = {
  widgetPosition: {
    x: number;
    y: number;
  };
  widgetVisible: boolean;
};

export type PermissionSnapshot = {
  generation: boolean;
  characters: boolean;
  chats: boolean;
  chatMutation: boolean;
  uiPanels: boolean;
};

export type BackendToFrontendMessage =
  | {
      type: "WORLD_UPDATED";
      chatId: string;
      summary: WorldSummary;
    }
  | {
      type: "WORLD_GRAPH_DATA";
      chatId: string | null;
      graph: WorldGraph | null;
      summary: WorldSummary;
      permissions: PermissionSnapshot;
      ui: UiSettings;
    }
  | {
      type: "OPEN_TRACKER";
    };

export type FrontendToBackendMessage =
  | {
      type: "GET_WORLD_GRAPH";
      chatId?: string;
    }
  | {
      type: "SAVE_UI_SETTINGS";
      ui: Partial<UiSettings>;
    }
  | {
      type: "OPEN_TRACKER";
    };

export function isFrontendToBackendMessage(value: unknown): value is FrontendToBackendMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}
