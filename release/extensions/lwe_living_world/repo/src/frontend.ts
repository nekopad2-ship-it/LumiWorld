import type { SpindleFrontendContext } from "lumiverse-spindle-types";

import { isBackendToFrontendMessage } from "./shared/contracts/frontend-messages.js";
import { renderOrb } from "./frontend/components/orb.js";
import { renderDrawer } from "./frontend/settings/drawer.js";
import { createDockOpener, renderDock } from "./frontend/tracker/dock.js";
import { createFrontendViewModel } from "./frontend/state/view-model.js";

export function setup(ctx: SpindleFrontendContext): () => void {
  const removeStyle = ctx.dom.addStyle(styles);
  const viewModel = createFrontendViewModel();

  const dock = ctx.ui.requestDockPanel({
    edge: "right",
    title: "Living World Engine",
    size: 320,
    minSize: 260,
    maxSize: 480,
    resizable: true,
    startCollapsed: false,
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

  const openDock = createDockOpener(dock);
  renderOrb({
    orb,
    settings: viewModel.settings,
    onOpen: () => {
      openDock();
      ctx.sendToBackend({ type: "OPEN_TRACKER" });
    },
  });

  const unsubscribe = ctx.onBackendMessage((payload) => {
    if (!isBackendToFrontendMessage(payload)) {
      return;
    }
    if (payload.type === "OPEN_TRACKER") {
      openDock();
      return;
    }
    if (payload.type === "BOOTSTRAP_STATE") {
      viewModel.settings = payload.settings;
      orb.setVisible(viewModel.settings.orbVisible);
    }
  });

  ctx.sendToBackend({ type: "REQUEST_BOOTSTRAP", chatId: null });

  return () => {
    unsubscribe();
    orb.destroy();
    drawer.destroy();
    removeStyle();
    ctx.dom.cleanup();
  };
}

const styles = `
  .lwe-shell {
    padding: 12px;
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

  .lwe-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lwe-chip-row span,
  .lwe-orb {
    border-radius: 999px;
    border: 1px solid var(--lumiverse-border);
    background: var(--lumiverse-fill);
    color: var(--lumiverse-text);
    padding: 6px 10px;
  }

  .lwe-orb {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    cursor: pointer;
  }
`;
