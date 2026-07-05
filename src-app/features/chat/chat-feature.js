export function chatTransportMode(timelineMode, directHelperMode, defaultMode) {
  return timelineMode === "direct-helper" ? directHelperMode : defaultMode;
}

export function transactionTransportMode(timelineMode, requestedMode, directHelperMode) {
  return timelineMode === "direct-helper" ? directHelperMode : requestedMode;
}
