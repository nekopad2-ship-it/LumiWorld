import type { FrontendSettings } from "../../shared/types/lwe.js";

type OrbHandle = {
  root: HTMLElement;
  setVisible(visible: boolean): void;
  destroy(): void;
};

export function renderOrb(input: {
  orb: OrbHandle;
  settings: FrontendSettings;
  onOpen(): void;
}): void {
  input.orb.root.innerHTML = `
    <button class="lwe-orb" type="button">
      <strong>LWE</strong>
      <span>Foundation active</span>
    </button>
  `;
  input.orb.root
    .querySelector<HTMLButtonElement>("button")
    ?.addEventListener("click", () => {
      input.onOpen();
    });
  input.orb.setVisible(input.settings.orbVisible);
}
