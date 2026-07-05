import { escapeHtml } from "./html.js";

export function inviteWaitingCardMarkup(channel, { inviteLink } = {}) {
  if (!channel.invited) {
    return `
      <section class="invite-wait-card">
        <span class="invite-wait-icon"><i data-lucide="bell" class="size-5"></i></span>
        <div>
          <strong>Waiting for ${escapeHtml(channel.person)}</strong>
          <p>${escapeHtml(channel.dealId || "Deal request")} created. ${escapeHtml(channel.person)} received an in-app notification and must accept before negotiation opens.</p>
          <small>New private deal request - Accept or Decline</small>
        </div>
        <div class="invite-wait-actions">
          <button class="primary-action" type="button" data-counterparty-accept>
            <i data-lucide="check" class="size-5"></i>
            <span>Preview Bob Accept</span>
          </button>
          <button class="secondary-action" type="button" data-counterparty-decline>
            <i data-lucide="x" class="size-5"></i>
            <span>Decline</span>
          </button>
        </div>
      </section>
    `;
  }

  const link = inviteLink || channel.inviteLink || "";
  return `
    <section class="invite-wait-card">
      <span class="invite-wait-icon"><i data-lucide="send" class="size-5"></i></span>
      <div>
        <strong>Invite link ready</strong>
        <p>${escapeHtml(channel.person)} is not on VEIL yet. Share the invite link; after they connect wallet and accept, the deal opens.</p>
      </div>
      <div class="invite-link-card">
        <span>Invite Link</span>
        <strong>${escapeHtml(link)}</strong>
        <div>
          <button class="secondary-action" type="button" data-copy-invite>
            <i data-lucide="copy" class="size-4"></i>
            <small>Copy</small>
          </button>
          <button class="secondary-action" type="button" data-share-invite="share">
            <i data-lucide="send" class="size-4"></i>
            <small>Share</small>
          </button>
          <button class="secondary-action" type="button" data-qr-invite>
            <i data-lucide="qr-code" class="size-4"></i>
            <small>QR Code</small>
          </button>
        </div>
      </div>
      <div class="invite-share-grid" aria-label="Share invite">
        <button type="button" data-share-invite="telegram">Telegram</button>
        <button type="button" data-share-invite="discord">Discord</button>
        <button type="button" data-share-invite="x">X</button>
        <button type="button" data-share-invite="email">Email</button>
        <button type="button" data-share-invite="whatsapp">WhatsApp</button>
      </div>
      <div class="invite-wait-actions">
        <button class="primary-action" type="button" data-counterparty-accept>
          <i data-lucide="user-plus" class="size-5"></i>
          <span>Preview Accept Invitation</span>
        </button>
      </div>
    </section>
  `;
}
