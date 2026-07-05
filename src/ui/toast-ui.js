export function createToastUi(toast) {
  let toastTimer;

  function showToast(message, options = {}) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toast.dataset.sticky = options.sticky ? "true" : "false";
    if (!options.sticky) {
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
    }
  }

  function hideToastIfLoading() {
    clearTimeout(toastTimer);
    toast.classList.remove("visible");
    toast.dataset.sticky = "false";
  }

  return { showToast, hideToastIfLoading };
}
