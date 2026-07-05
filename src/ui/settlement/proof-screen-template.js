export function proofScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="proof">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="settlement" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">Proof</p>
              <h1 class="detail-title">Settlement proof</h1>
            </div>
          </header>
          <div class="detail-content">
            <section class="settlement-receipt-card">
              <div class="success-icon compact"><i data-lucide="check" class="size-6"></i></div>
              <div>
                <p class="eyebrow">Settlement Complete</p>
                <h2 id="settlement-proof-title">Rights Transfer</h2>
                <small id="settlement-proof-parties">Deal #381 <span>Â·</span> Alice <span>&lt;-&gt;</span> Bob</small>
              </div>
            </section>

            <section id="settlement-proof-flow" class="plain-panel settlement-proof-flow">
              <div class="proof-group">
                <h2>Negotiation</h2>
                <ol>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>Alice created an offer</p><strong>500 STRK</strong></li>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>Bob created a counter offer</p><strong>450 STRK</strong></li>
                </ol>
              </div>
              <div class="proof-group">
                <h2>Funding</h2>
                <ol>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>Alice deposited</p><strong>450 STRK</strong></li>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>Bob locked NFT</p><strong>Rights Package NFT</strong></li>
                </ol>
              </div>
              <div class="proof-group">
                <h2>Release</h2>
                <ol>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>Assets released</p><strong>Complete</strong></li>
                </ol>
              </div>
              <div class="proof-group">
                <h2>Settlement</h2>
                <ol>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>NFT delivered to Alice</p><strong>Complete</strong></li>
                  <li><span><i data-lucide="check" class="size-4"></i></span><p>450 STRK delivered to Bob</p><strong>Complete</strong></li>
                </ol>
              </div>
            </section>

            <section class="plain-panel settlement-transaction-card">
              <h2 class="section-title">Settlement Transaction</h2>
              <div class="settlement-tx-row">
                <span>Proof ID</span>
                <strong id="settlement-proof-id">VP-DEAL-F38BA0</strong>
              </div>
              <div class="settlement-tx-row">
                <span>Settlement Hash</span>
                <strong id="settlement-proof-settlement-hash">0x3a7dfdeb...f38ba0</strong>
              </div>
              <div class="settlement-tx-row">
                <span>Tx</span>
                <strong id="settlement-proof-hash">Available after wallet confirmation</strong>
              </div>
              <a id="settlement-proof-link" class="secondary-action w-full" href="https://sepolia.voyager.online" target="_blank" rel="noreferrer">
                <i data-lucide="external-link" class="size-5"></i>
                <span>View on Voyager</span>
              </a>
            </section>
            <button class="secondary-action w-full" type="button" data-export-proof>
              <i data-lucide="download" class="size-5"></i>
              <span>Download Settlement Proof</span>
            </button>
          </div>
        </section>
`;
}

