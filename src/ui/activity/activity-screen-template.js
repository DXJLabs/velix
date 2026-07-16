export function activityScreenMarkup() {
  return `
    <section class="screen hidden" data-screen="activity">
      <header class="surface-header">
        <p class="eyebrow">VEIL</p>
        <h1 class="page-title">Activity</h1>
        <p class="page-subtitle">Only verified local or chain activity appears here.</p>
      </header>
      <div class="content-with-nav activity-dashboard">
        <section class="activity-section" aria-labelledby="verified-activity-heading">
          <div class="activity-section-header">
            <div>
              <p class="eyebrow">Verified Activity</p>
              <h2 id="verified-activity-heading">No activity yet</h2>
            </div>
            <span class="status-pill waiting-deposit">Empty</span>
          </div>
          <div class="plain-panel">
            <p class="plain-note">Demo history is not loaded in production. Confirmed transactions and locally decrypted ciphertext will appear after a verified flow succeeds.</p>
          </div>
        </section>
      </div>
    </section>
  `;
}
