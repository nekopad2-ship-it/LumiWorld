import type { BackendToFrontendMessage, FrontendToBackendMessage, PermissionSnapshot, UiSettings } from "./shared/messages";
import type { WorldGraph, WorldSummary } from "./shared/types";

type FrontendState = {
  graph: WorldGraph | null;
  summary: WorldSummary;
  permissions: PermissionSnapshot;
  ui: UiSettings;
  currentView: "people" | "relationships";
};

const defaultState: FrontendState = {
  graph: null,
  summary: {
    hasWorld: false,
    activeCast: [],
    hotAlerts: [],
    npcCount: 0,
    relationshipCount: 0,
  },
  permissions: {
    generation: false,
    characters: false,
    chats: false,
    chatMutation: false,
    uiPanels: false,
  },
  ui: {
    widgetPosition: { x: 24, y: 24 },
    widgetVisible: true,
  },
  currentView: "people",
};

export function setup(ctx: LumiverseFrontendContext): void {
  const state: FrontendState = structuredClone(defaultState);
  let drawerRoot: HTMLElement | null = null;
  let widgetRoot: HTMLElement | null = null;
  let widget: LumiverseFloatWidgetHandle | null = null;

  ctx.dom.addStyle(styles);

  const drawer = ctx.ui.registerDrawerTab({
    id: "lumiworld",
    title: "LumiWorld",
    icon: "sparkles",
    render(root) {
      drawerRoot = root;
      renderDrawer();
    },
  });

  ctx.onBackendMessage((payload) => {
    handleBackendMessage(payload);
  });

  ctx.events.on("CHAT_SWITCHED", () => {
    requestHydrate();
  });

  requestHydrate();

  function handleBackendMessage(payload: unknown): void {
    const message = payload as BackendToFrontendMessage;
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    if (message.type === "WORLD_UPDATED") {
      state.summary = message.summary;
      updateWidgetVisibility();
      requestHydrate(message.chatId);
      return;
    }

    if (message.type === "WORLD_GRAPH_DATA") {
      state.graph = message.graph;
      state.summary = message.summary;
      state.permissions = message.permissions;
      state.ui = message.ui;
      ensureWidget();
      renderDrawer();
      renderWidget();
      updateWidgetVisibility();
      return;
    }

    if (message.type === "OPEN_TRACKER") {
      drawer.activate();
    }
  }

  function requestHydrate(chatId?: string): void {
    const message: FrontendToBackendMessage = {
      type: "GET_WORLD_GRAPH",
      chatId,
    };
    ctx.sendToBackend(message);
  }

  function saveUiSettings(partial: Partial<UiSettings>): void {
    ctx.sendToBackend({
      type: "SAVE_UI_SETTINGS",
      ui: partial,
    } satisfies FrontendToBackendMessage);
  }

  function ensureWidget(): void {
    if (widget || !state.permissions.uiPanels) {
      return;
    }

    widget = ctx.ui.createFloatWidget({
      id: "lumiworld-widget",
      title: "LumiWorld",
      position: state.ui.widgetPosition,
      render(root) {
        widgetRoot = root;
        renderWidget();
      },
    });

    if (widget.setPosition) {
      widget.setPosition(state.ui.widgetPosition);
    }

    widget.onDragEnd?.((position) => {
      state.ui.widgetPosition = position;
      saveUiSettings({ widgetPosition: position });
    });
  }

  function renderDrawer(): void {
    if (!drawerRoot) {
      return;
    }

    const warnings = getWarnings();
    drawerRoot.innerHTML = "";

    const header = document.createElement("div");
    header.className = "lumiworld-header";
    header.innerHTML = `
      <div>
        <h2>LumiWorld</h2>
        <p>Living-world tracking for the current RP chat.</p>
      </div>
      <div class="lumiworld-actions">
        <button data-view="people" class="${state.currentView === "people" ? "is-active" : ""}">People</button>
        <button data-view="relationships" class="${state.currentView === "relationships" ? "is-active" : ""}">Relationships</button>
        ${
          state.permissions.uiPanels
            ? `<button data-action="toggle-widget">${state.ui.widgetVisible ? "Hide Widget" : "Show Widget"}</button>`
            : ""
        }
      </div>
    `;
    drawerRoot.appendChild(header);

    header.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentView = button.dataset.view as "people" | "relationships";
        renderDrawer();
      });
    });

    const widgetToggle = header.querySelector<HTMLButtonElement>("[data-action='toggle-widget']");
    widgetToggle?.addEventListener("click", () => {
      state.ui.widgetVisible = !state.ui.widgetVisible;
      saveUiSettings({ widgetVisible: state.ui.widgetVisible });
      renderDrawer();
      updateWidgetVisibility();
    });

    if (warnings.length > 0) {
      const warningList = document.createElement("div");
      warningList.className = "lumiworld-warnings";
      for (const warning of warnings) {
        const pill = document.createElement("span");
        pill.textContent = warning;
        warningList.appendChild(pill);
      }
      drawerRoot.appendChild(warningList);
    }

    const body = document.createElement("div");
    body.className = "lumiworld-body";
    drawerRoot.appendChild(body);

    if (!state.graph) {
      body.innerHTML = `
        <div class="lumiworld-empty">
          <strong>No tracked world yet.</strong>
          <p>Open a character chat and let LumiWorld hydrate the current graph, or generate one turn with the MLRPE bridge enabled.</p>
        </div>
      `;
      return;
    }

    if (state.currentView === "people") {
      body.appendChild(renderPeopleView());
      return;
    }

    body.appendChild(renderRelationshipsView());
  }

  function renderPeopleView(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "lumiworld-grid";

    const npcs = Object.values(state.graph?.npcs ?? {}).sort((left, right) =>
      left.tier === right.tier ? left.name.localeCompare(right.name) : left.tier.localeCompare(right.tier),
    );

    for (const npc of npcs) {
      const card = document.createElement("article");
      card.className = "lumiworld-card";
      card.innerHTML = `
        <div class="lumiworld-card-top">
          <strong>${escapeHtml(npc.name)}</strong>
          <span>${escapeHtml(npc.tier)}</span>
        </div>
        <p><strong>Location:</strong> ${escapeHtml(npc.physicalState.location ?? "unknown")}</p>
        <p><strong>Mood:</strong> ${escapeHtml(
          npc.physicalState.mood ?? npc.emotionalState?.dominant ?? "unknown",
        )}</p>
        <p><strong>Agenda:</strong> ${escapeHtml(npc.agendaNow ?? "none")}</p>
        <p><strong>Details:</strong> ${escapeHtml(npc.physicalState.details.join("; ") || "none")}</p>
      `;
      wrapper.appendChild(card);
    }

    return wrapper;
  }

  function renderRelationshipsView(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "lumiworld-grid";

    const relationships = Object.values(state.graph?.relationships ?? {});
    if (relationships.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lumiworld-empty";
      empty.innerHTML = "<strong>No tracked relationships yet.</strong>";
      wrapper.appendChild(empty);
      return wrapper;
    }

    for (const relationship of relationships) {
      const card = document.createElement("article");
      card.className = "lumiworld-card";
      card.innerHTML = `
        <div class="lumiworld-card-top">
          <strong>${escapeHtml(relationship.from)} -> ${escapeHtml(relationship.to)}</strong>
          <span>${Object.keys(relationship.durable).length} durable / ${Object.keys(
            relationship.momentary,
          ).length} momentary</span>
        </div>
        <p><strong>Durable:</strong> ${escapeHtml(formatKeyValues(relationship.durable) || "none")}</p>
        <p><strong>Momentary:</strong> ${escapeHtml(formatKeyValues(relationship.momentary) || "none")}</p>
        <p><strong>Boundaries:</strong> ${escapeHtml(
          formatStringValues(relationship.boundaryChanges) || "none",
        )}</p>
        <p><strong>Qualifying events:</strong> ${escapeHtml(
          relationship.qualifyingEvents.join("; ") || "none",
        )}</p>
      `;
      wrapper.appendChild(card);
    }

    return wrapper;
  }

  function renderWidget(): void {
    if (!widgetRoot) {
      return;
    }

    widgetRoot.innerHTML = `
      <div class="lumiworld-widget">
        <button class="lumiworld-widget-open" type="button">
          <span>LumiWorld</span>
          <span>${state.summary.activeCast.length} active</span>
        </button>
        <div class="lumiworld-widget-content">
          <div class="lumiworld-chip-row">
            ${state.summary.activeCast
              .map((name) => `<span class="lumiworld-chip">${escapeHtml(name)}</span>`)
              .join("")}
          </div>
          <ul>
            ${state.summary.hotAlerts.map((alert) => `<li>${escapeHtml(alert)}</li>`).join("") || "<li>No hot alerts.</li>"}
          </ul>
          <button class="lumiworld-widget-hide" type="button">Hide</button>
        </div>
      </div>
    `;

    widgetRoot.querySelector<HTMLButtonElement>(".lumiworld-widget-open")?.addEventListener("click", () => {
      drawer.activate();
      requestHydrate();
    });

    widgetRoot.querySelector<HTMLButtonElement>(".lumiworld-widget-hide")?.addEventListener("click", () => {
      state.ui.widgetVisible = false;
      saveUiSettings({ widgetVisible: false });
      updateWidgetVisibility();
      renderDrawer();
    });
  }

  function updateWidgetVisibility(): void {
    if (!widget) {
      return;
    }

    widget.setVisible(Boolean(state.permissions.uiPanels && state.summary.hasWorld && state.ui.widgetVisible));
    if (state.ui.widgetPosition && widget.setPosition) {
      widget.setPosition(state.ui.widgetPosition);
    }
  }

  function getWarnings(): string[] {
    const warnings: string[] = [];

    if (!state.permissions.generation) {
      warnings.push("Missing generation permission");
    }
    if (!state.permissions.characters) {
      warnings.push("Missing characters permission");
    }
    if (!state.permissions.chats) {
      warnings.push("Missing chats permission");
    }
    if (!state.permissions.chatMutation) {
      warnings.push("Missing chat_mutation permission");
    }
    if (!state.permissions.uiPanels) {
      warnings.push("Widget disabled: missing ui_panels");
    }

    return warnings;
  }
}

function formatKeyValues(record: Record<string, number>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function formatStringValues(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const styles = `
  .lumiworld-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .lumiworld-header h2 {
    margin: 0 0 4px;
  }

  .lumiworld-header p {
    margin: 0;
    color: #5b6475;
  }

  .lumiworld-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .lumiworld-actions button,
  .lumiworld-widget button {
    border: 1px solid #c7d2df;
    background: #f4f8fb;
    border-radius: 999px;
    padding: 8px 12px;
    cursor: pointer;
  }

  .lumiworld-actions button.is-active {
    background: #15253f;
    color: #ffffff;
    border-color: #15253f;
  }

  .lumiworld-warnings {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .lumiworld-warnings span {
    background: #fff2db;
    color: #7a5210;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
  }

  .lumiworld-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  .lumiworld-card,
  .lumiworld-empty,
  .lumiworld-widget {
    border: 1px solid #d8e0ea;
    background: #ffffff;
    border-radius: 18px;
    padding: 14px;
    box-shadow: 0 10px 30px rgba(20, 37, 63, 0.08);
  }

  .lumiworld-card p,
  .lumiworld-empty p {
    margin: 8px 0 0;
  }

  .lumiworld-card-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .lumiworld-widget {
    min-width: 260px;
    background: linear-gradient(145deg, #f6fbff, #ffffff);
  }

  .lumiworld-widget-open {
    width: 100%;
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .lumiworld-widget-content ul {
    margin: 0 0 12px;
    padding-left: 18px;
  }

  .lumiworld-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .lumiworld-chip {
    background: #dcecff;
    color: #18304e;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
  }
`;
