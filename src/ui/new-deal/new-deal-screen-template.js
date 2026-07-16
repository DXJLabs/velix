export function newDealScreenMarkup() {
  return `
        <section class="screen hidden bg-[#f7f8fa]" data-screen="new-deal">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="conversations" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <div class="min-w-0 flex-1">
              <p class="eyebrow">New Deal</p>
              <h1 class="detail-title">Choose counterparty</h1>
            </div>
          </header>
          <div class="detail-content new-deal-content">
            <section class="new-deal-panel">
              <div class="new-deal-heading">
                <span class="new-deal-icon"><i data-lucide="user-check" class="size-5"></i></span>
                <div>
                  <h2>Choose Counterparty</h2>
                  <p>Recipient discovery and live two-party delivery must be verified before a deal can be created.</p>
                </div>
              </div>
              <label class="field">
                <span>Deal Name</span>
                <input id="new-deal-title" type="text" value="Rights Transfer" />
              </label>
              <label class="search-field new-deal-search">
                <i data-lucide="search" class="size-4"></i>
                <input id="new-deal-counterparty" type="search" value="bob.stark" placeholder="bob.stark or 0x04..." autocomplete="off" />
              </label>
              <article class="counterparty-result">
                <span class="avatar">B</span>
                <div>
                  <strong id="counterparty-result-name">bob.stark</strong>
                  <small id="counterparty-result-detail">Recipient discovery is not E2E-verified.</small>
                </div>
                <span id="counterparty-result-status" class="status-pill waiting-deposit">Unavailable</span>
              </article>
              <p id="counterparty-action-hint" class="plain-note compact">No request or notification will be created in this build.</p>
              <button id="new-deal-primary-action" class="primary-action w-full" type="button" disabled aria-disabled="true">
                <i data-lucide="lock" class="size-5"></i>
                <span>Deal Creation Unavailable</span>
              </button>
            </section>

            <section class="new-deal-panel">
              <div class="new-deal-heading">
                <span class="new-deal-icon muted"><i data-lucide="send" class="size-5"></i></span>
                <div>
                  <h2>Can't find them?</h2>
                  <p>Invite delivery is unavailable until its backend metadata flow is implemented and verified.</p>
                </div>
              </div>
              <button id="show-invite-form" class="secondary-action w-full" type="button" disabled aria-disabled="true">
                <i data-lucide="mail-plus" class="size-5"></i>
                <span>Invite Unavailable</span>
              </button>
              <div id="invite-form-panel" class="invite-form-panel" hidden>
                <label class="field">
                  <span>Counterparty or contact</span>
                  <input id="invite-target" type="text" value="bob.stark" />
                </label>
                <p class="plain-note compact">No invite link will be generated in this build.</p>
                <div class="offer-form-actions">
                  <button class="secondary-action" type="button" data-new-deal-action="cancel-invite">Cancel</button>
                  <button class="primary-action" type="button" data-new-deal-action="invite">
                    <i data-lucide="send" class="size-5"></i>
                    <span>Create Invite</span>
                  </button>
                </div>
              </div>
            </section>

            <section class="new-deal-flow">
              <h2 class="section-title">Start Flow</h2>
              <ol>
                <li class="complete"><span>1</span><strong>Choose counterparty</strong></li>
                <li><span>2</span><strong>Notify or invite</strong></li>
                <li><span>3</span><strong>Counterparty accepts</strong></li>
                <li><span>4</span><strong>Negotiate offer</strong></li>
              </ol>
            </section>
          </div>
        </section>

`;
}

