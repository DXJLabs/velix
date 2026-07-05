export function activityScreenMarkup() {
  return `
        <section class="screen hidden" data-screen="activity">
          <header class="surface-header">
            <p class="eyebrow">VEIL</p>
            <h1 class="page-title">Activity</h1>
            <p class="page-subtitle">Actions and history across deal channels</p>
          </header>
          <div class="content-with-nav activity-dashboard">
            <section class="activity-section" aria-labelledby="pending-actions-heading">
              <div class="activity-section-header">
                <div>
                  <p class="eyebrow">Pending Actions</p>
                  <h2 id="pending-actions-heading">What needs attention</h2>
                </div>
                <span class="status-pill waiting-deposit">6 open</span>
              </div>

              <div class="activity-actions">
                <button class="task-row primary" type="button" data-open-route="deal">
                  <span class="action-icon"><i data-lucide="handshake" class="size-5"></i></span>
                  <span>
                    <strong>Review Bob's Counter</strong>
                    <small>Rights Transfer - 450 STRK awaiting decision</small>
                  </span>
                  <i data-lucide="chevron-right" class="size-5"></i>
                </button>
                <button class="task-row" type="button" data-open-route="escrow">
                  <span class="action-icon"><i data-lucide="shield-check" class="size-5"></i></span>
                  <span>
                    <strong>Release Assets</strong>
                    <small>Buyer and seller deposits confirmed</small>
                  </span>
                  <i data-lucide="chevron-right" class="size-5"></i>
                </button>
                <button class="task-row" type="button" data-open-route="payment">
                  <span class="action-icon"><i data-lucide="send" class="size-5"></i></span>
                  <span>
                    <strong>Direct Payment</strong>
                    <small>450 STRK to Bob for trusted counterparty</small>
                  </span>
                  <i data-lucide="chevron-right" class="size-5"></i>
                </button>
                <button class="task-row" type="button" data-open-route="escrow">
                  <span class="action-icon"><i data-lucide="check" class="size-5"></i></span>
                  <span>
                    <strong>Confirm Deposit</strong>
                    <small>Northline Goods waiting for deposit confirmation</small>
                  </span>
                  <i data-lucide="chevron-right" class="size-5"></i>
                </button>
                <button class="task-row" type="button" data-open-route="payment">
                  <span class="action-icon"><i data-lucide="file-text" class="size-5"></i></span>
                  <span>
                    <strong>AI Review</strong>
                    <small>Design Milestone needs AI-assisted direct payment review</small>
                  </span>
                  <i data-lucide="chevron-right" class="size-5"></i>
                </button>
                <button class="task-row" type="button" data-open-route="proof">
                  <span class="action-icon"><i data-lucide="file-check-2" class="size-5"></i></span>
                  <span>
                    <strong>Export Proof</strong>
                    <small>Settlement proof is ready for archive</small>
                  </span>
                  <i data-lucide="chevron-right" class="size-5"></i>
                </button>
              </div>
            </section>

            <section class="activity-section" aria-labelledby="recent-activity-heading">
              <div class="activity-section-header">
                <div>
                  <p class="eyebrow">Recent Activity</p>
                  <h2 id="recent-activity-heading">Channel history</h2>
                </div>
              </div>

              <div class="activity-history">
                <section class="history-day" aria-labelledby="history-today">
                  <h3 id="history-today">Today</h3>
                  <ol>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>Alice accepted Bob's counter offer</span><strong>Rights Transfer</strong></li>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>Escrow Funded</span><strong>Northline Goods</strong></li>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>Payment Sent</span><strong>Design Milestone</strong></li>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>AI Attached</span><strong>Rights Transfer</strong></li>
                  </ol>
                </section>

                <section class="history-day" aria-labelledby="history-yesterday">
                  <h3 id="history-yesterday">Yesterday</h3>
                  <ol>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>Channel Created</span><strong>Greylock Ops</strong></li>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>Proof Generated</span><strong>Rights Transfer</strong></li>
                  </ol>
                </section>

                <section class="history-day" aria-labelledby="history-mon">
                  <h3 id="history-mon">Mon</h3>
                  <ol>
                    <li><span class="history-check"><i data-lucide="check" class="size-4"></i></span><span>Settlement Completed</span><strong>Product Supply</strong></li>
                  </ol>
                </section>
              </div>
            </section>
          </div>
        </section>

`;
}

