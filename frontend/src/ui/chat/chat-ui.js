export function resizeComposerInput(input, maxHeight = 120) {
  if (!input) return;
  input.style.height = "";
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
}
