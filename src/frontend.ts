import type { BackendToFrontendMessage, FrontendToBackendMessage, PermissionSnapshot, UiSettings } from "./shared/messages";
import type { NPCNode, RelationshipEdge, WorldGraph, WorldSummary } from "./shared/types";

type FrontendState = {
  graph: WorldGraph | null;
  summary: WorldSummary;
  permissions: PermissionSnapshot;
  ui: UiSettings;
  currentView: "people" | "relationships";
  expandedNpcIds: string[];
  expandedRelationshipIds: string[];
};

type RichNpcNode = NPCNode;
type RichRelationshipEdge = RelationshipEdge;

const tierOrder = ["major", "minor", "stranger", "extra"] as const;
const tierLabels: Record<(typeof tierOrder)[number], string> = {
  major: "Major",
  minor: "Minor",
  stranger: "Strangers",
  extra: "Extras",
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
  expandedNpcIds: [],
  expandedRelationshipIds: [],
};

export function setup(ctx: LumiverseFrontendContext): () => void {
  const state: FrontendState = structuredClone(defaultState);
  const removeStyle = ctx.dom.addStyle(styles);
  const drawer = ctx.ui.registerDrawerTab({
    id: "lumiworld",
    title: "LumiWorld",
    shortName: "Lumi",
    description: "Living-world tracking for the current RP chat.",
    headerTitle: "LumiWorld",
  });
  const drawerRoot = drawer.root;
  let widgetRoot: HTMLElement | null = null;
  let widget: LumiverseFloatWidgetHandle | null = null;
  let unsubWidgetDragEnd: (() => void) | null = null;
  const unsubBackend = ctx.onBackendMessage((payload) => {
    handleBackendMessage(payload);
  });

  requestHydrate();
  renderDrawer();

  function handleBackendMessage(payload: unknown): void {
    const message = payload as BackendToFrontendMessage;
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    if (message.type === "WORLD_UPDATED") {
      state.summary = message.summary;
      renderDrawer();
      renderWidget();
      updateWidgetVisibility();
      requestHydrate(message.chatId);
      return;
    }

    if (message.type === "WORLD_GRAPH_DATA") {
      state.graph = message.graph;
      state.summary = message.summary;
      state.permissions = message.permissions;
      state.ui = normalizeUiSettings(message.ui);
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
    const normalized = normalizeUiSettings({
      ...state.ui,
      ...partial,
    });
    const next: Partial<UiSettings> = {};

    if (partial.widgetPosition) {
      next.widgetPosition = normalized.widgetPosition;
    }
    if (typeof partial.widgetVisible === "boolean") {
      next.widgetVisible = normalized.widgetVisible;
    }

    ctx.sendToBackend({
      type: "SAVE_UI_SETTINGS",
      ui: next,
    } satisfies FrontendToBackendMessage);
  }

  function ensureWidget(): void {
    if (widget || !state.permissions.uiPanels) {
      return;
    }

    widget = ctx.ui.createFloatWidget({
      width: 280,
      height: 188,
      initialPosition: state.ui.widgetPosition,
      tooltip: "LumiWorld",
      chromeless: true,
    });
    widgetRoot = widget.root;
    renderWidget();
    unsubWidgetDragEnd = widget.onDragEnd((position) => {
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
      <div class="lumiworld-heading">
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
    wrapper.className = "lumiworld-stack";

    const graph = state.graph;
    if (!graph) {
      return wrapper;
    }

    const sceneSummary = document.createElement("section");
    sceneSummary.className = "lumiworld-panel";
    sceneSummary.innerHTML = `
      <div class="lumiworld-panel-head">
        <div>
          <h3>Scene Snapshot</h3>
          <p>${escapeHtml(formatSceneSnapshot(graph))}</p>
        </div>
        <div class="lumiworld-metadata">
          <span>${graph.sceneCast.active.length} active</span>
          <span>${Object.keys(graph.npcs).length} tracked</span>
        </div>
      </div>
      ${renderSceneLists(graph)}
    `;
    wrapper.appendChild(sceneSummary);

    const peopleByTier = new Map<string, RichNpcNode[]>();
    for (const tier of tierOrder) {
      peopleByTier.set(tier, []);
    }

    for (const npc of Object.values(graph.npcs)) {
      const bucket = peopleByTier.get(npc.tier) ?? [];
      bucket.push(npc);
      peopleByTier.set(npc.tier, bucket);
    }

    for (const tier of tierOrder) {
      const npcs = (peopleByTier.get(tier) ?? []).sort((left, right) => left.name.localeCompare(right.name));
      if (npcs.length === 0) {
        continue;
      }

      const section = document.createElement("section");
      section.className = "lumiworld-tier-group";
      section.innerHTML = `
        <div class="lumiworld-section-head">
          <div>
            <h3>${tierLabels[tier]}</h3>
            <p>${escapeHtml(getTierDescription(tier, npcs.length))}</p>
          </div>
          <span class="lumiworld-count">${npcs.length}</span>
        </div>
      `;

      const grid = document.createElement("div");
      grid.className = "lumiworld-grid";
      for (const npc of npcs) {
        grid.appendChild(renderNpcCard(npc, graph));
      }

      section.appendChild(grid);
      wrapper.appendChild(section);
    }

    return wrapper;
  }

  function renderNpcCard(npc: RichNpcNode, graph: WorldGraph): HTMLElement {
    const card = document.createElement("article");
    card.className = "lumiworld-card";
    const expanded = state.expandedNpcIds.includes(npc.id);
    const detailRegionId = `lumiworld-npc-details-${npc.id}`;
    const sceneFlags = getNpcSceneFlags(npc.id, graph.sceneCast);
    const aliases = uniqueStrings(npc.aliases);
    const profile = npc.profile;
    const hooks = npc.display?.hooks.length ? npc.display.hooks : npc.hooks;
    const arcs = npc.display?.arcs ?? [];

    const identityItems = [
      npc.description ? renderInlineBlock("Description", npc.description) : "",
      profile?.summary ? renderInlineBlock("Profile summary", profile.summary) : "",
      aliases.length > 0 ? renderTagList("Aliases", aliases) : "",
      renderTagList("Role", uniqueStrings(profile?.role)),
      renderTagList("Goals", uniqueStrings(profile?.goals)),
      renderTagList("Fears", uniqueStrings(profile?.fears)),
      renderTagList("Convictions", uniqueStrings(profile?.convictions)),
    ]
      .filter(Boolean)
      .join("");

    const selfKnowledgeItems = [
      renderTagList("Known", uniqueStrings(profile?.selfKnowledge.known)),
      renderTagList("Blind spots", uniqueStrings(profile?.selfKnowledge.blindSpots)),
      renderTagList("Denied", uniqueStrings(profile?.selfKnowledge.denied)),
    ]
      .filter(Boolean)
      .join("");

    const secretsBlock =
      npc.secrets.length > 0
        ? `<div class="lumiworld-audit-list">${npc.secrets
            .map(
              (secret) => `
                <div class="lumiworld-audit-item">
                  <strong>${escapeHtml(secret.secret)}</strong>
                  <p>${escapeHtml(secret.lifecycle)}</p>
                  ${secret.suspects.length > 0 ? `<p>Suspects: ${escapeHtml(secret.suspects.join(", "))}</p>` : ""}
                  ${secret.evidence.length > 0 ? `<p>Evidence: ${escapeHtml(secret.evidence.join("; "))}</p>` : ""}
                </div>
              `,
            )
            .join("")}</div>`
        : renderMutedLine("No tracked secrets.");

    const arcBlock =
      arcs.length > 0 || hooks.length > 0
        ? `
            ${
              arcs.length > 0
                ? `<div class="lumiworld-audit-list">${arcs
                    .map(
                      (arc) => `
                        <div class="lumiworld-audit-item">
                          <strong>${escapeHtml(arc.arc)}</strong>
                          <p>${escapeHtml(arc.state ?? "State not yet recorded.")}</p>
                        </div>
                      `,
                    )
                    .join("")}</div>`
                : ""
            }
            ${
              hooks.length > 0
                ? `<div class="lumiworld-hook-row">${hooks
                    .map(
                      (hook) =>
                        `<span>${escapeHtml([hook.arc, hook.fact, hook.state ?? hook.lifecycle].filter(Boolean).join(" | "))}</span>`,
                    )
                    .join("")}</div>`
                : ""
            }
          `
        : renderMutedLine("No active arcs or hooks.");

    card.innerHTML = `
      <div class="lumiworld-card-top">
        <div class="lumiworld-card-title">
          <div class="lumiworld-title-row">
            <strong>${escapeHtml(npc.name)}</strong>
            <span class="lumiworld-tier-pill">${escapeHtml(tierLabels[npc.tier] ?? npc.tier)}</span>
          </div>
          <p>${escapeHtml(sceneFlags.join(" | ") || "Offscene / archival entry")}</p>
        </div>
        <button
          class="lumiworld-expander"
          type="button"
          data-npc-id="${escapeHtml(npc.id)}"
          aria-expanded="${expanded ? "true" : "false"}"
          aria-controls="${detailRegionId}"
        >
          ${expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div class="lumiworld-summary-grid">
        <div>
          <span class="lumiworld-kicker">Current read</span>
          <strong>${escapeHtml(npc.physicalState.mood ?? npc.emotionalState?.dominant ?? "Unknown")}</strong>
          <p>${escapeHtml(npc.physicalState.location ?? "Location unknown")}</p>
        </div>
        <div>
          <span class="lumiworld-kicker">Agenda</span>
          <strong>${escapeHtml(npc.agendaNow ?? "none")}</strong>
          <p>${escapeHtml(npc.secrets.length > 0 ? `${npc.secrets.length} secret${npc.secrets.length === 1 ? "" : "s"}` : "No secrets logged")}</p>
        </div>
      </div>
      ${
        expanded
          ? `
            <div class="lumiworld-detail-grid" id="${detailRegionId}">
              ${renderSectionCard(
                "Surface state",
                [
                  renderDefinitionRow("Location", npc.physicalState.location ?? "unknown"),
                  renderDefinitionRow("Visible mood", npc.physicalState.mood ?? npc.emotionalState?.dominant ?? "unknown"),
                  renderDefinitionRow("Emotional state", formatEmotionalState(npc.emotionalState)),
                  renderDefinitionRow("Attire", npc.physicalState.attire ?? "unknown"),
                  renderDefinitionRow("Injuries", joinStrings(npc.physicalState.injuries)),
                  renderDefinitionRow("Observed details", joinStrings(npc.physicalState.details)),
                  renderDefinitionRow("Scene turns", String(npc.sceneTurnCount)),
                ].join(""),
              )}
              ${renderSectionCard("Identity", identityItems || renderMutedLine("No deeper identity fields recorded yet."))}
              ${renderSectionCard("Self-knowledge", selfKnowledgeItems || renderMutedLine("No self-knowledge fields recorded yet."))}
              ${renderSectionCard("Agenda", renderDefinitionRow("Current", npc.agendaNow ?? "none"))}
              ${renderSectionCard("Secrets", secretsBlock)}
              ${renderSectionCard("Arcs & hooks", arcBlock)}
            </div>
          `
          : ""
      }
    `;

    card.querySelector<HTMLButtonElement>("[data-npc-id]")?.addEventListener("click", () => {
      state.expandedNpcIds = toggleExpanded(state.expandedNpcIds, npc.id);
      renderDrawer();
    });

    return card;
  }

  function renderRelationshipsView(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "lumiworld-stack";

    const graph = state.graph;
    if (!graph) {
      return wrapper;
    }

    const relationships = Object.values(graph.relationships);
    if (relationships.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lumiworld-empty";
      empty.innerHTML = "<strong>No tracked relationships yet.</strong>";
      wrapper.appendChild(empty);
      return wrapper;
    }

    const intro = document.createElement("section");
    intro.className = "lumiworld-panel";
    intro.innerHTML = `
      <div class="lumiworld-panel-head">
        <div>
          <h3>Relationship Audit</h3>
          <p>Directed edges show how one side currently reads and constrains the other.</p>
        </div>
        <div class="lumiworld-metadata">
          <span>${relationships.length} directed edges</span>
          <span>${graph.sceneCast.active.length} active actors</span>
        </div>
      </div>
    `;
    wrapper.appendChild(intro);

    const list = document.createElement("div");
    list.className = "lumiworld-grid";
    for (const relationship of relationships.sort(compareRelationships(graph))) {
      list.appendChild(renderRelationshipCard(relationship, graph));
    }
    wrapper.appendChild(list);

    return wrapper;
  }

  function renderRelationshipCard(relationship: RichRelationshipEdge, graph: WorldGraph): HTMLElement {
    const card = document.createElement("article");
    card.className = "lumiworld-card";
    const id = `${relationship.from}->${relationship.to}`;
    const expanded = state.expandedRelationshipIds.includes(id);
    const detailRegionId = `lumiworld-edge-details-${relationship.from}-${relationship.to}`;
    const durableEntries = getRelationshipDurableEntries(relationship).sort(compareAxisEntries);
    const momentaryEntries = Object.entries(relationship.momentary).sort(compareAxisEntries);
    const boundaryEntries = Object.entries(relationship.boundaryStates ?? {}).sort(([left], [right]) => left.localeCompare(right));
    const fallbackBoundaryEntries =
      boundaryEntries.length === 0
        ? Object.entries(relationship.boundaryChanges ?? {}).sort(([left], [right]) => left.localeCompare(right))
        : [];
    const knowledgeBuckets = relationship.knowledgeBuckets;
    const hasKnowledgeData =
      Boolean(knowledgeBuckets) &&
      [knowledgeBuckets.mutual, knowledgeBuckets.fromKnows, knowledgeBuckets.toKnows, knowledgeBuckets.publicRumors].some(
        (values) => values.length > 0,
      );
    const eventAudit = relationship.qualifyingEventAudit ?? [];
    const qualifyingEvents = relationship.qualifyingEvents;
    const fromLabel = lookupNpcName(relationship.from, graph);
    const toLabel = lookupNpcName(relationship.to, graph);

    card.innerHTML = `
      <div class="lumiworld-card-top">
        <div class="lumiworld-card-title">
          <div class="lumiworld-title-row">
            <strong>${escapeHtml(fromLabel)}</strong>
            <span class="lumiworld-arrow">-&gt;</span>
            <strong>${escapeHtml(toLabel)}</strong>
          </div>
          <p>${escapeHtml(summarizeRelationship(relationship))}</p>
        </div>
        <button
          class="lumiworld-expander"
          type="button"
          data-edge-id="${escapeHtml(id)}"
          aria-expanded="${expanded ? "true" : "false"}"
          aria-controls="${detailRegionId}"
        >
          ${expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div class="lumiworld-summary-grid">
        <div>
          <span class="lumiworld-kicker">Durable</span>
          <strong>${escapeHtml(summarizeAxes(durableEntries))}</strong>
          <p>${escapeHtml(`${durableEntries.length} tracked durable axes`)}</p>
        </div>
        <div>
          <span class="lumiworld-kicker">Momentary</span>
          <strong>${escapeHtml(summarizeAxes(momentaryEntries))}</strong>
          <p>${escapeHtml(qualifyingEvents.length > 0 ? `${qualifyingEvents.length} qualifying event${qualifyingEvents.length === 1 ? "" : "s"}` : "No audit events recorded")}</p>
        </div>
      </div>
      ${
        expanded
          ? `
            <div class="lumiworld-detail-grid" id="${detailRegionId}">
              ${renderSectionCard("Durable texture", renderAxisRows(durableEntries, true))}
              ${renderSectionCard("Momentary pressure", renderAxisRows(momentaryEntries, false))}
              ${renderSectionCard(
                "Boundaries",
                boundaryEntries.length > 0
                  ? boundaryEntries
                      .map(
                        ([domain, status]) => `
                          <div class="lumiworld-row">
                            <span>${escapeHtml(humanizeKey(domain))}</span>
                            <strong>${escapeHtml(humanizeKey(status.state))}</strong>
                          </div>
                          ${status.qualifyingEvent ? `<p>${escapeHtml(status.qualifyingEvent)}</p>` : ""}
                        `,
                      )
                      .join("")
                  : fallbackBoundaryEntries.length > 0
                    ? fallbackBoundaryEntries
                        .map(
                          ([domain, status]) => `
                            <div class="lumiworld-row">
                              <span>${escapeHtml(humanizeKey(domain))}</span>
                              <strong>${escapeHtml(humanizeKey(status))}</strong>
                            </div>
                          `,
                        )
                        .join("")
                  : renderMutedLine("No explicit boundary changes tracked."),
              )}
              ${renderSectionCard(
                "Knowledge audit",
                hasKnowledgeData
                  ? [
                      renderTagList("Mutual", uniqueStrings(knowledgeBuckets?.mutual)),
                      renderTagList(`${fromLabel} knows`, uniqueStrings(knowledgeBuckets?.fromKnows)),
                      renderTagList(`${toLabel} knows`, uniqueStrings(knowledgeBuckets?.toKnows)),
                      renderTagList("Public rumors", uniqueStrings(knowledgeBuckets?.publicRumors)),
                    ]
                      .filter(Boolean)
                      .join("")
                  : renderMutedLine("No relationship knowledge has been recorded for this edge."),
              )}
              ${renderSectionCard(
                "Qualifying events",
                eventAudit.length > 0
                  ? `<div class="lumiworld-audit-list">${eventAudit
                      .map(
                        (event, index) => `
                          <div class="lumiworld-audit-item">
                            <strong>Event ${index + 1}</strong>
                            <p>${escapeHtml(event.event)}</p>
                            ${event.axes.length > 0 ? `<p>Axes: ${escapeHtml(event.axes.map(humanizeKey).join(", "))}</p>` : ""}
                            ${typeof event.publicFaceShift === "number" ? `<p>Public face shift: ${escapeHtml(String(event.publicFaceShift))}</p>` : ""}
                            ${event.boundaryDomains.length > 0 ? `<p>Boundaries: ${escapeHtml(event.boundaryDomains.map(humanizeKey).join(", "))}</p>` : ""}
                          </div>
                        `,
                      )
                      .join("")}</div>`
                  : qualifyingEvents.length > 0
                    ? `<div class="lumiworld-audit-list">${qualifyingEvents
                        .map(
                          (event, index) => `
                            <div class="lumiworld-audit-item">
                              <strong>Event ${index + 1}</strong>
                              <p>${escapeHtml(event)}</p>
                            </div>
                          `,
                        )
                        .join("")}</div>`
                    : renderMutedLine("No qualifying events logged for this edge."),
              )}
            </div>
          `
          : ""
      }
    `;

    card.querySelector<HTMLButtonElement>("[data-edge-id]")?.addEventListener("click", () => {
      state.expandedRelationshipIds = toggleExpanded(state.expandedRelationshipIds, id);
      renderDrawer();
    });

    return card;
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
            ${state.summary.activeCast.map((name) => `<span class="lumiworld-chip">${escapeHtml(name)}</span>`).join("")}
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
    const currentPosition = widget.getPosition();
    if (currentPosition.x !== state.ui.widgetPosition.x || currentPosition.y !== state.ui.widgetPosition.y) {
      widget.moveTo(state.ui.widgetPosition.x, state.ui.widgetPosition.y);
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

  return () => {
    unsubBackend();
    unsubWidgetDragEnd?.();
    widget?.destroy();
    drawer.destroy();
    removeStyle();
    ctx.dom.cleanup();
  };
}

function renderSectionCard(title: string, content: string): string {
  return `
    <section class="lumiworld-detail-card">
      <h4>${escapeHtml(title)}</h4>
      <div class="lumiworld-detail-body">
        ${content}
      </div>
    </section>
  `;
}

function renderDefinitionRow(label: string, value: string): string {
  return `
    <div class="lumiworld-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderInlineBlock(label: string, value: string): string {
  return `
    <div class="lumiworld-block">
      <span class="lumiworld-kicker">${escapeHtml(label)}</span>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function renderTagList(label: string, values: string[]): string {
  if (values.length === 0) {
    return "";
  }

  return `
    <div class="lumiworld-block">
      <span class="lumiworld-kicker">${escapeHtml(label)}</span>
      <div class="lumiworld-chip-row">
        ${values.map((value) => `<span class="lumiworld-chip">${escapeHtml(value)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderMutedLine(value: string): string {
  return `<p class="lumiworld-muted">${escapeHtml(value)}</p>`;
}

function renderAxisRows(entries: Array<[string, number]>, durable: boolean): string {
  if (entries.length === 0) {
    return renderMutedLine(durable ? "No durable axes recorded." : "No momentary axes recorded.");
  }

  return entries
    .map(([axis, value]) => {
      const band = typeof value === "number" ? describeAxisBand(value) : "Unknown";
      return `
        <div class="lumiworld-axis-row">
          <div>
            <strong>${escapeHtml(humanizeKey(axis))}</strong>
            <p>${escapeHtml(band)}</p>
          </div>
          <span>${escapeHtml(String(value))}</span>
        </div>
      `;
    })
    .join("");
}

function renderSceneLists(graph: WorldGraph): string {
  const groups: Array<[string, string[]]> = [
    ["Active", graph.sceneCast.active.map((id) => lookupNpcName(id, graph))],
    ["Nearby", graph.sceneCast.nearby.map((id) => lookupNpcName(id, graph))],
    ["Offscreen", graph.sceneCast.offscreen.map((id) => lookupNpcName(id, graph))],
  ];

  return `
    <div class="lumiworld-scene-groups">
      ${groups
        .map(([label, values]) =>
          values.length > 0
            ? `
                <div class="lumiworld-block">
                  <span class="lumiworld-kicker">${escapeHtml(label)}</span>
                  <div class="lumiworld-chip-row">
                    ${values.map((value) => `<span class="lumiworld-chip">${escapeHtml(value)}</span>`).join("")}
                  </div>
                </div>
              `
            : "",
        )
        .join("")}
    </div>
  `;
}

function formatSceneSnapshot(graph: WorldGraph): string {
  const time = graph.worldTime?.newDescriptor ? `Time: ${graph.worldTime.newDescriptor}` : "Time unchanged";
  const focal = graph.sceneCast.beatFocal ? `Focal: ${lookupNpcName(graph.sceneCast.beatFocal, graph)}` : "";
  const driver = graph.sceneCast.beatDriver ? `Driver: ${lookupNpcName(graph.sceneCast.beatDriver, graph)}` : "";
  return [time, focal, driver].filter(Boolean).join(" | ");
}

function getTierDescription(tier: string, count: number): string {
  const plural = count === 1 ? "entry" : "entries";
  if (tier === "major") {
    return `${count} primary ${plural} with the deepest tracker readout.`;
  }
  if (tier === "minor") {
    return `${count} supporting ${plural} with live state and lightweight depth.`;
  }
  if (tier === "stranger") {
    return `${count} light-touch ${plural} still building history.`;
  }
  return `${count} background ${plural} kept for scene continuity.`;
}

function getNpcSceneFlags(npcId: string, sceneCast: WorldGraph["sceneCast"]): string[] {
  const flags: string[] = [];
  if (sceneCast.active.includes(npcId)) {
    flags.push("Active scene cast");
  }
  if (sceneCast.nearby.includes(npcId)) {
    flags.push("Nearby");
  }
  if (sceneCast.offscreen.includes(npcId)) {
    flags.push("Offscreen");
  }
  if (sceneCast.cardPrincipal === npcId) {
    flags.push("Card principal");
  }
  if (sceneCast.beatFocal === npcId) {
    flags.push("Beat focal");
  }
  if (sceneCast.beatDriver === npcId) {
    flags.push("Beat driver");
  }
  return flags;
}

function compareRelationships(graph: WorldGraph): (left: RichRelationshipEdge, right: RichRelationshipEdge) => number {
  return (left, right) => {
    const leftFrom = lookupNpcName(left.from, graph);
    const rightFrom = lookupNpcName(right.from, graph);
    if (leftFrom !== rightFrom) {
      return leftFrom.localeCompare(rightFrom);
    }

    const leftTo = lookupNpcName(left.to, graph);
    const rightTo = lookupNpcName(right.to, graph);
    return leftTo.localeCompare(rightTo);
  };
}

function summarizeRelationship(relationship: RichRelationshipEdge): string {
  const durableEntries = getRelationshipDurableEntries(relationship).sort(compareAxisEntries);
  const momentaryEntries = Object.entries(relationship.momentary).sort(compareAxisEntries);
  const summary = [
    durableEntries.length > 0 ? `Durable: ${summarizeAxes(durableEntries)}` : "",
    momentaryEntries.length > 0 ? `Momentary: ${summarizeAxes(momentaryEntries)}` : "",
    Object.keys(relationship.boundaryStates ?? relationship.boundaryChanges ?? {}).length > 0 ? "Boundary history present" : "",
  ]
    .filter(Boolean)
    .join(" | ");
  return summary || "No relationship texture recorded yet.";
}

function summarizeAxes(entries: Array<[string, number]>): string {
  if (entries.length === 0) {
    return "none";
  }

  return entries
    .slice(0, 2)
    .map(([axis, value]) => `${humanizeKey(axis)} ${value}`)
    .join(" | ");
}

function compareAxisEntries(left: [string, number], right: [string, number]): number {
  if (right[1] !== left[1]) {
    return right[1] - left[1];
  }
  return left[0].localeCompare(right[0]);
}

function getRelationshipDurableEntries(relationship: RichRelationshipEdge): Array<[string, number]> {
  const entries = new Map<string, number>(Object.entries(relationship.durable));
  if (typeof relationship.publicFace?.score === "number") {
    entries.set("public_face", relationship.publicFace.score);
  }
  if (typeof relationship.betrayalScar?.score === "number") {
    entries.set("betrayal_scar", relationship.betrayalScar.score);
  }
  return [...entries.entries()];
}

function describeAxisBand(value: number): string {
  if (value <= 0) {
    return "Unsafe / hostile";
  }
  if (value === 1) {
    return "Alarmed";
  }
  if (value === 2) {
    return "Fragile";
  }
  if (value === 3) {
    return "Conditional";
  }
  if (value === 4) {
    return "Functional";
  }
  if (value === 5) {
    return "Ordinary baseline";
  }
  if (value === 6) {
    return "Tested";
  }
  if (value === 7) {
    return "Vulnerability-capable";
  }
  if (value === 8) {
    return "Durable / proven";
  }
  return "Foundational / rare";
}

function formatEmotionalState(emotionalState: NPCNode["emotionalState"]): string {
  if (!emotionalState) {
    return "unknown";
  }

  const parts = [emotionalState.dominant];
  if (emotionalState.secondary) {
    parts.push(`with ${emotionalState.secondary}`);
  }
  parts.push(`intensity ${emotionalState.intensity}`);
  return parts.join(" | ");
}

function lookupNpcName(id: string, graph: WorldGraph): string {
  return graph.npcs[id]?.name ?? id;
}

function uniqueStrings(...values: Array<string | string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = item?.trim();
        if (normalized) {
          seen.add(normalized);
        }
      }
      continue;
    }

    const normalized = value?.trim();
    if (normalized) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

function joinStrings(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "none";
  }
  return value && value.length > 0 ? value : "none";
}

function toggleExpanded(values: string[], target: string): string[] {
  return values.includes(target) ? values.filter((value) => value !== target) : [...values, target];
}

function humanizeKey(value: string): string {
  return value
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (match) => match.toUpperCase());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeUiSettings(value: Partial<UiSettings> | null | undefined): UiSettings {
  return {
    widgetPosition: normalizeWidgetPosition(value?.widgetPosition),
    widgetVisible: typeof value?.widgetVisible === "boolean" ? value.widgetVisible : defaultState.ui.widgetVisible,
  };
}

function normalizeWidgetPosition(
  position: Partial<UiSettings["widgetPosition"]> | null | undefined,
): UiSettings["widgetPosition"] {
  const fallback = defaultState.ui.widgetPosition;
  const x = typeof position?.x === "number" && Number.isFinite(position.x) ? position.x : fallback.x;
  const y = typeof position?.y === "number" && Number.isFinite(position.y) ? position.y : fallback.y;
  return { x, y };
}

const styles = `
  .lumiworld-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .lumiworld-heading h2,
  .lumiworld-section-head h3,
  .lumiworld-panel-head h3,
  .lumiworld-detail-card h4 {
    margin: 0;
  }

  .lumiworld-heading p,
  .lumiworld-section-head p,
  .lumiworld-panel-head p,
  .lumiworld-card-title p,
  .lumiworld-summary-grid p,
  .lumiworld-block p,
  .lumiworld-audit-item p,
  .lumiworld-muted {
    margin: 0;
    opacity: 0.72;
  }

  .lumiworld-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .lumiworld-actions button,
  .lumiworld-widget button,
  .lumiworld-expander {
    border: 1px solid rgba(127, 127, 127, 0.34);
    border-color: color-mix(in srgb, currentColor 18%, transparent);
    background: rgba(127, 127, 127, 0.08);
    background: color-mix(in srgb, currentColor 6%, transparent);
    color: inherit;
    border-radius: 999px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }

  .lumiworld-actions button.is-active {
    background: rgba(127, 127, 127, 0.18);
    background: color-mix(in srgb, currentColor 14%, transparent);
    border-color: rgba(127, 127, 127, 0.52);
    border-color: color-mix(in srgb, currentColor 32%, transparent);
  }

  .lumiworld-body,
  .lumiworld-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .lumiworld-warnings {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .lumiworld-warnings span,
  .lumiworld-tier-pill,
  .lumiworld-count,
  .lumiworld-metadata span,
  .lumiworld-hook-row span {
    border: 1px solid rgba(127, 127, 127, 0.28);
    border-color: color-mix(in srgb, currentColor 16%, transparent);
    background: rgba(127, 127, 127, 0.08);
    background: color-mix(in srgb, currentColor 6%, transparent);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
  }

  .lumiworld-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
    gap: 12px;
  }

  .lumiworld-panel,
  .lumiworld-card,
  .lumiworld-empty,
  .lumiworld-widget,
  .lumiworld-tier-group {
    border: 1px solid rgba(127, 127, 127, 0.24);
    border-color: color-mix(in srgb, currentColor 14%, transparent);
    background: rgba(127, 127, 127, 0.05);
    background: color-mix(in srgb, currentColor 4%, transparent);
    border-radius: 18px;
    padding: 14px;
    color: inherit;
  }

  .lumiworld-panel-head,
  .lumiworld-section-head,
  .lumiworld-card-top,
  .lumiworld-title-row,
  .lumiworld-row,
  .lumiworld-widget-open {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .lumiworld-section-head,
  .lumiworld-panel-head,
  .lumiworld-card-top {
    margin-bottom: 12px;
  }

  .lumiworld-card-title,
  .lumiworld-panel-head > div:first-child,
  .lumiworld-section-head > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .lumiworld-summary-grid,
  .lumiworld-detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: 12px;
  }

  .lumiworld-summary-grid > div,
  .lumiworld-detail-card {
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-color: color-mix(in srgb, currentColor 10%, transparent);
    background: rgba(127, 127, 127, 0.05);
    background: color-mix(in srgb, currentColor 3%, transparent);
    border-radius: 14px;
    padding: 12px;
  }

  .lumiworld-detail-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .lumiworld-detail-body,
  .lumiworld-scene-groups,
  .lumiworld-block,
  .lumiworld-audit-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lumiworld-kicker {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .lumiworld-chip-row,
  .lumiworld-hook-row,
  .lumiworld-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lumiworld-chip {
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
    border: 1px solid rgba(127, 127, 127, 0.2);
    border-color: color-mix(in srgb, currentColor 12%, transparent);
    background: rgba(127, 127, 127, 0.06);
    background: color-mix(in srgb, currentColor 4%, transparent);
  }

  .lumiworld-axis-row,
  .lumiworld-audit-item {
    border: 1px solid rgba(127, 127, 127, 0.16);
    border-color: color-mix(in srgb, currentColor 10%, transparent);
    border-radius: 12px;
    padding: 10px 12px;
    background: rgba(127, 127, 127, 0.04);
    background: color-mix(in srgb, currentColor 2%, transparent);
  }

  .lumiworld-axis-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .lumiworld-axis-row p {
    margin: 4px 0 0;
    opacity: 0.72;
  }

  .lumiworld-widget {
    min-width: 260px;
    backdrop-filter: blur(8px);
  }

  .lumiworld-widget-content ul {
    margin: 0 0 12px;
    padding-left: 18px;
  }

  .lumiworld-widget-open {
    width: 100%;
    margin-bottom: 12px;
  }

  .lumiworld-arrow {
    opacity: 0.68;
  }

  @media (max-width: 720px) {
    .lumiworld-header {
      flex-direction: column;
    }

    .lumiworld-actions {
      width: 100%;
    }

    .lumiworld-actions button {
      flex: 1 1 auto;
    }
  }
`;
