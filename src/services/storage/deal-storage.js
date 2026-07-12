import { LOCAL_CHANNELS_KEY } from "../../app/runtime-config.js";

export function createDealStorage({
  channels,
  messages,
  readJsonStorage,
  writeJsonStorage,
  logger,
}) {
  function persistentChannel(channel) {
    const { last, ...metadata } = channel;
    void last;
    return metadata;
  }

  function persistentMessage(item) {
    const { body, payload, message, memo, terms, ...metadata } = item;
    void body;
    void payload;
    void message;
    void memo;
    void terms;
    return metadata;
  }

  function loadLocalChannels() {
    try {
      const payload = readJsonStorage(LOCAL_CHANNELS_KEY, []);
      if (!Array.isArray(payload)) return;
      payload.forEach((entry) => {
        if (!entry?.channel?.id || channels.some((channel) => channel.id === entry.channel.id)) return;
        channels.unshift({ ...entry.channel, local: true });
        messages[entry.channel.id] = Array.isArray(entry.messages) ? entry.messages : [];
      });
    } catch (error) {
      logger.veilError("channel.local.load.failed", error, {
        where: "loadLocalChannels",
        howToFix: "Clear local VEIL cache if local draft channels cannot be parsed.",
      });
    }
  }

  function saveLocalChannels() {
    try {
      const localChannels = channels
        .filter((channel) => channel.local)
        .map((channel) => ({
          channel: persistentChannel(channel),
          messages: (messages[channel.id] || []).map(persistentMessage),
        }));
      writeJsonStorage(LOCAL_CHANNELS_KEY, localChannels);
    } catch (error) {
      logger.veilError("channel.local.save.failed", error, {
        where: "saveLocalChannels",
        howToFix: "Check browser storage availability before relying on local draft channels.",
      });
    }
  }

  return { loadLocalChannels, saveLocalChannels };
}
