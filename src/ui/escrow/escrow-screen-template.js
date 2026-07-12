export function escrowScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="escrow">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="deal" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p id="escrow-page-eyebrow" class="eyebrow">Escrow Funding</p>
              <h1 id="escrow-page-title" class="detail-title">Waiting deposits</h1>
            </div>
          </header>
          <div class="detail-content">
            <section class="workflow-progress" data-workflow-progress></section>

            <section class="channel-context-card">
              <div>
                <p class="eyebrow">Channel</p>
                <h2>Rights Transfer</h2>
                <small id="escrow-channel-meta">Deal #381 Â· Alice / Bob</small>
              </div>
              <span id="escrow-channel-status" class="status-pill escrow-active">Escrow Active</span>
            </section>

            <section class="plain-panel">
              <div class="section-title-row">
                <h2 class="section-title">Escrow Funding</h2>
                <span id="escrow-funding-step" class="status-pill waiting-deposit">Step 1 of 2</span>
              </div>
              <p id="escrow-funding-copy" class="plain-note compact">Waiting for deposits</p>
              <div class="escrow-deposit-grid">
                <article id="escrow-buyer-deposit-card" class="escrow-deposit-card" data-escrow-deposit-card="buyer">
                  <div class="deposit-card-top">
                    <span><i data-lucide="circle" class="size-5"></i></span>
                    <small id="escrow-buyer-deposit-status">Deposit Required</small>
                  </div>
                  <p>Buyer</p>
                  <strong>Alice</strong>
                  <div class="deposit-card-details">
                    <span><em>Deposit</em><b id="escrow-buyer-deposit-amount">450 STRK</b></span>
                    <span><em>Protocol Fee</em><b id="escrow-buyer-protocol-fee">2.250 STRK</b></span>
                    <span><em>Shielded escrow settlement</em><b id="escrow-buyer-privacy-fee">Coming Soon</b></span>
                    <span><em>Network Fee</em><b id="escrow-buyer-network-fee">0.003 STRK</b></span>
                    <span><em>Reward Points</em><b id="escrow-buyer-reward">+450 VEIL Points</b></span>
                    <span><em>Status</em><b id="escrow-buyer-deposit-detail">Waiting</b></span>
                  </div>
                  <button id="escrow-buyer-deposit-action" class="primary-action w-full" type="button" data-escrow-deposit="buyer">
                    <i data-lucide="wallet" class="size-5"></i>
                    <span>Deposit to Escrow</span>
                  </button>
                  <div id="escrow-buyer-deposit-proof" class="chain-meta deposit-chain-meta"></div>
                </article>
                <article id="escrow-seller-deposit-card" class="escrow-deposit-card" data-escrow-deposit-card="seller">
                  <div class="deposit-card-top">
                    <span><i data-lucide="circle" class="size-5"></i></span>
                    <small id="escrow-seller-deposit-status">Waiting for Bob</small>
                  </div>
                  <p>Seller</p>
                  <strong>Bob</strong>
                  <div class="deposit-card-details">
                    <span><em>Asset</em><b>Rights Package NFT</b></span>
                    <span><em>Reward Points</em><b id="escrow-seller-reward">+450 VEIL Points</b></span>
                    <span><em>Status</em><b id="escrow-seller-deposit-detail">Waiting for Bob</b></span>
                  </div>
                  <button id="escrow-seller-deposit-action" class="secondary-action w-full" type="button" data-escrow-deposit="seller">
                    <i data-lucide="lock-keyhole" class="size-5"></i>
                    <span>Lock Asset</span>
                  </button>
                  <div id="escrow-seller-deposit-proof" class="chain-meta deposit-chain-meta"></div>
                </article>
              </div>
              <div id="escrow-funding-proof" class="chain-meta escrow-stage-proof"></div>
            </section>

            <section class="plain-panel transaction-summary-panel">
              <h2 class="section-title">Fee Summary</h2>
              <div class="transaction-summary-list">
                <div><span>Escrow Amount</span><strong id="escrow-fee-amount">450 STRK</strong></div>
                <div><span>Total Fee</span><strong id="escrow-total-fee">2.263 STRK</strong></div>
                <div class="summary-total"><span>Total</span><strong id="escrow-fee-total">452.263 STRK</strong></div>
              </div>
            </section>

            <section class="plain-panel">
              <div class="section-title-row">
                <h2 class="section-title">Confirmation</h2>
                <span id="escrow-confirmation-step" class="status-pill public">Locked</span>
              </div>
              <p id="escrow-confirmation-copy" class="plain-note compact">Complete both deposits before buyer and seller approvals.</p>
              <div class="escrow-checks">
                <button id="escrow-buyer-confirmed" class="escrow-check-item" type="button" data-escrow-confirmation="buyer">
                  <i data-lucide="circle" class="size-5"></i><span>Buyer approve</span><small>Locked</small>
                </button>
                <button id="escrow-seller-confirmed" class="escrow-check-item" type="button" data-escrow-confirmation="seller">
                  <i data-lucide="circle" class="size-5"></i><span>Seller approve</span><small>Locked</small>
                </button>
              </div>
            </section>

            <section class="plain-panel">
              <h2 class="section-title">Release</h2>
              <p id="escrow-release-copy" class="plain-note compact">Waiting for both approvals</p>
              <button id="escrow-release-action" class="primary-action mt-5 w-full" type="button" data-escrow-release disabled>
                <i data-lucide="lock" class="size-5"></i>
                <span>Release Assets</span>
                <small>Locked</small>
              </button>
              <button id="escrow-dispute-action" class="secondary-action mt-2 w-full" type="button" data-escrow-dispute>Dispute</button>
            </section>

            <section class="plain-panel settlement-route-panel">
              <h2 class="section-title">Settlement</h2>
              <p id="escrow-settlement-copy" class="plain-note compact">Release escrow to generate settlement proof.</p>
              <button id="escrow-settlement-action" class="secondary-action mt-4 w-full" type="button" data-open-route="settlement" disabled>
                <i data-lucide="lock" class="size-5"></i>
                <span>Settlement Locked</span>
              </button>
            </section>

            <section class="plain-panel">
              <h2 class="section-title">Transaction Proof</h2>
              <ol class="escrow-proof-timeline">
                <li id="escrow-funding-proof-step" class="complete">
                  <span class="proof-dot"><i data-lucide="check" class="size-4"></i></span>
                  <div><strong>Funding</strong><small id="escrow-funding-status">Deposits recorded</small><div id="escrow-funding-proof-timeline" class="chain-meta"></div></div>
                </li>
                <li id="escrow-release-proof-step">
                  <span class="proof-dot"><i data-lucide="circle" class="size-4"></i></span>
                  <div><strong>Release</strong><small id="escrow-release-status">Waiting</small><div id="escrow-release-proof" class="chain-meta"></div></div>
                </li>
              </ol>
            </section>
          </div>
        </section>

`;
}

