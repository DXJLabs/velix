import { inviteWaitingCardMarkup } from "../../ui/invite-ui.js";
import { escapeHtml } from "../../ui/html.js";

export function createInviteController({
  state,
  channels,
  messages,
  document,
  conversationSearch,
  dealCreationEnabled = false,
  onboardingInviteEnabled = true,
  knownVeilCounterparties,
  resolveCounterparty,
  recipientDiscovery,
  shortHash,
  counterpartyAvatar,
  starkIdentityName,
  createDealInviteLink,
  confirmedTimelineMeta,
  connectWallet,
  beginChannelModal,
  setAppLoading,
  transactionDelay,
  clearAppLoading,
  finishChannelModal,
  setTransactionModal,
  failChannelModal,
  beginCounterpartyDecisionModal,
  getVeilClient,
  veilError,
  saveLocalChannels,
  renderConversationList,
  openChannel,
  showScreen,
  renderChannel,
  renderWorkflowProgress,
  awardReward,
  showToast,
  currentChannel,
  statusPillClass,
  iconRefresh,
  copyToClipboard,
  defaultOfferAmount = "450 STRK",
}) {
  let recipientDiscoveryTimer;
  let recipientDiscoveryRequestId = 0;
  let latestRecipientDiscovery = null;

  function newDealTitleValue() {
    return document.querySelector("#new-deal-title")?.value.trim() || "Rights Transfer";
  }

  function newDealCounterpartyValue() {
    const input = document.querySelector("#new-deal-counterparty");
    return input ? input.value.trim() : "bob.stark";
  }

  function inviteTargetValue() {
    return document.querySelector("#invite-target")?.value.trim() || "Counterparty";
  }

  function ensureInviteCode() {
    if (state.inviteCode) return state.inviteCode;
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    state.inviteCode = Array.from(bytes, (value) => value.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 12);
    return state.inviteCode;
  }

  function createInviteRoomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `room-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function onboardingInviteLink(target, roomId, dealTitle) {
    ensureInviteCode();
    const url = new URL(createDealInviteLink());
    url.searchParams.set("onboarding", "1");
    url.searchParams.set("room", roomId);
    url.searchParams.set("deal", dealTitle);
    if (state.walletAddress) url.searchParams.set("inviter", state.walletAddress);
    if (target) url.searchParams.set("counterparty", target);
    return url.toString();
  }

  function readIncomingInvite() {
    const view = document.defaultView;
    if (!view) return null;
    const url = new URL(view.location.href);
    if (url.searchParams.get("onboarding") !== "1") return null;

    const inviteCode = String(url.searchParams.get("invite") || "").trim();
    const roomId = String(url.searchParams.get("room") || "").trim();
    const dealTitle = String(url.searchParams.get("deal") || "Private Deal").trim().slice(0, 120);
    const inviter = String(url.searchParams.get("inviter") || "").trim();

    if (!/^[a-z0-9]{6,32}$/i.test(inviteCode)) return null;
    if (!/^room-[a-f0-9]{32}$/i.test(roomId)) return null;
    if (inviter && !/^0x[0-9a-f]{1,64}$/i.test(inviter)) return null;

    return Object.freeze({
      inviteCode,
      roomId,
      dealTitle: dealTitle || "Private Deal",
      inviter,
    });
  }

  function openIncomingInvite() {
    const invite = readIncomingInvite();
    if (!invite) return false;

    const panel = document.querySelector("#incoming-invite-panel");
    const title = document.querySelector("#incoming-invite-title");
    const inviter = document.querySelector("#incoming-invite-inviter");
    const room = document.querySelector("#incoming-invite-room");

    if (panel) panel.hidden = false;
    if (title) title.textContent = invite.dealTitle;
    if (inviter) inviter.textContent = invite.inviter ? shortHash(invite.inviter) : "VEIL counterparty";
    if (room) room.textContent = invite.roomId.slice(0, 17) + "…";

    document.querySelector(".new-deal-journey")?.setAttribute("hidden", "");
    document.querySelector(".new-deal-primary-panel")?.setAttribute("hidden", "");
    document.querySelector(".new-deal-invite-panel")?.setAttribute("hidden", "");
    document.querySelector(".new-deal-flow")?.setAttribute("hidden", "");

    showScreen("new-deal");
    showToast("VEIL invitation received.");
    return true;
  }

  async function acceptIncomingInvite() {
    const invite = readIncomingInvite();
    if (!invite) {
      showToast("This VEIL invitation is invalid or incomplete.");
      return false;
    }

    if (!state.walletConnected) {
      const connected = await connectWallet({ goToInbox: false, preferPrivacyWallet: true });
      if (!connected) return false;
    }

    let channel = channels.find((candidate) => candidate.id === invite.roomId);
    if (!channel) {
      const person = invite.inviter ? shortHash(invite.inviter) : "Counterparty";
      channel = createLocalChannelModel({
        channelId: invite.roomId,
        title: invite.dealTitle,
        person,
        status: "Private Setup Required",
        last: "Waiting for wallet-managed encryption",
        invited: false,
        pendingJoin: false,
        counterpartyOnVeil: true,
        dealId: `Invite ${invite.inviteCode}`,
        counterpartyAddress: invite.inviter,
        privateMessagingReady: false,
      });
      channels.unshift(channel);
      messages[channel.id] = [
        {
          type: "event",
          title: "VEIL invitation opened",
          subtitle: "The invite was accepted on this device. No on-chain acceptance has been submitted yet.",
          time: Date.now(),
          offchain: true,
          actor: "System",
        },
      ];
    } else {
      channel.status = "Private Setup Required";
      channel.last = "Waiting for wallet-managed encryption";
      channel.privateMessagingReady = false;
    }

    state.channelId = channel.id;
    resetDealStateForPendingChannel();
    saveLocalChannels();
    renderConversationList();

    const view = document.defaultView;
    if (view) {
      view.history.replaceState({}, "", view.location.pathname);
    }

    openChannel(channel.id);
    showToast("Invite opened. Private messaging is blocked until wallet-managed encryption is ready.");
    return true;
  }

  function counterpartyLookup(value = newDealCounterpartyValue()) {
    return resolveCounterparty(value, knownVeilCounterparties, shortHash);
  }

  function nextDealId() {
    const id = `Deal #${state.dealSequence}`;
    state.dealSequence += 1;
    return id;
  }

  function resetDealStateForPendingChannel() {
    state.offerAccepted = false;
    state.paymentSent = false;
    state.escrowDeposits = { buyer: false, seller: false };
    state.escrowConfirmations = { buyer: false, seller: false };
    state.escrowReleased = false;
    state.escrowActivated = false;
    state.escrowDisputeOpened = false;
    state.latestOfferId = "";
    state.latestOfferCommitments = null;
    state.latestOfferSellerAddress = "";
    state.latestEscrowId = "";
    state.negotiationStep = "draft";
    state.initialOfferAmount = "500 STRK";
    state.latestOfferAmount = defaultOfferAmount;
  }

  function createLocalChannelModel({
    title = "Rights Transfer",
    person = "Bob",
    status = "Negotiation Active",
    last = "Bob joined the deal",
    invited = false,
    pendingJoin = false,
    counterpartyOnVeil = true,
    dealId = "",
    counterpartyAddress = "",
    channelId = "",
    privateMessagingReady = true,
  } = {}) {
    const channelNumber = channels.length + 1;
    const resolvedChannelId = channelId || `channel-${Date.now().toString(36)}`;
    return {
      id: resolvedChannelId,
      title,
      person,
      avatar: counterpartyAvatar(person),
      mode: "Private",
      status,
      unread: 0,
      time: "now",
      last,
      channelNumber,
      dealId,
      counterpartyAddress,
      privateMessagingReady,
      inviteLink: invited ? createDealInviteLink() : "",
      invited,
      pendingJoin,
      counterpartyOnVeil,
      local: true,
    };
  }

  function seedDealTimeline(channel) {
    if (channel.pendingJoin && channel.invited) {
      return [
        {
          type: "event",
          title: "Invite link generated",
          subtitle: `${channel.dealId} is waiting for ${channel.person}.`,
          inviteLink: channel.inviteLink || createDealInviteLink(),
          time: Date.now(),
          offchain: true,
          actor: "System",
          ...confirmedTimelineMeta(`${channel.id}-invite`, 10),
        },
      ];
    }

    if (channel.pendingJoin) {
      return [
        {
          type: "event",
          title: `${channel.dealId} created`,
          subtitle: `Private deal request sent to ${channel.person}.`,
          time: Date.now(),
          offchain: true,
          actor: "Alice",
          ...confirmedTimelineMeta(`${channel.id}-created`, 10),
        },
        {
          type: "event",
          title: "Notification sent",
          subtitle: `${channel.person} must accept before negotiation opens.`,
          time: Date.now() + 1,
          offchain: true,
          actor: "System",
          ...confirmedTimelineMeta(`${channel.id}-notification`, 11),
        },
      ];
    }

    return [
      {
        type: "event",
        title: `${channel.person} joined the deal`,
        subtitle: "Negotiation is ready.",
        time: Date.now(),
        offchain: true,
        actor: channel.person,
        ...confirmedTimelineMeta(`${channel.id}-joined`, 12),
      },
    ];
  }

  async function createOnboardingInvite({ inviteOnly = false } = {}) {
    if (!onboardingInviteEnabled) {
      showToast("VEIL onboarding invites are unavailable.");
      return false;
    }

    const target = inviteOnly ? inviteTargetValue() : newDealCounterpartyValue();
    if (!target) {
      showToast("Enter a .stark name, Starknet address, or contact first.");
      return false;
    }

    const person = latestRecipientDiscovery?.starkName
      || latestRecipientDiscovery?.address
      || target;
    beginChannelModal({ inviteOnly: true, person, dealId: "VEIL Invite" });
    setAppLoading("channel", "Preparing VEIL Invite");

    try {
      await transactionDelay(260);
      const roomId = createInviteRoomId();
      const dealTitle = newDealTitleValue();
      const link = onboardingInviteLink(target, roomId, dealTitle);
      const dealId = nextDealId();
      const channel = createLocalChannelModel({
        channelId: roomId,
        title: dealTitle,
        person,
        status: "Waiting for Counterparty",
        last: "Invite link ready",
        invited: true,
        pendingJoin: true,
        counterpartyOnVeil: false,
        dealId,
        counterpartyAddress: /^0x[0-9a-fA-F]{1,64}$/.test(target) ? target : "",
      });
      channel.inviteLink = link;
      channels.unshift(channel);
      messages[channel.id] = seedDealTimeline(channel);
      state.channelId = channel.id;
      saveLocalChannels();
      renderConversationList();
      openChannel(channel.id);

      let copied = false;
      try {
        await copyToClipboard(link);
        copied = true;
      } catch {}

      state.lastInviteLink = link;
      clearAppLoading("channel");
      finishChannelModal({
        title: "Invite Ready",
        subtitle: copied
          ? "Link copied. Share it with your counterparty."
          : "Invite created. Copy it from the waiting card.",
      });
      showToast(
        copied
          ? "VEIL onboarding invite copied."
          : "VEIL onboarding invite ready.",
      );
      return { link, copied };
    } catch (error) {
      clearAppLoading("channel");
      failChannelModal({
        title: "Invite Failed",
        subtitle: "Unable to prepare this VEIL invite.",
        detail: error?.message || "Retry creating the invite.",
      });
      return false;
    }
  }

  async function createDealChannel({ inviteOnly = false } = {}) {
    if (!dealCreationEnabled) {
      showToast("Deal and invite creation are unavailable until recipient discovery and live two-party E2E are verified.");
      return false;
    }
    if (!state.walletConnected) {
      const connected = await connectWallet({ goToInbox: false });
      if (!connected) return;
    }

    const rawCounterparty = inviteOnly ? inviteTargetValue() : newDealCounterpartyValue();
    const lookup = inviteOnly ? {
      ...counterpartyLookup(rawCounterparty),
      status: "not_on_veil",
    } : counterpartyLookup(rawCounterparty);
    const requiresInvite = inviteOnly || lookup.status !== "available";
    const person = lookup.displayName;
    const dealId = nextDealId();
    beginChannelModal({ inviteOnly: requiresInvite, person, dealId });
    setAppLoading("channel", requiresInvite ? "Creating Invite Link" : "Creating Deal Channel");
    try {
      await transactionDelay(450);
      const channel = createLocalChannelModel({
        title: newDealTitleValue(),
        person,
        status: requiresInvite ? "Waiting for Counterparty" : "Waiting for Bob",
        last: requiresInvite ? "Invite link generated" : "Deal request sent",
        invited: requiresInvite,
        pendingJoin: true,
        counterpartyOnVeil: !requiresInvite,
        dealId,
        counterpartyAddress: /^0x[0-9a-fA-F]{1,64}$/.test(rawCounterparty) ? rawCounterparty : "",
      });
      channels.unshift(channel);
      messages[channel.id] = seedDealTimeline(channel);
      resetDealStateForPendingChannel();
      if (conversationSearch) conversationSearch.value = "";
      saveLocalChannels();
      renderConversationList();
      openChannel(channel.id);

      if (requiresInvite) {
        await transactionDelay(550);
        clearAppLoading("channel");
        finishChannelModal({
          title: "Invite Link Ready",
          subtitle: `${dealId} is waiting for ${person}.`,
        });
        return;
      }

      setTransactionModal({
        subtitle: "Sending private deal request.",
        detail: `Waiting for ${person} to accept...`,
      });
      try {
        await getVeilClient().createChannel({
          channelId: channel.id,
          title: channel.title,
        });
        clearAppLoading("channel");
        finishChannelModal({
          title: "Deal Channel Created",
          subtitle: `${dealId} is waiting for ${person}.`,
        });
      } catch (error) {
        veilError("channel.create.failed", error, {
          where: "createDealChannel",
          channelId: channel.id,
          howToFix: "Confirm wallet connection and helper transport before creating a production on-chain channel.",
        });
        clearAppLoading("channel");
        finishChannelModal({
          title: "Deal Saved",
          subtitle: `${dealId} is waiting for ${person}.`,
        });
      }
    } catch (error) {
      veilError("channel.create.failed", error, {
        where: "createDealChannel",
        channelId: "local",
        howToFix: "Confirm wallet connection and helper transport before creating a production on-chain channel.",
      });
      clearAppLoading("channel");
      failChannelModal({
        title: "Channel Setup Failed",
        subtitle: "Unable to create this deal channel.",
        detail: error?.message || "Retry channel creation.",
      });
    }
  }

  function channelRequiresJoin(channel = currentChannel()) {
    if (!channel) return false;
    const status = String(channel.status || "").toLowerCase();
    return Boolean(channel.pendingJoin || status.includes("waiting for counterparty") || status.includes("waiting for bob"));
  }

  async function acceptPendingCounterparty(channel = currentChannel()) {
    if (!channel || !channelRequiresJoin(channel)) return;
    beginCounterpartyDecisionModal({ accepting: true, person: channel.person });
    setAppLoading("channel", "Accepting Invitation");
    try {
      await transactionDelay(360);
      setTransactionModal({
        subtitle: "Creating secure channel.",
        detail: "Preparing Direct encrypted messaging...",
      });
      await transactionDelay(520);
      channel.pendingJoin = false;
      channel.status = "Negotiation Active";
      channel.last = `${channel.person} joined the deal`;
      channel.time = "now";
      resetDealStateForPendingChannel();
      state.channelId = channel.id;
      messages[channel.id] ||= [];
      const identity = starkIdentityName(channel.person);
      messages[channel.id].push({
        type: "event",
        title: `${identity} joined the deal`,
        subtitle: `Invite accepted by ${identity}.`,
        time: Date.now(),
        offchain: true,
        actor: channel.person,
        ...confirmedTimelineMeta(`${channel.id}-accepted`, 12),
      });
      messages[channel.id].push({
        type: "event",
        title: "Secure channel established",
        subtitle: "Encrypted channel established. Transaction metadata remains public.",
        time: Date.now() + 1,
        offchain: true,
        actor: "System",
        ...confirmedTimelineMeta(`${channel.id}-ecdh`, 13),
      });
      if (channel.invited) awardReward("inviteUserJoined");
      saveLocalChannels();
      renderConversationList();
      renderChannel();
      renderWorkflowProgress();
      clearAppLoading("channel");
      finishChannelModal({
        title: "Invitation Accepted",
        subtitle: `${channel.person} joined. Secure channel established.`,
      });
    } catch (error) {
      clearAppLoading("channel");
      failChannelModal({
        title: "Invitation Failed",
        subtitle: "Unable to accept this deal request.",
        detail: error?.message || "Retry accepting the invitation.",
      });
    }
  }

  async function declinePendingCounterparty(channel = currentChannel()) {
    if (!channel || !channelRequiresJoin(channel)) return;
    beginCounterpartyDecisionModal({ accepting: false, person: channel.person });
    setAppLoading("channel", "Declining Request");
    try {
      await transactionDelay(520);
      channel.pendingJoin = false;
      channel.status = "Declined";
      channel.last = `${channel.person} declined the deal`;
      channel.time = "now";
      messages[channel.id] ||= [];
      messages[channel.id].push({
        type: "event",
        title: `${channel.person} declined the deal`,
        subtitle: "Deal request closed.",
        time: Date.now(),
        offchain: true,
        actor: channel.person,
        ...confirmedTimelineMeta(`${channel.id}-declined`, 12),
      });
      saveLocalChannels();
      renderConversationList();
      renderChannel();
      clearAppLoading("channel");
      finishChannelModal({
        title: "Request Declined",
        subtitle: "Deal request closed.",
      });
    } catch (error) {
      clearAppLoading("channel");
      failChannelModal({
        title: "Decline Failed",
        subtitle: "Unable to close this request.",
        detail: error?.message || "Retry declining the request.",
      });
    }
  }

  function renderNewDeal() {
    const resultName = document.querySelector("#counterparty-result-name");
    const resultDetail = document.querySelector("#counterparty-result-detail");
    const resultStatus = document.querySelector("#counterparty-result-status");
    const actionHint = document.querySelector("#counterparty-action-hint");
    const primaryAction = document.querySelector("#new-deal-primary-action");
    const inviteTarget = document.querySelector("#invite-target");
    const inviteFormPanel = document.querySelector("#invite-form-panel");
    const showInviteForm = document.querySelector("#show-invite-form");
    const query = newDealCounterpartyValue();

    if (!dealCreationEnabled) {
      prepareOnboardingUi(primaryAction, inviteFormPanel, showInviteForm);
      scheduleRecipientDiscovery(query, {
        resultName,
        resultDetail,
        resultStatus,
        actionHint,
        primaryAction,
        inviteFormPanel,
        showInviteForm,
      });
      iconRefresh();
      return;
    }

    const lookup = counterpartyLookup(query);
    if (resultName) resultName.textContent = lookup.displayName;
    if (resultDetail) resultDetail.textContent = lookup.detail;
    if (resultStatus) {
      resultStatus.textContent = lookup.badge;
      resultStatus.className = lookup.badgeClass;
    }
    if (actionHint) actionHint.textContent = lookup.hint;
    if (primaryAction) {
      primaryAction.disabled = false;
      primaryAction.removeAttribute("aria-disabled");
      primaryAction.dataset.newDealAction = lookup.status === "available" ? "existing" : "invite";
      primaryAction.innerHTML = lookup.status === "available"
        ? `<i data-lucide="plus" class="size-5"></i><span>${escapeHtml(lookup.action)}</span>`
        : `<i data-lucide="link" class="size-5"></i><span>${escapeHtml(lookup.action)}</span>`;
    }
    if (inviteTarget && document.activeElement !== inviteTarget) inviteTarget.value = query;
    if (inviteFormPanel) inviteFormPanel.hidden = !state.inviteFormOpen;
    if (showInviteForm) showInviteForm.hidden = state.inviteFormOpen;
    if (showInviteForm) {
      showInviteForm.disabled = false;
      showInviteForm.removeAttribute("aria-disabled");
    }
    iconRefresh();
  }

  function setPrimaryAction(primaryAction, {
    label,
    icon = "send",
    action = "",
    disabled = false,
  }) {
    if (!primaryAction) return;
    primaryAction.disabled = disabled;
    primaryAction.setAttribute("aria-disabled", disabled ? "true" : "false");
    if (action && !disabled) primaryAction.dataset.newDealAction = action;
    else primaryAction.removeAttribute("data-new-deal-action");
    primaryAction.innerHTML = `<i data-lucide="${icon}" class="size-5"></i><span>${escapeHtml(label)}</span>`;
  }

  function prepareOnboardingUi(primaryAction, inviteFormPanel, showInviteForm) {
    setPrimaryAction(primaryAction, {
      label: "Checking private readiness",
      icon: "loader-circle",
      disabled: true,
    });
    if (inviteFormPanel) inviteFormPanel.hidden = !state.inviteFormOpen;
    if (showInviteForm) {
      showInviteForm.hidden = state.inviteFormOpen;
      showInviteForm.disabled = !onboardingInviteEnabled;
      showInviteForm.setAttribute(
        "aria-disabled",
        onboardingInviteEnabled ? "false" : "true",
      );
    }
    const inviteSubmit = document.querySelector(
      '#invite-form-panel [data-new-deal-action="invite"]',
    );
    if (inviteSubmit && !state.demoRuntimeMode) {
      inviteSubmit.dataset.newDealAction = "onboard";
    }
  }

  function updateOnboardingAction(result, {
    primaryAction,
    inviteFormPanel,
    showInviteForm,
  }) {
    prepareOnboardingUi(primaryAction, inviteFormPanel, showInviteForm);
    if (!onboardingInviteEnabled) {
      lockDealCreation(primaryAction, inviteFormPanel, showInviteForm);
      return;
    }

    if (result.status === "resolved") {
      const registered = result.privacyPoolStatus === "registered";
      setPrimaryAction(primaryAction, {
        label: registered ? "Copy VEIL Invite" : "Invite to Register",
        icon: registered ? "send" : "user-plus",
        action: "onboard",
      });
      return;
    }

    if (result.status === "not_found") {
      setPrimaryAction(primaryAction, {
        label: "Counterparty not found",
        icon: "search-x",
        disabled: true,
      });
      return;
    }

    if (result.status === "invalid") {
      setPrimaryAction(primaryAction, {
        label: "Enter a valid identity",
        icon: "circle-alert",
        disabled: true,
      });
      return;
    }

    setPrimaryAction(primaryAction, {
      label: "Private readiness unavailable",
      icon: "shield-alert",
      disabled: true,
    });
  }

  function lockDealCreation(primaryAction, inviteFormPanel, showInviteForm) {
    if (primaryAction) {
      primaryAction.disabled = true;
      primaryAction.setAttribute("aria-disabled", "true");
      primaryAction.removeAttribute("data-new-deal-action");
      primaryAction.innerHTML = '<i data-lucide="lock" class="size-5"></i><span>Deal Creation Unavailable</span>';
    }
    if (inviteFormPanel) inviteFormPanel.hidden = true;
    if (showInviteForm) {
      showInviteForm.hidden = false;
      showInviteForm.disabled = true;
      showInviteForm.setAttribute("aria-disabled", "true");
    }
  }

  function scheduleRecipientDiscovery(query, elements) {
    clearTimeout(recipientDiscoveryTimer);
    const requestId = ++recipientDiscoveryRequestId;

    if (!query) {
      applyRecipientDiscovery({ status: "invalid", query }, elements);
      return;
    }
    if (!recipientDiscovery?.resolve) {
      applyRecipientDiscovery({ status: "unavailable", query }, elements);
      return;
    }

    const { resultName, resultDetail, resultStatus, actionHint } = elements;
    if (resultName) resultName.textContent = query;
    if (resultDetail) resultDetail.textContent = "Resolving recipient on Starknet Sepolia...";
    if (resultStatus) {
      resultStatus.textContent = "Checking";
      resultStatus.className = "status-pill public";
    }
    if (actionHint) actionHint.textContent = "Identity lookup only. No request, notification, or invite will be created.";

    recipientDiscoveryTimer = setTimeout(async () => {
      const result = await recipientDiscovery.resolve(query);
      if (requestId !== recipientDiscoveryRequestId || newDealCounterpartyValue() !== query) return;
      applyRecipientDiscovery(result, elements);
      iconRefresh();
    }, 320);
  }

  function applyRecipientDiscovery(result, elements) {
    const {
      resultName,
      resultDetail,
      resultStatus,
      actionHint,
    } = elements;
    latestRecipientDiscovery = result;
    if (!dealCreationEnabled) updateOnboardingAction(result, elements);
    const address = result.address ? shortHash(result.address) : "";
    if (resultName) resultName.textContent = result.starkName || address || result.query || "Counterparty";

    if (result.status === "resolved") {
      const reverseNote = result.source === "starknet-id" && !result.reverseVerified
        ? " The name is not the address primary reverse name."
        : "";

      if (result.privacyPoolStatus === "registered") {
        if (resultDetail) resultDetail.textContent = `${address} resolved on Starknet Sepolia.${reverseNote} Registered in the VEIL Privacy Pool.`;
        if (resultStatus) {
          resultStatus.textContent = "Pool Participant";
          resultStatus.className = "status-pill escrow-active";
        }
        if (actionHint) actionHint.textContent = "Recipient is registered. You can share a VEIL invite now; the private room opens after the two-party channel check succeeds.";
        return;
      }

      if (result.privacyPoolStatus === "not_registered") {
        if (resultDetail) resultDetail.textContent = `${address} resolved on Starknet Sepolia.${reverseNote} No viewing public key is registered in the VEIL Privacy Pool.`;
        if (resultStatus) {
          resultStatus.textContent = "Registration Required";
          resultStatus.className = "status-pill waiting-deposit";
        }
        if (actionHint) actionHint.textContent = "Invite them to open VEIL and connect Ready Wallet. The private room unlocks after their Privacy Pool registration is detected.";
        return;
      }

      if (resultDetail) resultDetail.textContent = `${address} resolved on Starknet Sepolia.${reverseNote} Privacy Pool registration could not be verified.`;
      if (resultStatus) {
        resultStatus.textContent = "Pool Unverified";
        resultStatus.className = "status-pill waiting-deposit";
      }
      if (actionHint) actionHint.textContent = "Identity resolution succeeded, but the VEIL Privacy Pool check failed closed. Deal creation remains locked.";
      return;
    }

    if (result.status === "not_found") {
      if (resultDetail) resultDetail.textContent = "No Starknet address was found for this .stark name.";
      if (resultStatus) {
        resultStatus.textContent = "Not Found";
        resultStatus.className = "status-pill waiting-deposit";
      }
      if (actionHint) actionHint.textContent = "Check the .stark name or use a valid Starknet address.";
      return;
    }

    if (result.status === "invalid") {
      if (resultDetail) resultDetail.textContent = "Enter a valid .stark name or Starknet address.";
      if (resultStatus) {
        resultStatus.textContent = "Invalid";
        resultStatus.className = "status-pill waiting-deposit";
      }
      if (actionHint) actionHint.textContent = "No request, notification, or invite will be created.";
      return;
    }

    if (resultDetail) resultDetail.textContent = "Starknet recipient discovery is temporarily unavailable.";
    if (resultStatus) {
      resultStatus.textContent = "Unavailable";
      resultStatus.className = "status-pill waiting-deposit";
    }
    if (actionHint) actionHint.textContent = "Check the Sepolia RPC and retry. Deal creation remains locked.";
  }

  function renderInviteWaitingCard(channel) {
    return inviteWaitingCardMarkup(channel, {
      inviteLink: channel.invited ? channel.inviteLink || createDealInviteLink() : "",
    });
  }

  async function copyInviteLink() {
    const link = currentChannel()?.inviteLink || createDealInviteLink();
    try {
      await copyToClipboard(link);
      showToast("Invite link copied.");
    } catch {
      showToast("Copy unavailable.");
    }
  }

  async function shareInvite(channelName) {
    const link = currentChannel()?.inviteLink || createDealInviteLink();
    try {
      await copyToClipboard(link);
    } catch {}
    const label = channelName ? `${channelName[0].toUpperCase()}${channelName.slice(1)}` : "Share";
    showToast(`${label} invite ready.`);
  }

  return {
    acceptPendingCounterparty,
    channelRequiresJoin,
    copyInviteLink,
    counterpartyLookup,
    createDealChannel,
    createOnboardingInvite,
    openIncomingInvite,
    acceptIncomingInvite,
    createLocalChannelModel,
    declinePendingCounterparty,
    inviteTargetValue,
    newDealCounterpartyValue,
    newDealTitleValue,
    nextDealId,
    renderInviteWaitingCard,
    renderNewDeal,
    resetDealStateForPendingChannel,
    seedDealTimeline,
    shareInvite,
  };
}
