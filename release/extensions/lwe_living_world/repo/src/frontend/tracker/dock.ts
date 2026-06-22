type DockHandle = {
  root: HTMLElement;
  expand(): void;
};

export function renderDock(dock: DockHandle): void {
  dock.root.innerHTML = `
    <section class="lwe-shell">
      <h2 tabindex="-1" data-dock-focus>Tracker</h2>
      <div class="lwe-chip-row">
        <span>Overview</span>
        <span>People</span>
        <span>Agency</span>
        <span>Relationships</span>
        <span>World</span>
        <span>Timeline</span>
        <span>Inspector</span>
      </div>
      <p>Decision Trace remains hidden until Debug is enabled.</p>
    </section>
  `;
}

export function createDockOpener(dock: DockHandle): () => void {
  let expanded = false;
  return () => {
    dock.expand();
    if (expanded) {
      dock.root.querySelector<HTMLElement>("[data-dock-focus]")?.focus();
    }
    expanded = true;
  };
}
