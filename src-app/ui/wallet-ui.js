import { escapeHtml } from "./html.js";

export function rewardRowsMarkup(items = [], formatPoints = (value) => value) {
  return items.map((item) => `
    <li>
      <strong>+${formatPoints(item.points)}</strong>
      <span>${escapeHtml(item.label)}</span>
    </li>
  `).join("");
}
