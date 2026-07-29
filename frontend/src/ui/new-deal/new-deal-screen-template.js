export function newDealScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="new-deal">
          <header class="detail-header new-deal-header">
            <button class="icon-button ghost" type="button" data-nav="conversations" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">Private Deal Room</p>
              <h1 class="detail-title">Start a private deal</h1>
              <p class="new-deal-header-copy">Invite a counterparty first. VEIL opens the private room only when both identities are ready.</p>
            </div>
          </header>

          <div class="detail-content new-deal-content">
            <nav class="new-deal-journey" aria-label="Private deal setup">
              <div class="new-deal-journey-step active">
                <span>1</span>
                <small>Identity</small>
              </div>
              <i data-lucide="chevron-right" class="size-4"></i>
              <div class="new-deal-journey-step">
                <span>2</span>
                <small>Invite</small>
              </div>
              <i data-lucide="chevron-right" class="size-4"></i>
              <div class="new-deal-journey-step">
                <span>3</span>
                <small>Private room</small>
              </div>
            </nav>

            <section class="new-deal-panel new-deal-primary-panel">
              <div class="new-deal-heading">
                <span class="new-deal-icon"><i data-lucide="shield-plus" class="size-5"></i></span>
                <div>
                  <p class="new-deal-step-label">Step 1</p>
                  <h2>Find your counterparty</h2>
                  <p>Use a .stark name or Starknet address. VEIL checks identity and private readiness before opening a room.</p>
                </div>
              </div>

              <div class="privacy-gate-card">
                <i data-lucide="shield-check" class="size-5"></i>
                <div>
                  <strong>Private by default</strong>
                  <small>No message or deal channel is created during this lookup.</small>
                </div>
              </div>

              <label class="field">
                <span>Deal name</span>
                <input id="new-deal-title" type="text" value="Rights Transfer" placeholder="What is this deal about?" />
              </label>

              <label class="field">
                <span>Counterparty</span>
                <div class="search-field new-deal-search">
                  <i data-lucide="search" class="size-4"></i>
                  <input id="new-deal-counterparty" type="search" value="bob.stark" placeholder="bob.stark or 0x04..." autocomplete="off" />
                </div>
              </label>

              <article class="counterparty-result">
                <span class="avatar">B</span>
                <div>
                  <strong id="counterparty-result-name">bob.stark</strong>
                  <small id="counterparty-result-detail">Checking Starknet identity and private readiness...</small>
                </div>
                <span id="counterparty-result-status" class="status-pill public">Checking</span>
              </article>

              <p id="counterparty-action-hint" class="plain-note compact new-deal-action-hint">
                Identity lookup only. Nothing is sent until you choose Invite.
              </p>

              <button id="new-deal-primary-action" class="primary-action w-full new-deal-primary-cta" type="button" disabled aria-disabled="true">
                <i data-lucide="loader-circle" class="size-5"></i>
                <span>Checking private readiness</span>
              </button>
            </section>

            <section class="new-deal-panel new-deal-invite-panel">
              <div class="new-deal-heading">
                <span class="new-deal-icon muted"><i data-lucide="send" class="size-5"></i></span>
                <div>
                  <p class="new-deal-step-label">Invite first</p>
                  <h2>They are not on VEIL yet?</h2>
                  <p>Send an onboarding link. They connect Ready Wallet, complete Privacy Pool readiness, then the private room can open.</p>
                </div>
              </div>

              <button id="show-invite-form" class="secondary-action w-full" type="button" data-new-deal-action="show-invite" aria-disabled="false">
                <i data-lucide="mail-plus" class="size-5"></i>
                <span>Create onboarding invite</span>
              </button>

              <div id="invite-form-panel" class="invite-form-panel" hidden>
                <label class="field">
                  <span>Counterparty or contact</span>
                  <input id="invite-target" type="text" value="bob.stark" placeholder="Name, .stark, or wallet address" />
                </label>
                <div class="invite-explainer">
                  <i data-lucide="link-2" class="size-4"></i>
                  <p>The link opens VEIL onboarding. It does not expose messages and does not create a private deal yet.</p>
                </div>
                <div class="offer-form-actions">
                  <button class="secondary-action" type="button" data-new-deal-action="cancel-invite">Cancel</button>
                  <button class="primary-action" type="button" data-new-deal-action="invite">
                    <i data-lucide="copy" class="size-5"></i>
                    <span>Create & copy invite</span>
                  </button>
                </div>
              </div>
            </section>

            <section class="new-deal-flow">
              <div>
                <p class="new-deal-step-label">How it works</p>
                <h2 class="section-title">From invite to private room</h2>
              </div>
              <ol>
                <li class="complete"><span>1</span><strong>Choose a counterparty identity</strong></li>
                <li><span>2</span><strong>Share the VEIL onboarding link</strong></li>
                <li><span>3</span><strong>Counterparty connects Ready Wallet</strong></li>
                <li><span>4</span><strong>VEIL verifies private readiness</strong></li>
                <li><span>5</span><strong>Open the private Deal Room</strong></li>
              </ol>
            </section>
          </div>
        </section>

`;
}
