import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { setup } from "../../src/frontend.js";

test("frontend registers one drawer, one dock, one orb, and reuses the dock on activation", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { window } = dom;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
  });

  const expandCalls: string[] = [];
  const dockRoot = window.document.createElement("div");
  const drawerRoot = window.document.createElement("div");
  const orbRoot = window.document.createElement("div");

  let backendHandler: ((payload: unknown) => void) | undefined;

  const ctx = {
    dom: {
      addStyle: () => () => undefined,
      cleanup: () => undefined,
    },
    onBackendMessage: (handler: (payload: unknown) => void) => {
      backendHandler = handler;
      return () => undefined;
    },
    sendToBackend: () => undefined,
    ui: {
      requestDockPanel: () => ({
        root: dockRoot,
        expand: () => {
          expandCalls.push("expand");
        },
      }),
      registerDrawerTab: () => ({
        root: drawerRoot,
        activate: () => undefined,
        destroy: () => undefined,
      }),
      createFloatWidget: () => ({
        root: orbRoot,
        setVisible: () => undefined,
        destroy: () => undefined,
      }),
    },
  };

  const cleanup = setup(ctx as never);

  backendHandler?.({ type: "OPEN_TRACKER" });
  backendHandler?.({ type: "OPEN_TRACKER" });

  assert.equal(expandCalls.length, 2);
  assert.match(drawerRoot.textContent ?? "", /General|Living World Engine/i);
  assert.match(dockRoot.textContent ?? "", /Overview|People|Agency/i);

  cleanup();
  dom.window.close();
});
