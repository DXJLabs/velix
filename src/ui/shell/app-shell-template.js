import { activityScreenMarkup } from "../activity/activity-screen-template.js";
import { channelScreenMarkup } from "../channel/channel-screen-template.js";
import { conversationsScreenMarkup } from "../conversations/conversations-screen-template.js";
import { escrowScreenMarkup } from "../escrow/escrow-screen-template.js";
import { homeScreenMarkup } from "../home/home-screen-template.js";
import { newDealScreenMarkup } from "../new-deal/new-deal-screen-template.js";
import { dealScreenMarkup } from "../offer/deal-screen-template.js";
import { paymentScreenMarkup } from "../payment/payment-screen-template.js";
import { proofScreenMarkup } from "../settlement/proof-screen-template.js";
import { settlementScreenMarkup } from "../settlement/settlement-screen-template.js";
import { walletScreenMarkup } from "../wallet/wallet-screen-template.js";
import { settingsScreenMarkup } from "../settings/settings-screen-template.js";
import { bottomNavMarkup } from "./bottom-nav-template.js";
import { reviewModalsMarkup } from "../transactions/review-modals-template.js";

export function appShellMarkup() {
  return `
    <div class="app-shell mx-auto min-h-dvh w-full bg-[#f7f8fa]">
      <main class="relative min-h-dvh">
        ${homeScreenMarkup()}
        ${conversationsScreenMarkup()}
        ${newDealScreenMarkup()}
        ${activityScreenMarkup()}
        ${walletScreenMarkup()}
        ${settingsScreenMarkup()}
        ${channelScreenMarkup()}
        ${dealScreenMarkup()}
        ${escrowScreenMarkup()}
        ${paymentScreenMarkup()}
        ${settlementScreenMarkup()}
        ${proofScreenMarkup()}
      </main>
      ${bottomNavMarkup()}
    </div>
    ${reviewModalsMarkup()}
    <div id="privy-auth-root" hidden></div>
  `;
}

export function mountAppShell(documentRef = document) {
  const root = documentRef.querySelector("#veil-app-root");
  if (!root) {
    throw new Error("Missing #veil-app-root");
  }
  root.innerHTML = appShellMarkup();
}
