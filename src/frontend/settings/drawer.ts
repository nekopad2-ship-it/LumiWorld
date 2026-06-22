type DrawerHandle = {
  root: HTMLElement;
};

export function renderDrawer(drawer: DrawerHandle): void {
  drawer.root.innerHTML = `
    <section class="lwe-shell">
      <h2>Living World Engine</h2>
      <div class="lwe-chip-row">
        <span>General</span>
        <span>Simulation</span>
        <span>Sidecar</span>
        <span>Prompts</span>
        <span>Debug</span>
        <span>Data</span>
        <span>About</span>
      </div>
    </section>
  `;
}
