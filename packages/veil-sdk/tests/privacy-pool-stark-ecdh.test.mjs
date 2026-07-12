import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";
import { resolveChannelKeyConfig } from "../../../src/services/encryption/channel-key-service.js";

const VECTORS = [
  {
    name: "v1",
    senderPrivate: "123456789",
    recipientPrivate: "987654321",
    ephemeralSecret: "55555555",
    senderAddress: "703710",
    recipientAddress: "74565",
    index: "7",
    senderPublic: "1434136217923271508453866209352937660241067429834292808151286080516596591512",
    recipientPublic: "2926129818382058060292797586226983168500087817366526668609240955782226185378",
    ephemeralPublic: "1769685882376994292462689427339052404721949152986150069472878329984969924088",
    sharedX: "3227469181715325385281588770946208148392149262773537190450537627262025154189",
    channelKey: "179637202791685300461637810554305542632862929515393471887149685626750707048",
    encChannelKey: "2396148834397534368962385399468815967759519846246592419412499641441250686570",
    encSenderAddr: "494327412390418542223697771304480826302020746030545829990525963670797568291",
    channelMarker: "286849817302970267259384218710958659437931707221663883342612422065366108548",
  },
  {
    name: "v2",
    senderPrivate: "18764998447377",
    recipientPrivate: "37529996894754",
    ephemeralSecret: "56294995342131",
    senderAddress: "279620",
    recipientAddress: "349525",
    index: "2",
    senderPublic: "2312427097287708636079652053516287631673672123813304439067281354054305329677",
    recipientPublic: "2739079425638935258637901328179457448471849987182574182337249915913836130785",
    ephemeralPublic: "3176899303187712529914025502419048167881065233012636209507496978535584859054",
    sharedX: "2874085783505645727406595915187825961385224544188482094109388132785607216800",
    channelKey: "586693337945382649219521899747863396914141325838571545734817236733008581558",
    encChannelKey: "2986585502661740008622684534780158284288377918466809836792248047644114734740",
    encSenderAddr: "743033992853387450518141739796190479575809180930835077670273177128123177132",
    channelMarker: "2056073110234077863172039055496965805545154938168410813224939401104414551523",
  },
  {
    name: "v3",
    senderPrivate: "42",
    recipientPrivate: "31415926535897932384626433832795",
    ephemeralSecret: "27182818284590452353602874713526",
    senderAddress: "1911",
    recipientAddress: "2184",
    index: "1",
    senderPublic: "116790107469130620194501433118398966236215846997329127478236149064647078075",
    recipientPublic: "500668347236990824635270341785639045285060903480233045674527907240013704420",
    ephemeralPublic: "2867948766186353283940854005744213581082868279349628475230226938392528030229",
    sharedX: "3438169494681206601864456036541344645272328231822233646046801282631174588138",
    channelKey: "2405288457599902849862801466068383317371503240701903054674934369478581934874",
    encChannelKey: "1840079568354515335617942365027165453657510603715803643078965131881285011801",
    encSenderAddr: "1595793277179391412192871060611140099412879401597916287879429757897840649847",
    channelMarker: "227834652490714049345883791315453281068476682585497579085899543311445720890",
  },
];

function itemFromEncryptedPayload(encryptedPayload, channelId = "channel-v1") {
  return {
    id: "1",
    channelId,
    eventType: sdk.VeilEventType.CHAT,
    encryptedPayload: encryptedPayload.encryptedPayload,
    payloadHash: encryptedPayload.payloadHash,
    envelopeHash: encryptedPayload.envelopeHash,
    payloadChunks: encryptedPayload.payloadChunks,
    nonce: encryptedPayload.nonce,
    mode: "shield",
    status: "confirmed",
  };
}

describe("Privacy Pool Stark ECDH primitives", () => {
  it("matches fixed Cairo/reference public key vectors", () => {
    for (const vector of VECTORS) {
      assert.equal(sdk.derivePrivacyPublicKey(vector.senderPrivate), vector.senderPublic, `${vector.name} sender`);
      assert.equal(sdk.derivePrivacyPublicKey(vector.recipientPrivate), vector.recipientPublic, `${vector.name} recipient`);
    }
  });

  it("derives sender shared_x, receiver shared_x, and ephemeral public key compatibility vectors", () => {
    for (const vector of VECTORS) {
      const sender = sdk.deriveSenderSharedX(vector.ephemeralSecret, vector.recipientPublic);
      assert.equal(sender.ephemeralPublicKey, vector.ephemeralPublic, `${vector.name} ephemeral public`);
      assert.equal(sender.sharedX, vector.sharedX, `${vector.name} sender shared_x`);
      assert.equal(
        sdk.deriveReceiverSharedX(vector.recipientPrivate, sender.ephemeralPublicKey),
        vector.sharedX,
        `${vector.name} receiver shared_x`,
      );
    }
  });

  it("computes Privacy Pool channel keys and recovers EncChannelInfo", () => {
    for (const vector of VECTORS) {
      const channelKey = sdk.computePrivacyPoolChannelKey({
        senderAddress: vector.senderAddress,
        senderPrivateKey: vector.senderPrivate,
        recipientAddress: vector.recipientAddress,
        recipientPublicKey: vector.recipientPublic,
      });
      assert.equal(channelKey, vector.channelKey, `${vector.name} channel key`);

      const encChannelInfo = sdk.encryptChannelInfo({
        ephemeralSecret: vector.ephemeralSecret,
        recipientPublicKey: vector.recipientPublic,
        channelKey,
        senderAddress: vector.senderAddress,
      });
      assert.deepEqual(encChannelInfo, {
        ephemeralPubkey: vector.ephemeralPublic,
        encChannelKey: vector.encChannelKey,
        encSenderAddr: vector.encSenderAddr,
      });

      const recovered = sdk.decryptChannelInfo({
        recipientPrivateKey: vector.recipientPrivate,
        encChannelInfo,
        recipientAddress: vector.recipientAddress,
        recipientPublicKey: vector.recipientPublic,
        expectedChannelMarker: vector.channelMarker,
      });
      assert.deepEqual(recovered, {
        channelKey: vector.channelKey,
        senderAddress: vector.senderAddress,
      });
    }
  });

  it("separates independent channel keys", () => {
    assert.notEqual(VECTORS[0].channelKey, VECTORS[1].channelKey);
    assert.notEqual(VECTORS[1].channelKey, VECTORS[2].channelKey);
  });

  it("rejects zero scalar, invalid scalar, and invalid public key inputs", () => {
    assert.throws(() => sdk.derivePrivacyPublicKey("0"), /non-zero/i);
    assert.throws(() => sdk.derivePrivacyPublicKey(sdk.STARK_CURVE_HALF_ORDER), /canonical/i);
    assert.throws(() => sdk.deriveSenderSharedX("0", VECTORS[0].recipientPublic), /non-zero/i);
    assert.throws(() => sdk.deriveSenderSharedX(sdk.STARK_CURVE_ORDER, VECTORS[0].recipientPublic), /curve order/i);
    assert.throws(() => sdk.deriveSenderSharedX(VECTORS[0].ephemeralSecret, "5"), /valid Stark curve x-coordinate/i);
  });

  it("rejects tampered EncChannelInfo when channel marker validation is supplied", () => {
    const vector = VECTORS[0];
    const tampered = {
      ephemeralPubkey: vector.ephemeralPublic,
      encChannelKey: (BigInt(vector.encChannelKey) + 1n).toString(),
      encSenderAddr: vector.encSenderAddr,
    };
    assert.throws(
      () =>
        sdk.decryptChannelInfo({
          recipientPrivateKey: vector.recipientPrivate,
          encChannelInfo: tampered,
          recipientAddress: vector.recipientAddress,
          recipientPublicKey: vector.recipientPublic,
          expectedChannelMarker: vector.channelMarker,
        }),
      /marker validation/i,
    );
  });

  it("roundtrips AES-GCM with recovered channel material and rejects the wrong recipient key", async () => {
    const vector = VECTORS[0];
    const encChannelInfo = sdk.encryptChannelInfo({
      ephemeralSecret: vector.ephemeralSecret,
      recipientPublicKey: vector.recipientPublic,
      channelKey: vector.channelKey,
      senderAddress: vector.senderAddress,
    });
    const recovered = sdk.decryptChannelInfo({
      recipientPrivateKey: vector.recipientPrivate,
      encChannelInfo,
      recipientAddress: vector.recipientAddress,
      recipientPublicKey: vector.recipientPublic,
      expectedChannelMarker: vector.channelMarker,
    });
    const messageKey = await sdk.deriveMessageKey({ channelKey: recovered.channelKey, channelId: "channel-v1" });
    const encrypted = await sdk.encryptMessage({
      key: messageKey,
      context: { channelId: "channel-v1", eventType: sdk.VeilEventType.CHAT },
      payload: { kind: "chat", sender: "alice", message: "real recovered channel material" },
    });
    const decrypted = await sdk.decryptMessage({
      key: messageKey,
      context: { channelId: "channel-v1", eventType: sdk.VeilEventType.CHAT },
      item: itemFromEncryptedPayload(encrypted),
    });
    assert.equal(decrypted.message, "real recovered channel material");

    const wrongRecipientRecovered = sdk.decryptChannelInfo({
      recipientPrivateKey: VECTORS[1].recipientPrivate,
      encChannelInfo,
    });
    const wrongMessageKey = await sdk.deriveMessageKey({
      channelKey: wrongRecipientRecovered.channelKey,
      channelId: "channel-v1",
    });
    await assert.rejects(
      () =>
        sdk.decryptMessage({
          key: wrongMessageKey,
          context: { channelId: "channel-v1", eventType: sdk.VeilEventType.CHAT },
          item: itemFromEncryptedPayload(encrypted),
        }),
      /operation failed|decrypt/i,
    );
  });
});

describe("runtime channel key authority", () => {
  it("does not create or read a localStorage fallback channel key for production direct-helper mode", () => {
    const previousWindow = globalThis.window;
    let localStorageTouched = false;
    globalThis.window = {
      localStorage: {
        getItem() {
          localStorageTouched = true;
          throw new Error("localStorage should not be read");
        },
        setItem() {
          localStorageTouched = true;
          throw new Error("localStorage should not be written");
        },
      },
    };

    try {
      const logs = [];
      const result = resolveChannelKeyConfig(
        { configuredChannelKey: "", timelineMode: "direct-helper", helperAddress: "0x123" },
        { veilLog: (...args) => logs.push(args) },
      );
      assert.deepEqual(result, {
        channelKeySource: "missing",
      });
      assert.equal(localStorageTouched, false);
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  it("ignores legacy env channel keys instead of treating them as real Privacy Pool material", () => {
    const logs = [];
    const result = resolveChannelKeyConfig(
      { configuredChannelKey: "0x1234", timelineMode: "direct-helper", helperAddress: "0x123" },
      { veilLog: (...args) => logs.push(args) },
    );
    assert.deepEqual(result, {
      channelKeySource: "legacy-env-ignored",
    });
    assert.equal(logs[0][1], "encryption.legacy_env_channel_key.ignored");
  });
});
