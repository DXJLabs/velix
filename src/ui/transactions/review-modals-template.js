export function reviewModalsMarkup() {
  return `
    <div id="transaction-loading-modal" class="transaction-loading-modal hidden" role="dialog" aria-modal="true" aria-labelledby="transaction-loading-title" aria-describedby="transaction-loading-subtitle">
      <div class="transaction-loading-backdrop"></div>
      <section class="transaction-loading-card">
        <div id="transaction-loading-icon" class="transaction-loading-icon loading">
          <i data-lucide="loader-circle" class="size-8"></i>
        </div>
        <h2 id="transaction-loading-title">Connecting Wallet</h2>
        <p id="transaction-loading-subtitle">Please approve the request in your wallet.</p>
        <div class="transaction-loading-detail">
          <span id="transaction-loading-detail">Waiting for signature...</span>
        </div>
        <a id="transaction-loading-link" class="transaction-loading-link" href="https://sepolia.voyager.online" target="_blank" rel="noreferrer" hidden>
          View Transaction ->
        </a>
        <button id="transaction-loading-cancel" class="secondary-action w-full" type="button" data-transaction-loading-cancel>Cancel</button>
        <button id="transaction-loading-close" class="primary-action w-full" type="button" data-transaction-loading-close hidden>Close</button>
      </section>
    </div>
    <div id="offer-review-modal" class="review-modal hidden" role="dialog" aria-modal="true" aria-labelledby="offer-review-title">
      <div class="review-modal-backdrop" data-offer-review-close></div>
      <section class="review-modal-sheet">
        <button class="icon-button ghost review-modal-close" type="button" data-offer-review-close aria-label="Close review">
          <i data-lucide="x" class="size-5"></i>
        </button>
        <p class="eyebrow">Review Transaction</p>
        <h2 id="offer-review-title">Accept Proposal</h2>
        <div class="review-summary-list">
          <div><span>Amount</span><strong id="offer-review-amount">450 STRK</strong></div>
          <div><span>Negotiation</span><strong id="offer-review-privacy">Encrypted negotiation</strong></div>
          <div><span>Total Fee</span><strong id="offer-review-fee">2.263 STRK</strong></div>
          <div><span>Rewards</span><strong id="offer-review-reward">+10 VEIL Points</strong></div>
          <div class="summary-total"><span>Total</span><strong id="offer-review-total">452.263 STRK</strong></div>
        </div>
        <button class="primary-action w-full" type="button" data-offer-review-sign>Sign Transaction</button>
        <button class="secondary-action w-full" type="button" data-offer-review-close>Cancel</button>
      </section>
    </div>
    <div id="payment-review-modal" class="review-modal hidden" role="dialog" aria-modal="true" aria-labelledby="payment-review-title">
      <div class="review-modal-backdrop" data-payment-review-close></div>
      <section class="review-modal-sheet">
        <button class="icon-button ghost review-modal-close" type="button" data-payment-review-close aria-label="Close review">
          <i data-lucide="x" class="size-5"></i>
        </button>
        <p class="eyebrow">Review Transaction</p>
        <h2 id="payment-review-title">Send Payment</h2>
        <div class="review-summary-list">
          <div><span>Recipient</span><strong id="payment-review-recipient">Bob</strong></div>
          <div><span>Amount</span><strong id="payment-review-amount">450 STRK</strong></div>
          <div><span>Privacy</span><strong id="payment-review-privacy">Shield</strong></div>
          <div><span>Total Fee</span><strong id="payment-review-fee">0.688 STRK</strong></div>
          <div><span>Rewards</span><strong id="payment-review-reward">+20 VEIL Points</strong></div>
          <div><span>AI Memo</span><strong id="payment-review-memo">Final settlement for rights transfer.</strong></div>
          <div class="summary-total"><span>Total</span><strong id="payment-review-total">450.688 STRK</strong></div>
        </div>
        <button class="primary-action w-full" type="button" data-payment-review-sign>Sign Transaction</button>
        <button class="secondary-action w-full" type="button" data-payment-review-close>Cancel</button>
      </section>
    </div>
    <div id="escrow-review-modal" class="review-modal hidden" role="dialog" aria-modal="true" aria-labelledby="escrow-review-title">
      <div class="review-modal-backdrop" data-escrow-review-close></div>
      <section class="review-modal-sheet">
        <button class="icon-button ghost review-modal-close" type="button" data-escrow-review-close aria-label="Close review">
          <i data-lucide="x" class="size-5"></i>
        </button>
        <p class="eyebrow">Review Transaction</p>
        <h2 id="escrow-review-title">Release Assets</h2>
        <div class="review-summary-list">
          <div><span>Escrow Amount</span><strong id="escrow-review-amount">450 STRK</strong></div>
          <div><span>Total Fee</span><strong id="escrow-review-fee">2.263 STRK</strong></div>
          <div><span>Rewards</span><strong id="escrow-review-reward">+50 VEIL Points</strong></div>
          <div class="summary-total"><span>Total</span><strong id="escrow-review-total">452.263 STRK</strong></div>
        </div>
        <button class="primary-action w-full" type="button" data-escrow-review-sign>Sign Transaction</button>
        <button class="secondary-action w-full" type="button" data-escrow-review-close>Cancel</button>
      </section>
    </div>
    <div id="privy-auth-root" hidden></div>
`;
}

