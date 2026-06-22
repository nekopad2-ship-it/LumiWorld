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
  const collapseCalls: string[] = [];
  const backendMessages: unknown[] = [];
  const dockRoot = window.document.createElement("div");
  const drawerRoot = window.document.createElement("div");
  const orbRoot = window.document.createElement("div");
  window.document.body.append(dockRoot, drawerRoot, orbRoot);
  let collapsed = true;

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
      requestDockPanel: () => ({
        root: dockRoot,
        expand: () => {
          collapsed = false;
          expandCalls.push("expand");
        },
        collapse: () => {
          collapsed = true;
          collapseCalls.push("collapse");
        },
        isCollapsed: () => collapsed,
        destroy: () => undefined,
        onVisibilityChange: () => () => undefined,
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

  assert.deepEqual(backendMessages[0], {
    type: "REQUEST_BOOTSTRAP",
    chatId: "chat-1",
  });
  assert.equal(
    dockRoot.querySelectorAll<HTMLButtonElement>("button[data-dock-tab]")
      .length,
    7,
  );
  assert.equal(
    drawerRoot.querySelectorAll<HTMLButtonElement>("button[data-drawer-tab]")
      .length,
    7,
  );
  assert.ok(
    dockRoot.querySelector<HTMLButtonElement>(
      'button[data-dock-action="close"]',
    ),
  );

  dockRoot
    .querySelector<HTMLButtonElement>('button[data-dock-tab="people"]')
    ?.click();
  assert.equal(
    dockRoot
      .querySelector<HTMLButtonElement>('button[data-dock-tab="people"]')
      ?.getAttribute("aria-pressed"),
    "true",
  );
  assert.match(
    dockRoot.textContent ?? "",
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
  assert.equal(expandCalls.length, 1);
  assert.equal(collapsed, false);

  orbRoot.querySelector<HTMLButtonElement>("button")?.click();
  await Promise.resolve();
  assert.equal(collapseCalls.length, 1);
  assert.equal(collapsed, true);

  dockRoot
    .querySelector<HTMLButtonElement>('button[data-dock-action="close"]')
    ?.click();
  await Promise.resolve();
  assert.equal(collapseCalls.length, 2);
  assert.equal(collapsed, true);

  backendHandler?.({ type: "OPEN_TRACKER" });
  await Promise.resolve();

  assert.equal(expandCalls.length, 2);
  assert.match(drawerRoot.textContent ?? "", /General|Living World Engine/i);
  assert.match(dockRoot.textContent ?? "", /Overview|People|Agency/i);

  cleanup();
  dom.window.close();
});
