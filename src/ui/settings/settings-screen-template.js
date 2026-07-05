export function settingsScreenMarkup() {
  return `
        <section class="screen hidden" data-screen="settings">
          <header class="surface-header">
            <p class="eyebrow">VEIL</p>
            <h1 class="page-title">Settings</h1>
            <p class="page-subtitle">App preferences, privacy, security, and account controls</p>
          </header>
          <div class="content-with-nav settings-page">
            <section class="settings-list" aria-labelledby="settings-privacy-heading">
              <h2 id="settings-privacy-heading">Privacy</h2>
              <div class="wallet-setting-row">
                <span>
                  <strong>Default Privacy Mode</strong>
                  <small>Choose the default mode for payments and deal actions</small>
                </span>
                <div class="segmented compact">
                  <button class="active" type="button" data-default-privacy="shield">Shield</button>
                  <button type="button" data-default-privacy="unshield">Unshield</button>
                </div>
              </div>
              <label class="setting-row">
                <span class="setting-copy">
                  <strong>Always ask before Unshield</strong>
                  <small>Confirm before any public-mode action</small>
                </span>
                <input class="switch-input" type="checkbox" checked data-setting-toggle="ask-unshield" />
              </label>
              <label class="setting-row">
                <span class="setting-copy">
                  <strong>Require AI before Direct Payment</strong>
                  <small>Block direct payment until AI review is attached</small>
                </span>
                <input class="switch-input" type="checkbox" checked data-setting-toggle="require-memo" />
              </label>
              <label class="setting-row">
                <span class="setting-copy">
                  <strong>Show Proof after Settlement</strong>
                  <small>Open settlement proof when a deal completes</small>
                </span>
                <input class="switch-input" type="checkbox" checked data-setting-toggle="show-proof" />
              </label>
            </section>

            <section class="settings-list" aria-labelledby="settings-notifications-heading">
              <h2 id="settings-notifications-heading">Notifications</h2>
              <label class="setting-row"><span class="setting-copy"><strong>New Message</strong><small>Encrypted channel messages</small></span><input class="switch-input" type="checkbox" checked data-setting-toggle="new-message" /></label>
              <label class="setting-row"><span class="setting-copy"><strong>New Offer</strong><small>Offer and counter-offer updates</small></span><input class="switch-input" type="checkbox" checked data-setting-toggle="new-offer" /></label>
              <label class="setting-row"><span class="setting-copy"><strong>Escrow Updates</strong><small>Deposit, release, and dispute changes</small></span><input class="switch-input" type="checkbox" checked data-setting-toggle="escrow-updates" /></label>
              <label class="setting-row"><span class="setting-copy"><strong>Payment Updates</strong><small>Payment review and send events</small></span><input class="switch-input" type="checkbox" checked data-setting-toggle="payment-updates" /></label>
              <label class="setting-row"><span class="setting-copy"><strong>Settlement Completed</strong><small>Completed deal and proof notifications</small></span><input class="switch-input" type="checkbox" checked data-setting-toggle="settlement-completed" /></label>
            </section>

            <section class="settings-list" aria-labelledby="settings-security-heading">
              <h2 id="settings-security-heading">Security</h2>
              <button class="wallet-action-row" type="button" data-export-viewing-key><span><i data-lucide="key-round" class="size-5"></i></span><strong>Export Viewing Key</strong><i data-lucide="chevron-right" class="size-5"></i></button>
              <button class="wallet-action-row" type="button" data-backup-recovery><span><i data-lucide="shield-check" class="size-5"></i></span><strong>Recovery Kit</strong><i data-lucide="chevron-right" class="size-5"></i></button>
              <button class="wallet-action-row" type="button" data-session-management><span><i data-lucide="monitor-check" class="size-5"></i></span><strong>Active Sessions</strong><i data-lucide="chevron-right" class="size-5"></i></button>
            </section>

            <section class="settings-list" aria-labelledby="settings-wallet-heading">
              <h2 id="settings-wallet-heading">Wallet</h2>
              <div class="setting-row">
                <span class="setting-copy">
                  <strong>Connected Wallet</strong>
                  <small id="settings-wallet-address">Not connected</small>
                </span>
                <span id="settings-wallet-status" class="status-pill public">Disconnected</span>
              </div>
              <button class="wallet-action-row" type="button" data-connect-wallet><span><i data-lucide="repeat-2" class="size-5"></i></span><strong>Switch Wallet</strong><i data-lucide="chevron-right" class="size-5"></i></button>
              <button class="wallet-action-row" type="button" data-disconnect-wallet><span><i data-lucide="unlink" class="size-5"></i></span><strong>Disconnect Wallet</strong><i data-lucide="chevron-right" class="size-5"></i></button>
            </section>

            <section class="settings-list" aria-labelledby="settings-about-heading">
              <h2 id="settings-about-heading">About</h2>
              <div class="setting-row"><span class="setting-copy"><strong>VEIL Version</strong><small>0.1.0 prototype</small></span><span class="status-pill public">Testnet</span></div>
              <div class="setting-row"><span class="setting-copy"><strong>Privacy Pool Status</strong><small>Starknet Privacy Pool integration boundary</small></span><span class="status-pill waiting-deposit">Research</span></div>
              <button class="wallet-action-row" type="button" data-settings-info="terms"><span><i data-lucide="file-text" class="size-5"></i></span><strong>Terms of Service</strong><i data-lucide="chevron-right" class="size-5"></i></button>
              <button class="wallet-action-row" type="button" data-settings-info="privacy"><span><i data-lucide="lock-keyhole" class="size-5"></i></span><strong>Privacy Policy</strong><i data-lucide="chevron-right" class="size-5"></i></button>
            </section>

            <section class="settings-list danger-zone" aria-labelledby="settings-danger-heading">
              <h2 id="settings-danger-heading">Danger Zone</h2>
              <button class="wallet-action-row danger" type="button" data-wallet-logout><span><i data-lucide="log-out" class="size-5"></i></span><strong>Log Out</strong><i data-lucide="chevron-right" class="size-5"></i></button>
              <button class="wallet-action-row danger" type="button" data-disconnect-sessions><span><i data-lucide="ban" class="size-5"></i></span><strong>Disconnect All Sessions</strong><i data-lucide="chevron-right" class="size-5"></i></button>
              <button class="wallet-action-row danger" type="button" data-clear-veil-cache><span><i data-lucide="trash-2" class="size-5"></i></span><strong>Delete Local Cache</strong><i data-lucide="chevron-right" class="size-5"></i></button>
            </section>
          </div>
        </section>

`;
}

