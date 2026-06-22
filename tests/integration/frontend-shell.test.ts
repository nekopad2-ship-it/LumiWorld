import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { setup } from "../../src/frontend.js";

test("frontend registers one drawer, one tracker overlay, one orb, and toggles the tracker overlay on activation", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { window } = dom;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
  });

  const visibilityCalls: boolean[] = [];
  const backendMessages: unknown[] = [];
  const trackerRoot = window.document.createElement("div");
  const drawerRoot = window.document.createElement("div");
  const orbRoot = window.document.createElement("div");
  window.document.body.append(trackerRoot, drawerRoot, orbRoot);
  let overlayVisible = false;
  let dockPanelCalls = 0;
  let appMountCalls = 0;

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
    sendToBackend: (payload: unknown) => {
      backendMessages.push(payload);
    },
    getActiveChat: () => ({
      chatId: "chat-1",
      characterId: "char-1",
    }),
    ui: {
      requestDockPanel: () => {
        dockPanelCalls += 1;
        return {
          root: window.document.createElement("div"),
          expand: () => undefined,
          collapse: () => undefined,
          isCollapsed: () => true,
          destroy: () => undefined,
          onVisibilityChange: () => () => undefined,
        };
      },
      mountApp: () => {
        appMountCalls += 1;
        return {
          root: trackerRoot,
          setVisible: (visible: boolean) => {
            overlayVisible = visible;
            visibilityCalls.push(visible);
          },
          destroy: () => undefined,
        };
      },
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

  assert.deepEqual(backendMessages[0], {
    type: "REQUEST_BOOTSTRAP",
    chatId: "chat-1",
  });
  assert.equal(dockPanelCalls, 0);
  assert.equal(appMountCalls, 1);
  assert.equal(
    trackerRoot.querySelectorAll<HTMLButtonElement>("button[data-dock-tab]")
      .length,
    7,
  );
  assert.equal(
    drawerRoot.querySelectorAll<HTMLButtonElement>("button[data-drawer-tab]")
      .length,
    7,
  );
  assert.ok(
    trackerRoot.querySelector<HTMLButtonElement>(
      'button[data-dock-action="close"]',
    ),
  );
  assert.equal(overlayVisible, false);

  trackerRoot
    .querySelector<HTMLButtonElement>('button[data-dock-tab="people"]')
    ?.click();
  assert.equal(
    trackerRoot
      .querySelector<HTMLButtonElement>('button[data-dock-tab="people"]')
      ?.getAttribute("aria-pressed"),
    "true",
  );
  assert.match(
    trackerRoot.textContent ?? "",
    /People surface is empty in Phase 1/i,
  );

  drawerRoot
    .querySelector<HTMLButtonElement>('button[data-drawer-tab="debug"]')
    ?.click();
  assert.equal(
    drawerRoot
      .querySelector<HTMLButtonElement>('button[data-drawer-tab="debug"]')
      ?.getAttribute("aria-pressed"),
    "true",
  );
  assert.match(
    drawerRoot.textContent ?? "",
    /Debug controls are not wired in Phase 1/i,
  );

  orbRoot.querySelector<HTMLButtonElement>("button")?.click();
  await Promise.resolve();

  assert.equal(backendMessages.length, 1);
  assert.equal(
    window.document.activeElement?.getAttribute("data-dock-tab"),
    "people",
  );
  assert.equal(overlayVisible, true);
  assert.deepEqual(visibilityCalls, [false, true]);

  orbRoot.querySelector<HTMLButtonElement>("button")?.click();
  await Promise.resolve();
  assert.equal(overlayVisible, false);

  trackerRoot
    .querySelector<HTMLButtonElement>('button[data-dock-action="close"]')
    ?.click();
  await Promise.resolve();
  assert.equal(overlayVisible, false);

  backendHandler?.({ type: "OPEN_TRACKER" });
  await Promise.resolve();

  assert.equal(overlayVisible, true);
  assert.deepEqual(visibilityCalls, [false, true, false, false, true]);
  assert.match(drawerRoot.textContent ?? "", /General|Living World Engine/i);
  assert.match(trackerRoot.textContent ?? "", /Overview|People|Agency/i);

  cleanup();
  dom.window.close();
});
