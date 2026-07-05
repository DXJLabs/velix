export function bottomNavMarkup() {
  return `
      <nav class="bottom-nav" aria-label="Primary navigation">
        <button class="bottom-nav-item active" type="button" data-top-nav="conversations">
          <i data-lucide="network" class="size-5"></i>
          <span>Channels</span>
        </button>
        <button class="bottom-nav-item" type="button" data-top-nav="activity">
          <i data-lucide="bell" class="size-5"></i>
          <span>Activity</span>
        </button>
        <button class="bottom-nav-item" type="button" data-top-nav="wallet">
          <i data-lucide="wallet-cards" class="size-5"></i>
          <span>Wallet</span>
        </button>
        <button class="bottom-nav-item" type="button" data-top-nav="settings">
          <i data-lucide="settings" class="size-5"></i>
          <span>Settings</span>
        </button>
      </nav>

      <div id="toast" class="toast" role="status" aria-live="polite"></div>
`;
}

