import type { SpindleFrontendContext } from "lumiverse-spindle-types";

import { isBackendToFrontendMessage } from "./shared/contracts/frontend-messages.js";
import { renderOrb } from "./frontend/components/orb.js";
import { renderDrawer } from "./frontend/settings/drawer.js";
import { createDockController, renderDock } from "./frontend/tracker/dock.js";
import { createFrontendViewModel } from "./frontend/state/view-model.js";

export function setup(ctx: SpindleFrontendContext): () => void {
  const removeStyle = ctx.dom.addStyle(styles);
  const viewModel = createFrontendViewModel();
  const activeChat = ctx.getActiveChat();

  const dock = ctx.ui.requestDockPanel({
    edge: "right",
    title: "Living World Engine",
    size: 320,
    minSize: 260,
    maxSize: 480,
    resizable: true,
    startCollapsed: true,
  });
  const drawer = ctx.ui.registerDrawerTab({
    id: "lwe_settings",
    title: "Living World Engine",
    shortName: "LWE",
    description: "Living World Engine settings and diagnostics.",
    headerTitle: "Living World Engine",
  });
  const orb = ctx.ui.createFloatWidget({
    width: 180,
    height: 88,
    initialPosition: viewModel.settings.orbPosition,
    tooltip: "Living World Engine",
    chromeless: true,
  });

  renderDrawer(drawer);
  renderDock(dock);

  const dockController = createDockController(dock);
  renderOrb({
    orb,
    settings: viewModel.settings,
    onToggle: () => {
      dockController.toggle();
    },
  });

  const unsubscribe = ctx.onBackendMessage((payload) => {
    if (!isBackendToFrontendMessage(payload)) {
      return;
    }
    if (payload.type === "OPEN_TRACKER") {
      dockController.open();
      return;
    }
    if (payload.type === "BOOTSTRAP_STATE") {
      viewModel.settings = payload.settings;
      orb.setVisible(viewModel.settings.orbVisible);
    }
  });

  ctx.sendToBackend({
    type: "REQUEST_BOOTSTRAP",
    chatId: activeChat.chatId,
  });

  return () => {
    unsubscribe();
    orb.destroy();
    dockController.destroy();
    dock.destroy();
    drawer.destroy();
    removeStyle();
    ctx.dom.cleanup();
  };
}

const styles = `
  .lwe-shell {
    padding: 14px;
    color: var(--lumiverse-text);
    background: var(--lumiverse-fill-subtle);
    border-radius: var(--lumiverse-radius);
    border: 1px solid var(--lumiverse-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .lwe-shell h2,
  .lwe-shell p {
    margin: 0;
  }

  .lwe-shell-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .lwe-kicker {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--lumiverse-text-dim, var(--lumiverse-text-muted, var(--lumiverse-text)));
  }

  .lwe-muted {
    color: var(--lumiverse-text-dim, var(--lumiverse-text-muted, var(--lumiverse-text)));
  }

  .lwe-tabstrip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lwe-tab,
  .lwe-tracker-rail-button,
  .lwe-close-button,
  .lwe-orb {
    border-radius: 999px;
    border: 1px solid var(--lumiverse-border);
    background: var(--lumiverse-fill);
    color: var(--lumiverse-text);
    padding: 6px 10px;
  }

  .lwe-tab,
  .lwe-tracker-rail-button,
  .lwe-close-button {
    cursor: pointer;
  }

  .lwe-tab[aria-pressed="true"],
  .lwe-tracker-rail-button[aria-pressed="true"] {
    background: var(--lumiverse-fill-emphasis);
    border-color: var(--lumiverse-border-strong, var(--lumiverse-border));
  }

  .lwe-settings-shell {
    gap: 14px;
  }

  .lwe-panel-body {
    border-radius: var(--lumiverse-radius);
    border: 1px solid var(--lumiverse-border);
    background: var(--lumiverse-fill);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .lwe-tracker-shell {
    min-height: 100%;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0)),
      var(--lumiverse-fill-subtle);
  }

  .lwe-close-button {
    background: transparent;
  }

  .lwe-tracker-frame {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 12px;
    min-height: 320px;
  }

  .lwe-tracker-rail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .lwe-tracker-rail-button {
    min-height: 48px;
    border-radius: 16px;
    justify-content: flex-start;
    text-align: left;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0)),
      var(--lumiverse-fill);
  }

  .lwe-tracker-rail-label {
    font-size: 13px;
    line-height: 1.15;
  }

  .lwe-tracker-card {
    border-radius: 18px;
    border: 1px solid var(--lumiverse-border);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01)),
      var(--lumiverse-fill);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    box-shadow: -12px 0 30px rgba(0, 0, 0, 0.14);
  }

  .lwe-orb {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    cursor: pointer;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0)),
      var(--lumiverse-fill);
  }

  @media (max-width: 720px) {
    .lwe-tracker-frame {
      grid-template-columns: 1fr;
    }

    .lwe-tracker-rail {
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .lwe-tracker-rail-button {
      min-width: 116px;
      justify-content: center;
      text-align: center;
    }
  }
`;
