import { chatTransportMode as resolveChatTransportMode, transactionTransportMode as resolveTransactionTransportMode } from "./chat-feature.js";
import { resizeComposerInput } from "../../ui/chat/chat-ui.js";

export function createChatController({
  state,
  messageInput,
  timelineMode,
  chatDisplayMode,
  directHelperMessageMode,
  currentChannel,
  channelMessages,
  saveLocalChannels,
  renderChannel,
  safeSubmit,
  awardReward,
  showToast,
  getVeilClient,
  scrollFeedToBottom,
  now = () => Date.now(),
}) {
  function chatTransportMode() {
    return resolveChatTransportMode(timelineMode, directHelperMessageMode, chatDisplayMode);
  }

  function transactionTransportMode(requestedMode) {
    return resolveTransactionTransportMode(timelineMode, requestedMode, directHelperMessageMode);
  }

  function addLocalItem(item) {
    channelMessages().push(item);
    const channel = currentChannel();
    if (item.type === "message") {
      channel.last = `${item.self ? "You" : item.sender}: ${item.body}`;
    } else {
      channel.last = item.title;
    }
    channel.time = "now";
    saveLocalChannels();
    renderChannel();
    scrollFeedToBottom();
  }

  function updateLocalItem(item, updates) {
    Object.assign(item, updates);
    saveLocalChannels();
    renderChannel();
  }

  async function sendChat(message) {
    const mode = chatTransportMode();
    const submitted = await safeSubmit(
      () => getVeilClient().sendMessage({ channelId: state.channelId, sender: "you", message, mode }),
      {
        type: "message",
        sender: "You",
        actor: "Alice",
        body: message,
        self: true,
        time: now(),
        mode: chatDisplayMode,
      },
      "Message sent.",
      {
        actionLabel: "Sending Shielded Message",
        successTitle: "Shielded Message Sent",
        successSubtitle: "ECDH encrypted message stored.",
      },
    );
    if (submitted) awardReward("sendMessage");
    return submitted;
  }

  function formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
  }

  async function sendAttachment(file) {
    if (!file) return;
    const fileType = file.type || "file";
    await sendChat(`Attached file: ${file.name} (${fileType}; ${formatFileSize(file.size)})`);
  }

  function applyAiDraft() {
    if (!messageInput) return;
    if (!messageInput.value.trim()) {
      messageInput.value = "Thanks. I will review the offer and confirm the next step shortly.";
    }
    resizeComposerInput(messageInput);
    messageInput.focus();
    showToast("AI draft ready.");
  }

  return {
    chatTransportMode,
    transactionTransportMode,
    addLocalItem,
    updateLocalItem,
    sendChat,
    formatFileSize,
    sendAttachment,
    applyAiDraft,
    resizeComposerInput,
  };
}
