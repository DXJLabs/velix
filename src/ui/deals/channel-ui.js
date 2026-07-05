export function renderChannelHeader(document, {
  channel,
  dealId,
  statusPillClass,
}) {
  document.querySelector("#channel-title").textContent = channel.title;
  document.querySelector("#channel-meta").textContent = `${dealId} Â· ${channel.person} - ${channel.status}`;
  const contextTitle = document.querySelector("#channel-context-title");
  const contextParty = document.querySelector("#channel-context-party");
  const contextStatus = document.querySelector("#channel-context-status");
  if (contextTitle) contextTitle.textContent = channel.title;
  if (contextParty) contextParty.textContent = channel.person;
  if (contextStatus) {
    contextStatus.textContent = channel.status;
    contextStatus.className = statusPillClass(channel.status);
  }
}

export function channelFeedMarkup({ waitingMarkup = "", feedMarkup = "" } = {}) {
  return `
    <div class="timeline-day"><span>Today</span></div>
    ${waitingMarkup}
    ${feedMarkup}
  `;
}
