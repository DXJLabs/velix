export function settlementScreenMarkup() {
  return `
    <section class="screen hidden bg-[#f7f8fa]" data-screen="settlement">
      <header class="detail-header">
        <button class="icon-button ghost" type="button" data-nav="escrow" aria-label="Back">
          <i data-lucide="chevron-left" class="size-6"></i>
        </button>
        <div class="min-w-0 flex-1">
          <p class="eyebrow">Settlement</p>
          <h1 class="detail-title">Settlement record</h1>
        </div>
      </header>
      <div class="detail-content">
        <section class="workflow-progress" data-workflow-progress></section>
        <section class="settlement-complete-card">
          <div class="success-icon"><i data-lucide="lock" class="size-9"></i></div>
          <h2>Settlement proof unavailable</h2>
          <p>VEIL has not generated or verified a separate cryptographic settlement proof.</p>
          <div class="settlement-proof-summary">
            <div><span>Deal ID</span><strong id="settlement-complete-deal-id">Unavailable</strong></div>
            <div><span>Proof ID</span><strong id="settlement-complete-proof-id">Unavailable</strong></div>
            <div><span>Settlement Hash</span><strong id="settlement-complete-hash">Unavailable</strong></div>
          </div>
          <button class="primary-action w-full" type="button" disabled aria-disabled="true">Proof Unavailable</button>
        </section>
      </div>
    </section>
  `;
}
