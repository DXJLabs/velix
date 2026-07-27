export function chatTransportMode(timelineMode, directHelperMode, defaultMode) {
  if (timelineMode === "encrypted-direct") return directHelperMode;
  if (timelineMode === "strk20-shielded") return "strk20-shielded";
  return defaultMode;
}

export function transactionTransportMode(timelineMode, requestedMode, directHelperMode) {
  return timelineMode === "encrypted-direct" ? directHelperMode : requestedMode;
}
