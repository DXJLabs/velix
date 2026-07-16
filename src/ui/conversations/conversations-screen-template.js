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
                  <p class="eyebrow">Selected deal</p>
                  <h2>No deal selected</h2>
                </div>
                <span class="status-pill waiting-deposit">Unavailable</span>
              </div>
              <div class="inspector-amount">
                <span>Verified settlement</span>
                <strong>—</strong>
                <small>No fabricated offer, deposit, or settlement state is shown.</small>
              </div>
              <div class="inspector-timeline">
                <div><i data-lucide="shield" class="size-4"></i><span>Select a verified conversation to inspect it.</span></div>
              </div>
              <button class="primary-action w-full" type="button" disabled aria-disabled="true">
                <i data-lucide="lock" class="size-5"></i>
                <span>No Deal Available</span>
              </button>
            </aside>
          </div>
        </section>

`;
}

