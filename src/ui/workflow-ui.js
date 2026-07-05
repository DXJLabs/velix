import { escapeHtml } from "./html.js";

export function workflowProgressMarkup(title, stages = []) {
  return `
    <strong>${escapeHtml(title || "Rights Transfer")}</strong>
    <ol>
      ${stages.map((stage) => {
        const stateClass = stage.done ? "complete" : stage.active ? "active" : "pending";
        const icon = stage.done ? "check" : stage.active ? "circle-dot" : "circle";
        return `<li class="${stateClass}"><span><i data-lucide="${icon}" class="size-3.5"></i></span><em>${escapeHtml(stage.label)}</em></li>`;
      }).join("")}
    </ol>
  `;
}
