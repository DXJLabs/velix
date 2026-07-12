export function paymentScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="payment">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="channel" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">Direct Payment</p>
              <h1 class="detail-title">450 STRK to Bob</h1>
            </div>
          </header>
          <form id="payment-form" class="detail-content">
            <section class="workflow-progress" data-workflow-progress></section>

            <section class="payment-summary-card">
              <h2>Trusted Transfer</h2>
              <div class="payment-route">
                <span>Alice</span>
                <i data-lucide="move-right" class="size-4"></i>
                <span>Bob</span>
              </div>
            </section>

            <section class="plain-list">
              <div><span>Recipient</span><strong>Bob</strong></div>
              <div><span>Payment Type</span><strong id="payment-deal-status">Direct Transfer</strong></div>
              <div><span>Amount</span><strong>450 STRK</strong></div>
            </section>
            <section class="plain-panel transaction-summary-panel">
              <h2 class="section-title">Fee Summary</h2>
              <div class="transaction-summary-list">
                <div><span>Amount</span><strong id="payment-summary-amount">450 STRK</strong></div>
                <div><span>Total Fee</span><strong id="payment-total-fee">0.688 STRK</strong></div>
                <div class="summary-total"><span>Total</span><strong id="payment-summary-total">450.688 STRK</strong></div>
              </div>
            </section>
            <input id="payment-recipient" type="hidden" value="Bob" />
            <input id="payment-asset" type="hidden" value="STRK" />
            <input id="payment-amount" type="hidden" value="450" />
            <div>
              <span class="field-label">Asset transfer</span>
              <div class="segmented">
                <button type="button" data-payment-mode="shield" disabled title="Coming Soon">Shielded payment - Coming Soon</button>
                <button class="active" type="button" data-payment-mode="unshield">Public settlement</button>
              </div>
            </div>
            <label class="field"><span>AI Note</span><textarea id="payment-memo" rows="4">Final settlement for rights transfer.</textarea></label>
            <button class="secondary-action w-full" type="button" data-payment-review>Review Transaction</button>
            <button class="primary-action w-full" type="submit">
              <i data-lucide="send" class="size-5"></i>
              <span>Send Payment</span>
            </button>
            <section class="plain-panel settlement-route-panel">
              <h2 class="section-title">Settlement</h2>
              <p id="payment-settlement-copy" class="plain-note compact">Send payment to generate settlement proof.</p>
              <button id="payment-settlement-action" class="secondary-action mt-4 w-full" type="button" data-open-route="settlement" disabled>
                <i data-lucide="lock" class="size-5"></i>
                <span>Settlement Locked</span>
              </button>
            </section>
          </form>
        </section>

`;
}

