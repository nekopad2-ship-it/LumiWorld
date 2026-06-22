type TrackerOverlayHandle = {
  root: HTMLElement;
  setVisible(visible: boolean): void;
  destroy(): void;
};

const TRACKER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "agency", label: "Agency" },
  { id: "relationships", label: "Relationships" },
  { id: "world", label: "World" },
  { id: "timeline", label: "Timeline" },
  { id: "inspector", label: "Inspector" },
] as const;

type TrackerTabId = (typeof TRACKER_TABS)[number]["id"];

export function renderDock(dock: TrackerOverlayHandle): void {
  let activeTab: TrackerTabId = "overview";
  dock.root.classList.add("lwe-tracker-overlay-root");

  const descriptions: Record<TrackerTabId, string> = {
    overview: "Overview surface is empty in Phase 1.",
    people: "People surface is empty in Phase 1.",
    agency: "Agency surface is empty in Phase 1.",
    relationships: "Relationships surface is empty in Phase 1.",
    world: "World surface is empty in Phase 1.",
    timeline: "Timeline surface is empty in Phase 1.",
    inspector: "Inspector surface is empty in Phase 1.",
  };

  const captions: Record<TrackerTabId, string> = {
    overview: "World status, scene impact, and commit summary will land here.",
    people: "Tracked entities and profile shells will land here.",
    agency: "Offscreen decisions and pending actions will land here.",
    relationships: "Connection maps and tension signals will land here.",
    world: "Location, state, and continuity records will land here.",
    timeline: "World-time checkpoints and revisions will land here.",
    inspector: "Graph-level debugging and record inspection will land here.",
  };

  function update(): void {
    dock.root.innerHTML = `
      <section class="lwe-shell lwe-tracker-shell">
        <header class="lwe-shell-header">
          <div>
            <p class="lwe-kicker">Tracker</p>
            <h2>Living World Engine</h2>
          </div>
          <button type="button" class="lwe-close-button" data-dock-action="close" aria-label="Close tracker">Close</button>
        </header>
        <div class="lwe-tracker-frame">
          <div class="lwe-tracker-rail" role="tablist" aria-label="Tracker sections">
          ${TRACKER_TABS.map(
            (tab) => `
              <button
                type="button"
                class="lwe-tracker-rail-button"
                data-dock-tab="${tab.id}"
                aria-pressed="${String(tab.id === activeTab)}"
              >
                <span class="lwe-tracker-rail-label">${tab.label}</span>
              </button>
            `,
          ).join("")}
          </div>
          <article class="lwe-tracker-card">
            <p class="lwe-kicker">${TRACKER_TABS.find((tab) => tab.id === activeTab)?.label ?? "Tracker"}</p>
            <p>${descriptions[activeTab]}</p>
            <p class="lwe-muted">${captions[activeTab]}</p>
            <p class="lwe-muted">Decision Trace remains hidden until Debug is enabled.</p>
          </article>
        </div>
      </section>
    `;

    dock.root
      .querySelector<HTMLButtonElement>('button[data-dock-action="close"]')
      ?.addEventListener("click", () => {
        dock.setVisible(false);
      });

    for (const button of dock.root.querySelectorAll<HTMLButtonElement>(
      "button[data-dock-tab]",
    )) {
      button.addEventListener("click", () => {
        const nextTab = button.getAttribute("data-dock-tab");
        if (!nextTab || nextTab === activeTab) {
          return;
        }
        activeTab = nextTab as TrackerTabId;
        update();
      });
    }
  }

  update();
}

function focusDock(dock: TrackerOverlayHandle): void {
  dock.root
    .querySelector<HTMLElement>('button[data-dock-tab][aria-pressed="true"]')
    ?.focus();
  if (dock.root.ownerDocument.activeElement === dock.root.ownerDocument.body) {
    dock.root
      .querySelector<HTMLElement>('button[data-dock-action="close"]')
      ?.focus();
  }
}

export function createDockController(dock: TrackerOverlayHandle): {
  close(): void;
  open(): void;
  toggle(): void;
  destroy(): void;
} {
  let visible = false;
  dock.setVisible(false);

  return {
    close() {
      dock.setVisible(false);
      visible = false;
    },
    open() {
      dock.setVisible(true);
      visible = true;
      queueMicrotask(() => {
        focusDock(dock);
      });
    },
    toggle() {
      if (!visible) {
        this.open();
        return;
      }
      this.close();
    },
    destroy() {
      visible = false;
    },
  };
}
