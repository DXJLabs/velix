import { formatTime } from "../utils/format.js";
import { escapeHtml } from "./html.js";

function actorNameFor(item = {}) {
  return item.actor || (item.self || item.sender === "You" ? "Alice" : item.sender) || "System";
}

function timelineIcon(item = {}) {
  const label = `${item.title || ""} ${item.subtitle || ""}`.toLowerCase();
  if (label.includes("invite") || label.includes("joined")) return "user-plus";
  if (label.includes("payment") || label.includes("memo")) return "file-text";
  if (label.includes("escrow")) return "shield-check";
  if (label.includes("offer") || label.includes("counter")) return "badge-dollar-sign";
  return "shield";
}

function timelineDetailsMarkup(item = {}) {
  const rows = [];
  if (Array.isArray(item.details)) rows.push(...item.details);
  if (item.inviteLink) rows.push(["Invite Link", item.inviteLink]);
  if (item.proofId) rows.push(["Proof ID", item.proofId]);
  if (item.settlementHash) rows.push(["Settlement Hash", item.settlementHash]);
  if (!rows.length) return "";
  return `
    <dl class="timeline-detail-list">
      ${rows.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function timelineActionsMarkup(item = {}) {
  if (item.inviteLink) {
    return `
      <div class="timeline-action-row">
        <button type="button" data-copy-invite>Copy</button>
        <button type="button" data-share-invite="share">Share</button>
        <button type="button" data-qr-invite>QR Code</button>
      </div>
    `;
  }
  if (item.proofId || item.settlementHash) {
    return `
      <div class="timeline-action-row">
        <button type="button" data-open-route="proof">View Proof</button>
      </div>
    `;
  }
  if (item.channelActions) {
    return `
      <div class="timeline-action-row three">
        <button type="button" data-channel-complete-action="continue">Continue chatting</button>
        <button type="button" data-channel-complete-action="new-escrow">Create new escrow</button>
        <button type="button" data-channel-complete-action="close">Close deal</button>
      </div>
    `;
  }
  return "";
}

export function messageMarkup(item, { itemStateClass, renderChainMeta }) {
  const self = item.self || item.sender === "You";
  const actor = item.actor || (self ? "Alice" : item.sender);
  return `
    <article class="message ${self ? "self" : ""} ${itemStateClass(item)}">
      <div class="message-stack ${self ? "right" : ""}">
        <div class="message-meta ${self ? "text-right" : ""}">
          <span>${escapeHtml(actor)}</span>
          <time>${escapeHtml(formatTime(item.time))}</time>
        </div>
        <p class="bubble">${escapeHtml(item.body)}</p>
        ${renderChainMeta(item, self)}
      </div>
    </article>
  `;
}

export function offerCardMarkup(item, { itemStateClass, renderChainMeta }) {
  const actor = `<span class="timeline-actor">${escapeHtml(actorNameFor(item))}</span>`;
  return `
    <article class="timeline-event offer-timeline ${itemStateClass(item)}">
      <span class="timeline-marker"><i data-lucide="${timelineIcon(item)}" class="size-4"></i></span>
      <div class="timeline-card">
        ${actor}
        <strong>${escapeHtml(item.title)}</strong>
        <b>${escapeHtml(item.amount)}</b>
        <small>${escapeHtml(item.subtitle)}</small>
        ${renderChainMeta(item)}
      </div>
      <button type="button" data-open-route="deal">Open</button>
    </article>
  `;
}

export function inlineEventMarkup(item, { itemStateClass, renderChainMeta }) {
  const actor = `<span class="timeline-actor">${escapeHtml(actorNameFor(item))}</span>`;
  return `
    <article class="timeline-event ${itemStateClass(item)}">
      <span class="timeline-marker"><i data-lucide="${timelineIcon(item)}" class="size-4"></i></span>
      <div class="timeline-card">
        ${actor}
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.subtitle || formatTime(item.time))}</small>
        ${timelineDetailsMarkup(item)}
        ${renderChainMeta(item)}
        ${timelineActionsMarkup(item)}
      </div>
    </article>
  `;
}
