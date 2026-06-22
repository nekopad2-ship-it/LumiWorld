type DockHandle = {
  root: HTMLElement;
  expand(): void;
  destroy(): void;
  isCollapsed?(): boolean;
  onVisibilityChange?(handler: (visible: boolean) => void): () => void;
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

export function renderDock(dock: DockHandle): void {
  let activeTab: TrackerTabId = "overview";

  const descriptions: Record<TrackerTabId, string> = {
    overview: "Overview surface is empty in Phase 1.",
    people: "People surface is empty in Phase 1.",
    agency: "Agency surface is empty in Phase 1.",
    relationships: "Relationships surface is empty in Phase 1.",
    world: "World surface is empty in Phase 1.",
    timeline: "Timeline surface is empty in Phase 1.",
    inspector: "Inspector surface is empty in Phase 1.",
  };

  function update(): void {
    dock.root.innerHTML = `
      <section class="lwe-shell">
        <h2>Tracker</h2>
        <div class="lwe-chip-row">
          ${TRACKER_TABS.map(
            (tab, index) => `
              <button
                type="button"
                data-dock-tab="${tab.id}"
                ${index === 0 ? 'data-dock-focus="true"' : ""}
                aria-pressed="${String(tab.id === activeTab)}"
              >
                ${tab.label}
              </button>
            `,
          ).join("")}
        </div>
        <p>${descriptions[activeTab]}</p>
        <p>Decision Trace remains hidden until Debug is enabled.</p>
      </section>
    `;

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

function focusDock(dock: DockHandle): void {
  dock.root
    .querySelector<HTMLElement>('button[data-dock-tab][aria-pressed="true"]')
    ?.focus();
}

export function createDockOpener(dock: DockHandle): {
  open(): void;
  destroy(): void;
} {
  let awaitingVisibleFocus = false;
  const unsubscribe = dock.onVisibilityChange?.((visible) => {
    if (!visible || !awaitingVisibleFocus) {
      return;
    }
    awaitingVisibleFocus = false;
    focusDock(dock);
  });

  return {
    open() {
      const wasCollapsed = dock.isCollapsed?.() ?? true;
      dock.expand();
      if (wasCollapsed) {
        awaitingVisibleFocus = true;
        queueMicrotask(() => {
          if (dock.isCollapsed?.() === false) {
            awaitingVisibleFocus = false;
            focusDock(dock);
          }
        });
        return;
      }
      focusDock(dock);
    },
    destroy() {
      unsubscribe?.();
    },
  };
}
