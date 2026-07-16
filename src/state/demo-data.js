import {
  ACTIVE_DEAL_LABEL,
  CHAT_DISPLAY_MODE,
  DEAL_OFFER_AMOUNT,
} from "../app/runtime-config.js";

export const activeDealId = "20260625";
export const demoBlockStart = 11517060;
export const knownVeilCounterparties = new Set([
  "alice.stark",
  "bob.stark",
  "mira.stark",
  "northline.stark",
]);

export function createDemoData({ now = Date.now(), demoTxHash }) {
  const minute = 60_000;
  const confirmedTimelineMeta = (seed, offset = 0) => ({
    status: "confirmed",
    blockNumber: demoBlockStart + offset,
    txHash: demoTxHash(`${seed}:${offset}`),
    mode: CHAT_DISPLAY_MODE,
  });

  const channels = [
    {
      id: activeDealId,
      title: "Rights Transfer",
      person: "Bob",
      avatar: "B",
      mode: "Private",
      dealId: ACTIVE_DEAL_LABEL,
      status: "Escrow Active",
      unread: 2,
      time: "9:41 AM",
      last: "Waiting for escrow deposits",
    },
    {
      id: "design-milestone",
      title: "Design Milestone",
      person: "Mira",
      avatar: "M",
      mode: "Private",
      status: "Negotiating",
      unread: 1,
      time: "9:20 AM",
      last: "AI note requested",
    },
    {
      id: "northline-goods",
      title: "Northline Goods",
      person: "Northline",
      avatar: "N",
      mode: "Public",
      status: "Waiting Deposit",
      unread: 0,
      time: "8:15 AM",
      last: "Alice deposited funds",
    },
    {
      id: "greylock-ops",
      title: "Greylock Ops",
      person: "Ari",
      avatar: "G",
      mode: "Private",
      status: "Settlement",
      unread: 0,
      time: "Yesterday",
      last: "Settlement proof generated",
    },
    {
      id: "product-supply",
      title: "Product Supply",
      person: "Nadia",
      avatar: "P",
      mode: "Public",
      status: "Settlement",
      unread: 0,
      time: "Mon",
      last: "Settlement complete",
    },
  ];

  const messages = {
    [activeDealId]: [
      {
        type: "event",
        title: "bob.stark joined the deal",
        subtitle: "Invite accepted by bob.stark.",
        actor: "Bob",
        time: now - 52 * minute,
        ...confirmedTimelineMeta("bob-joined", 0),
      },
      {
        type: "event",
        title: "Secure channel established",
        subtitle: "Encrypted channel established. Transaction metadata remains public.",
        actor: "System",
        time: now - 51 * minute,
        ...confirmedTimelineMeta("ecdh-session-established", 1),
      },
      {
        type: "message",
        sender: "You",
        actor: "Alice",
        body: "Hello Bob, here is my offer.",
        time: now - 48 * minute,
        self: true,
        ...confirmedTimelineMeta("alice-message", 3),
      },
      {
        type: "offer",
        title: "Alice created an offer",
        actor: "Alice",
        amount: "500 STRK",
        subtitle: "Rights Package / NFT",
        time: now - 44 * minute,
        ...confirmedTimelineMeta("alice-offer", 4),
      },
      {
        type: "offer",
        title: "Bob created a counter offer",
        actor: "Bob",
        amount: DEAL_OFFER_AMOUNT,
        subtitle: "Rights Package / NFT",
        time: now - 34 * minute,
        ...confirmedTimelineMeta("bob-counter", 5),
      },
      {
        type: "event",
        title: "Alice accepted Bob's counter offer",
        subtitle: "Negotiation completed. Escrow contract created.",
        actor: "Alice",
        time: now - 24 * minute,
        ...confirmedTimelineMeta("alice-accepted-counter", 6),
      },
      {
        type: "event",
        title: "Waiting for escrow deposits",
        subtitle: "Waiting for: Alice deposits 450 STRK; Bob locks NFT.",
        actor: "System",
        time: now - 20 * minute,
        ...confirmedTimelineMeta("waiting-escrow-deposits", 7),
      },
    ],
    "design-milestone": [
      {
        type: "message",
        sender: "Mira",
        body: "Can you attach the AI review before release?",
        time: now - 18 * minute,
      },
    ],
    "northline-goods": [
      {
        type: "message",
        sender: "Northline",
        body: "Seller deposit is pending.",
        time: now - 70 * minute,
      },
    ],
    "greylock-ops": [
      {
        type: "event",
        title: "Payment proof received",
        subtitle: "Settlement completed.",
        time: now - 2 * 24 * 60 * minute,
      },
    ],
    "product-supply": [
      {
        type: "event",
        title: "Deal completed",
        subtitle: "Proof attached.",
        time: now - 4 * 24 * 60 * minute,
      },
    ],
  };

  return {
    minute,
    channels,
    messages,
    initialRewardHistory: [
      { points: 50, label: "Escrow Completed", time: now - 2 * 60 * minute },
      { points: 20, label: "Direct Payment", time: now - 5 * 60 * minute },
      { points: 5, label: "Alice created an offer", time: now - 24 * 60 * minute },
      { points: 1, label: "Direct encrypted message", time: now - 26 * 60 * minute },
    ],
    confirmedTimelineMeta,
  };
}
