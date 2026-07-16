export function proofScreenMarkup() {
  return `
    <section class="screen hidden bg-[#f7f8fa]" data-screen="proof">
      <header class="detail-header">
        <button class="icon-button ghost" type="button" data-nav="settlement" aria-label="Back">
          <i data-lucide="chevron-left" class="size-6"></i>
        </button>
        <div class="min-w-0 flex-1">
          <p class="eyebrow">Settlement Record</p>
          <h1 class="detail-title">Verification status</h1>
        </div>
      </header>
      <div class="detail-content">
        <section class="settlement-receipt-card">
          <div class="success-icon compact"><i data-lucide="lock" class="size-6"></i></div>
          <div>
            <p class="eyebrow">Proof Unavailable</p>
            <h2 id="settlement-proof-title">No verified settlement proof</h2>
            <small id="settlement-proof-parties">A real settlement transaction is required.</small>
          </div>
        </section>
        <section id="settlement-proof-flow" class="plain-panel settlement-proof-flow">
          <p class="plain-note">No negotiation, funding, release, or delivery step is marked complete without verified chain evidence.</p>
        </section>
        <section class="plain-panel settlement-transaction-card">
          <h2 class="section-title">Settlement Transaction</h2>
          <div class="settlement-tx-row"><span>Proof ID</span><strong id="settlement-proof-id">Unavailable</strong></div>
          <div class="settlement-tx-row"><span>Settlement Hash</span><strong id="settlement-proof-settlement-hash">Unavailable</strong></div>
          <div class="settlement-tx-row"><span>Tx</span><strong id="settlement-proof-hash">Unavailable</strong></div>
          <a id="settlement-proof-link" class="secondary-action w-full" hidden target="_blank" rel="noreferrer">
            <i data-lucide="external-link" class="size-5"></i><span>View Transaction</span>
          </a>
        </section>
        <button class="secondary-action w-full" type="button" data-export-proof disabled aria-disabled="true">
          <i data-lucide="download" class="size-5"></i><span>Proof Export Unavailable</span>
        </button>
      </div>
    </section>
  `;
}
