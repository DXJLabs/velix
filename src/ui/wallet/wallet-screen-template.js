export function walletScreenMarkup() {
  return `
        <section class="screen hidden" data-screen="wallet">
          <header class="surface-header">
            <p class="eyebrow">VEIL</p>
            <h1 class="page-title">Wallet</h1>
            <p class="page-subtitle">Wallet identity and Starknet connection</p>
          </header>
          <div class="content-with-nav wallet-page">
            <section class="wallet-card" aria-labelledby="wallet-status-heading">
              <div class="wallet-card-top">
                <span class="wallet-icon">
                  <i data-lucide="wallet-cards" class="size-5"></i>
                </span>
                <span id="wallet-status-pill" class="status-pill public">Required</span>
              </div>
              <h2 id="wallet-status-heading">Wallet Status</h2>
              <strong id="wallet-state-title">Connect wallet</strong>
              <small id="wallet-state-subtitle">Use Privy to unlock VEIL on this device.</small>
            </section>

            <section class="plain-list wallet-readiness" aria-label="Wallet identity">
              <div>
                <span>Provider</span>
                <strong id="wallet-provider">Privy</strong>
              </div>
              <div>
                <span>Address</span>
                <button class="copy-value" type="button" data-copy-wallet aria-label="Copy wallet address">
                  <strong id="wallet-account">Not connected</strong>
                  <i data-lucide="copy" class="size-4"></i>
                </button>
              </div>
              <div>
                <span>Network</span>
                <strong id="wallet-network">Starknet Sepolia</strong>
              </div>
              <div>
                <span>Helper Status</span>
                <strong id="wallet-helper">Check required</strong>
              </div>
            </section>

            <section class="wallet-section wallet-assets" aria-labelledby="wallet-assets-heading">
              <h2 id="wallet-assets-heading">Assets</h2>
              <div class="wallet-asset-row" data-wallet-asset="strk">
                <span class="wallet-asset-icon navy">S</span>
                <span class="wallet-asset-copy">
                  <strong>STRK</strong>
                  <small>Starknet Token</small>
                </span>
                <span class="wallet-asset-value">
                  <strong id="wallet-asset-strk-balance">--</strong>
                  <small id="wallet-asset-strk-detail">Connect wallet</small>
                </span>
              </div>
              <div class="wallet-asset-row" data-wallet-asset="usdt">
                <span class="wallet-asset-icon">U</span>
                <span class="wallet-asset-copy">
                  <strong>USDT</strong>
                  <small>Tether USD</small>
                </span>
                <span class="wallet-asset-value">
                  <strong id="wallet-asset-usdt-balance">--</strong>
                  <small id="wallet-asset-usdt-detail">Connect wallet</small>
                </span>
              </div>
              <div class="wallet-asset-row" data-wallet-asset="strkbtc">
                <span class="wallet-asset-icon dark">B</span>
                <span class="wallet-asset-copy">
                  <strong>STRKBTC</strong>
                  <small>Starknet BTC</small>
                </span>
                <span class="wallet-asset-value">
                  <strong id="wallet-asset-strkbtc-balance">--</strong>
                  <small id="wallet-asset-strkbtc-detail">Connect wallet</small>
                </span>
              </div>
              <button class="wallet-action-row" type="button" data-wallet-deposit-copy>
                <span><i data-lucide="copy" class="size-5"></i></span>
                <strong>Copy Deposit Address</strong>
                <i data-lucide="chevron-right" class="size-5"></i>
              </button>
            </section>

            <section class="wallet-section wallet-rewards" aria-labelledby="wallet-rewards-heading">
              <h2 id="wallet-rewards-heading">Rewards</h2>
              <div class="wallet-rewards-summary">
                <div>
                  <span>VEIL Points</span>
                  <strong id="wallet-reward-points">4,580 pts</strong>
                </div>
                <div>
                  <span>Next Tier</span>
                  <strong id="wallet-reward-tier">Gold</strong>
                  <small id="wallet-reward-remaining">+420 pts remaining</small>
                </div>
              </div>
              <p class="wallet-reward-note">Points are loyalty rewards. They are not tokens and are not tradable.</p>
              <div class="wallet-reward-subsection">
                <h3>Recent Rewards</h3>
                <ol id="wallet-recent-rewards" class="reward-list"></ol>
              </div>
              <div class="wallet-reward-subsection">
                <h3>Rewards History</h3>
                <ol id="wallet-rewards-history" class="reward-list"></ol>
              </div>
            </section>

            <section class="wallet-section" aria-labelledby="wallet-connection-heading">
              <h2 id="wallet-connection-heading">Connection</h2>
              <div class="wallet-setting-row">
                <span>
                  <strong>Current Connection</strong>
                  <small id="wallet-connection-summary">Privy wallet not connected</small>
                </span>
                <span id="wallet-connection-status" class="status-pill public">Disconnected</span>
              </div>
              <button class="wallet-action-row" type="button" data-connect-wallet data-wallet-connect-row>
                <span><i data-lucide="wallet-cards" class="size-5"></i></span>
                <strong data-wallet-label>Connect Wallet</strong>
                <i data-lucide="chevron-right" class="size-5"></i>
              </button>
              <button class="wallet-action-row" type="button" data-refresh-wallet>
                <span><i data-lucide="refresh-cw" class="size-5"></i></span>
                <strong>Refresh Connection</strong>
                <i data-lucide="chevron-right" class="size-5"></i>
              </button>
              <button class="wallet-action-row" type="button" data-nav="settings" data-wallet-settings-row hidden>
                <span><i data-lucide="settings" class="size-5"></i></span>
                <strong>Manage Wallet Settings</strong>
                <i data-lucide="chevron-right" class="size-5"></i>
              </button>
            </section>
          </div>
        </section>

`;
}

