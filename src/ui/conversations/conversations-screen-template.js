export function conversationsScreenMarkup() {
  return `
        <section class="screen hidden" data-screen="conversations">
          <div class="conversation-workspace">
            <div class="conversation-column">
              <header class="surface-header conversation-header">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="eyebrow">VEIL</p>
                    <h1 class="page-title">Deals</h1>
                    <p class="page-subtitle">Choose a counterparty, negotiate, then settle.</p>
                  </div>
                  <button class="icon-button" type="button" data-new-conversation aria-label="New deal">
                    <i data-lucide="plus" class="size-5"></i>
                  </button>
                </div>
                <label class="search-field">
                  <i data-lucide="search" class="size-4"></i>
                  <input id="conversation-search" type="search" placeholder="Search deals" autocomplete="off" />
                </label>
              </header>

              <div class="content-with-nav conversation-content">
                <div id="conversation-list" class="conversation-list"></div>
              </div>
            </div>

            <aside class="conversation-inspector" aria-label="Selected channel">
              <div class="inspector-top">
                <div>
                  <p class="eyebrow">Active deal</p>
                  <h2>Rights Transfer</h2>
                </div>
                <span class="status-pill waiting-deposit">Waiting Deposit</span>
              </div>
              <div class="inspector-amount">
                <span>Accepted offer</span>
                <strong>450 STRK</strong>
                <small>Waiting for Alice and Bob deposits</small>
              </div>
              <div class="inspector-timeline">
                <div class="complete"><i data-lucide="check" class="size-4"></i><span>Alice accepted Bob's counter offer</span></div>
                <div class="complete"><i data-lucide="check" class="size-4"></i><span>AI prepared</span></div>
                <div><i data-lucide="shield" class="size-4"></i><span>Escrow deposits pending</span></div>
                <div><i data-lucide="file-check-2" class="size-4"></i><span>Proof export next</span></div>
              </div>
              <button class="primary-action w-full" type="button" data-open-channel="20260625">
                <i data-lucide="arrow-right" class="size-5"></i>
                <span>Open Deal</span>
              </button>
            </aside>
          </div>
        </section>

`;
}

