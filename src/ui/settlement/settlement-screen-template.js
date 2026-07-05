export function settlementScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="settlement">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="escrow" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">Settlement</p>
              <h1 class="detail-title">Settlement complete</h1>
            </div>
          </header>
          <div class="detail-content">
            <section class="workflow-progress" data-workflow-progress></section>
            <section class="settlement-complete-card">
              <div class="success-icon"><i data-lucide="check" class="size-9"></i></div>
              <h2>Settlement proof generated</h2>
              <p>Proof generated and attached to the deal.</p>
              <div class="settlement-proof-summary">
                <div>
                  <span>Deal ID</span>
                  <strong id="settlement-complete-deal-id">Deal #381</strong>
                </div>
                <div>
                  <span>Proof ID</span>
                  <strong id="settlement-complete-proof-id">VP-DEAL-F38BA0</strong>
                </div>
                <div>
                  <span>Settlement Hash</span>
                  <strong id="settlement-complete-hash">0x3a7dfdeb...f38ba0</strong>
                </div>
              </div>
              <button class="primary-action w-full" type="button" data-open-route="proof">View Proof</button>
              <div class="settlement-action-grid">
                <button class="secondary-action" type="button" data-channel-complete-action="continue">Continue chatting</button>
                <button class="secondary-action" type="button" data-channel-complete-action="new-escrow">Create new escrow</button>
                <button class="secondary-action" type="button" data-channel-complete-action="close">Close deal</button>
              </div>
            </section>
          </div>
        </section>

`;
}

