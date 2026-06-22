type DrawerHandle = {
  root: HTMLElement;
};

const DRAWER_TABS = [
  { id: "general", label: "General" },
  { id: "simulation", label: "Simulation" },
  { id: "sidecar", label: "Sidecar" },
  { id: "prompts", label: "Prompts" },
  { id: "debug", label: "Debug" },
  { id: "data", label: "Data" },
  { id: "about", label: "About" },
] as const;

type DrawerTabId = (typeof DRAWER_TABS)[number]["id"];

export function renderDrawer(drawer: DrawerHandle): void {
  let activeTab: DrawerTabId = "general";

  const descriptions: Record<DrawerTabId, string> = {
    general: "General settings are not wired in Phase 1.",
    simulation: "Simulation controls are not wired in Phase 1.",
    sidecar: "Sidecar configuration is not wired in Phase 1.",
    prompts: "Prompt editors are not wired in Phase 1.",
    debug: "Debug controls are not wired in Phase 1.",
    data: "Data tools are not wired in Phase 1.",
    about: "About content is not wired in Phase 1.",
  };

  const captions: Record<DrawerTabId, string> = {
    general: "Extension enablement and startup defaults will live here.",
    simulation: "Operation mode and tracker behavior settings will live here.",
    sidecar: "Model, timeout, and fallback settings will live here.",
    prompts: "Prompt assets and dry-run tools will live here.",
    debug: "Tracing, retention, and diagnostics controls will live here.",
    data: "Import, export, migrations, and reset tools will live here.",
    about: "Version, permissions, and docs links will live here.",
  };

  function update(): void {
    drawer.root.innerHTML = `
      <section class="lwe-shell lwe-settings-shell">
        <header class="lwe-shell-header">
          <div>
            <p class="lwe-kicker">Settings</p>
            <h2>Living World Engine</h2>
          </div>
        </header>
        <div class="lwe-tabstrip" role="tablist" aria-label="LWE settings sections">
          ${DRAWER_TABS.map(
            (tab) => `
              <button
                type="button"
                class="lwe-tab"
                data-drawer-tab="${tab.id}"
                aria-pressed="${String(tab.id === activeTab)}"
              >
                ${tab.label}
              </button>
            `,
          ).join("")}
        </div>
        <section class="lwe-panel-body">
          <p class="lwe-kicker">${DRAWER_TABS.find((tab) => tab.id === activeTab)?.label ?? "Settings"}</p>
          <p>${descriptions[activeTab]}</p>
          <p class="lwe-muted">${captions[activeTab]}</p>
        </section>
      </section>
    `;

    for (const button of drawer.root.querySelectorAll<HTMLButtonElement>(
      "button[data-drawer-tab]",
    )) {
      button.addEventListener("click", () => {
        const nextTab = button.getAttribute("data-drawer-tab");
        if (!nextTab || nextTab === activeTab) {
          return;
        }
        activeTab = nextTab as DrawerTabId;
        update();
      });
    }
  }

  update();
}
