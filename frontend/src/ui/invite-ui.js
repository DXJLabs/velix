import { escapeHtml } from "./html.js";

export function inviteWaitingCardMarkup(channel, { inviteLink } = {}) {
  if (!channel.invited) {
    return `
      <section class="invite-wait-card veil-wait-card">
        <span class="invite-wait-icon"><i data-lucide="user-round-clock" class="size-5"></i></span>
        <div>
          <strong>Waiting for ${escapeHtml(channel.person)}</strong>
          <p>The room will open after they accept your invitation.</p>
        </div>
      </section>
    `;
  }

  const link = inviteLink || channel.inviteLink || "";
  const displayHost = (() => {
    try {
      return new URL(link).host;
    } catch {
      return "VEIL private invite";
    }
  })();

  return `
    <section class="invite-wait-card veil-wait-card">
      <span class="invite-wait-icon veil-wait-icon-soft">
        <i data-lucide="send" class="size-5"></i>
      </span>

      <div class="veil-wait-copy">
        <strong>Invitation ready</strong>
        <p>Share this invite with ${escapeHtml(channel.person)}.</p>
      </div>

      <div class="veil-invite-link-summary">
        <span class="veil-invite-link-mark">
          <i data-lucide="link-2" class="size-4"></i>
        </span>
        <div>
          <small>Secure VEIL invite</small>
          <strong>${escapeHtml(displayHost)}</strong>
        </div>
      </div>

      <div class="veil-invite-actions">
        <button class="primary-action" type="button" data-copy-invite>
          <i data-lucide="copy" class="size-4"></i>
          <span>Copy invite</span>
        </button>
        <button class="secondary-action" type="button" data-share-invite="share">
          <i data-lucide="share-2" class="size-4"></i>
          <span>Share</span>
        </button>
      </div>

      <div class="veil-waiting-state" role="status" aria-live="polite">
        <span class="veil-pulse-dot"></span>
        <span>Waiting for them to open the invite</span>
      </div>
    </section>
  `;
}
