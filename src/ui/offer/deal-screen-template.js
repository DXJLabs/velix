export function dealScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="deal">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="channel" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">Negotiation</p>
              <h1 class="detail-title">Rights Transfer</h1>
            </div>
          </header>
          <div class="detail-content">
            <section class="workflow-progress" data-workflow-progress></section>

            <section id="current-offer-panel" class="deal-proposal-card">
              <div class="proposal-topline">
                <span class="eyebrow">Current Offer</span>
                <span id="deal-status" class="status-pill escrow-active">Escrow Active</span>
              </div>
              <div class="proposal-amount-block">
                <div class="proposal-amount" id="deal-price">450 STRK</div>
                <small id="deal-fiat-estimate">â‰ˆ $315.00</small>
              </div>
              <div class="deal-info-grid">
                <div><span>Deal ID</span><strong id="deal-id">Deal #381</strong></div>
                <div><span>Counterparty</span><strong>Bob</strong></div>
                <div><span>Asset</span><strong>Rights Transfer</strong></div>
                <div><span>Turn</span><strong id="deal-turn-label">Your Decision</strong></div>
                <div><span>Expiration</span><strong>Expires in 24h</strong></div>
              </div>
            </section>

            <section id="create-offer-panel" class="create-offer-panel" hidden>
              <div class="create-offer-heading">
                <div>
                  <p id="create-offer-eyebrow" class="eyebrow">Create Offer</p>
                  <h2 id="create-offer-title">Start negotiation</h2>
                  <small id="create-offer-copy">Define the amount and asset before escrow funding starts.</small>
                </div>
                <span id="create-offer-status" class="status-pill negotiating">Step 1</span>
              </div>
              <div class="create-offer-fields">
                <label class="field">
                  <span>Offer Amount</span>
                  <div class="offer-amount-input">
                    <input id="create-offer-amount" type="text" inputmode="decimal" value="500" aria-label="Offer amount" />
                    <strong>STRK</strong>
                  </div>
                </label>
                <label class="field">
                  <span>Asset</span>
                  <input id="create-offer-asset" type="text" value="Rights Package / NFT" />
                </label>
                <label class="field">
                  <span>Counterparty</span>
                  <input id="create-offer-counterparty" type="text" value="Bob" />
                </label>
                <label class="field">
                  <span>Expiration</span>
                  <input id="create-offer-expiration" type="text" value="24h" />
                </label>
              </div>
              <label class="field">
                <span>Terms</span>
                <textarea id="create-offer-terms" rows="3">Buyer deposits funds, seller deposits the asset. Both remain locked until release.</textarea>
              </label>
              <div class="create-offer-meta">
                <span><i data-lucide="lock-keyhole" class="size-4"></i> Encrypted negotiation</span>
                <small>Total fee shown before signing</small>
              </div>
              <div class="offer-form-actions">
                <button id="create-offer-cancel" class="secondary-action" type="button" data-deal-action="cancel-offer-form" hidden>Cancel</button>
                <button id="create-offer-action" class="primary-action" type="button" data-deal-action="create-offer">
                  <i data-lucide="badge-dollar-sign" class="size-5"></i>
                  <span>Create Offer</span>
                </button>
              </div>
            </section>

            <section id="offer-history-panel" class="plain-panel">
              <h2 class="section-title">Offer History</h2>
              <ol id="offer-history-list" class="price-timeline">
                <li class="complete"><span>Alice created an offer</span><strong>500 STRK</strong></li>
                <li class="complete active"><span>Bob created a counter offer</span><strong>450 STRK</strong></li>
                <li id="offer-history-waiting"><span>Your Decision</span><strong>Pending</strong></li>
              </ol>
            </section>

            <section id="deal-next-step-panel" class="plain-panel next-step-panel">
              <h2 class="section-title">Next Step</h2>
              <p id="deal-next-step-copy" class="plain-note compact">Accept 450 STRK to start escrow funding, or counter again before the offer expires.</p>
              <div id="deal-negotiation-actions" class="proposal-actions">
                <button id="deal-counter-action" class="secondary-action" type="button" data-deal-action="counter">Counter Again</button>
                <button id="deal-accept-action" class="primary-action" type="button" data-deal-action="accept">Accept Proposal</button>
              </div>
            </section>

            <details id="deal-activity-panel" class="offer-proof-panel">
              <summary><span id="deal-activity-title">Alice created an offer</span><i data-lucide="chevron-down" class="size-4"></i></summary>
              <div id="deal-offer-proof" class="chain-meta"></div>
            </details>
          </div>
        </section>

`;
}

