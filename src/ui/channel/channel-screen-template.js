export function channelScreenMarkup() {
  return `
        <section class="screen hidden bg-white" data-screen="channel">
          <header class="detail-header">
            <button class="icon-button ghost" type="button" data-nav="conversations" aria-label="Back">
              <i data-lucide="chevron-left" class="size-6"></i>
            </button>
            <button class="min-w-0 flex-1 text-left" type="button" data-open-route="deal">
              <h1 id="channel-title" class="truncate text-base font-black">Rights Transfer</h1>
              <p id="channel-meta" class="mt-0.5 truncate text-xs font-bold text-slate-500">Deal #381 Â· Bob - Escrow Active</p>
            </button>
            <button class="icon-button ghost" type="button" data-open-route="deal" aria-label="Deal menu">
              <i data-lucide="more-horizontal" class="size-5"></i>
            </button>
          </header>

          <section class="workflow-progress" data-workflow-progress></section>

          <section class="channel-security-banner">
            <span class="security-lock"><i data-lucide="lock-keyhole" class="size-5"></i></span>
            <div class="min-w-0">
              <strong>Encrypted On-chain</strong>
              <small>Available</small>
              <p><span id="channel-context-title">Rights Transfer</span> with <span id="channel-context-party">Bob</span></p>
              <div class="channel-security-badges" aria-label="Encryption status">
                <span>Encrypted locally</span>
                <span>Ciphertext on-chain</span>
                <span>Metadata public</span>
              </div>
              <p>Shielded via STRK20: Coming Soon</p>
            </div>
            <span id="channel-context-status" class="status-pill escrow-active">Escrow Active</span>
          </section>

          <div id="message-feed" class="message-feed"></div>

          <form id="composer-form" class="composer">
            <div class="composer-actions" aria-label="Quick actions">
              <button type="button" data-composer-action="upload" aria-label="Upload file"><i data-lucide="paperclip" class="size-4"></i><span>Upload</span></button>
              <button type="button" data-open-route="deal" aria-label="Offer"><i data-lucide="badge-dollar-sign" class="size-4"></i><span>Offer</span></button>
              <button type="button" data-open-route="payment" aria-label="Pay"><i data-lucide="send" class="size-4"></i><span>Pay</span></button>
              <button type="button" data-open-route="escrow" aria-label="Escrow"><i data-lucide="shield-check" class="size-4"></i><span>Escrow</span></button>
              <button type="button" data-composer-action="ai" aria-label="AI"><i data-lucide="sparkles" class="size-4"></i><span>AI</span></button>
            </div>
            <input id="attachment-input" class="hidden-file-input" type="file" accept="image/*,application/pdf" />
            <div class="composer-input">
              <textarea id="message-input" rows="1" placeholder="Message"></textarea>
              <button type="submit" aria-label="Send"><i data-lucide="send" class="size-5"></i></button>
            </div>
          </form>
        </section>

`;
}

