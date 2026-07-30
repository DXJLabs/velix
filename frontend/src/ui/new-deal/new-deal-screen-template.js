export function newDealScreenMarkup() {
  return `
        <section class="screen hidden veil-soft-screen" data-screen="new-deal">
          <header class="detail-header veil-soft-header">
            <button class="icon-button ghost" type="button" data-nav="conversations" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">Private deal</p>
              <h1 class="detail-title">Start a new deal</h1>
              <p class="veil-soft-subtitle">Invite one person. The room stays closed until both sides are ready.</p>
            </div>
          </header>

          <div class="detail-content veil-deal-shell">
            <section id="incoming-invite-panel" class="veil-invite-review" hidden>
              <div class="veil-invite-hero">
                <span class="veil-invite-hero-icon">
                  <i data-lucide="shield-check" class="size-6"></i>
                </span>
                <p>Private invitation</p>
                <h2 id="incoming-invite-title">Private Deal</h2>
                <span>Review the invitation before connecting your wallet.</span>
              </div>

              <div class="veil-invite-summary">
                <div>
                  <span>Invited by</span>
                  <strong id="incoming-invite-inviter">VEIL counterparty</strong>
                </div>
                <div>
                  <span>Network</span>
                  <strong>Starknet Sepolia</strong>
                </div>
                <div>
                  <span>Room</span>
                  <strong id="incoming-invite-room">Checking...</strong>
                </div>
              </div>

              <div class="veil-trust-list" aria-label="Invite safety information">
                <span><i data-lucide="circle-check" class="size-4"></i>No payment requested</span>
                <span><i data-lucide="circle-check" class="size-4"></i>No funds move when joining</span>
                <span><i data-lucide="circle-check" class="size-4"></i>Never share your seed phrase</span>
              </div>

              <button id="accept-incoming-invite-button" class="primary-action veil-primary-button" type="button" data-accept-incoming-invite>
                <i data-lucide="arrow-right" class="size-5"></i>
                <span>Review & join with Ready</span>
              </button>

              <p class="veil-safety-note">
                VEIL will only ask Ready Wallet to connect. Joining this room does not approve a payment or token transfer.
              </p>
            </section>

            <section class="new-deal-primary-panel veil-create-card">
              <div class="veil-create-heading">
                <span class="veil-create-icon">
                  <i data-lucide="message-circle-lock" class="size-5"></i>
                </span>
                <div>
                  <h2>Create a private room</h2>
                  <p>Add a name and choose who you want to invite.</p>
                </div>
              </div>

              <label class="field veil-field">
                <span>Deal name</span>
                <input id="new-deal-title" type="text" value="Rights Transfer" placeholder="e.g. Rights transfer" />
              </label>

              <label class="field veil-field">
                <span>Counterparty</span>
                <div class="search-field new-deal-search">
                  <i data-lucide="search" class="size-4"></i>
                  <input id="new-deal-counterparty" type="search" value="bob.stark" placeholder="bob.stark or 0x..." autocomplete="off" />
                </div>
              </label>

              <article class="counterparty-result veil-counterparty-result">
                <span class="avatar">B</span>
                <div>
                  <strong id="counterparty-result-name">bob.stark</strong>
                  <small id="counterparty-result-detail">Checking this identity...</small>
                </div>
                <span id="counterparty-result-status" class="status-pill public">Checking</span>
              </article>

              <p id="counterparty-action-hint" class="veil-friendly-hint">
                Nothing is sent until you create the invite.
              </p>

              <button id="new-deal-primary-action" class="primary-action veil-primary-button" type="button" disabled aria-disabled="true">
                <span class="veil-button-spinner" aria-hidden="true"></span>
                <span>Checking recipient</span>
              </button>

              <div class="veil-trust-footer">
                <i data-lucide="shield-check" class="size-4"></i>
                <span>You can review the invite before sharing it.</span>
              </div>
            </section>
          </div>
        </section>

`;
}
