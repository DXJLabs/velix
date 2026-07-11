export function chatTransportMode(timelineMode, directHelperMode, defaultMode) {
  void timelineMode;
  void directHelperMode;
  return defaultMode;
}

export function transactionTransportMode(timelineMode, requestedMode, directHelperMode) {
  return timelineMode === "direct-helper-dev" ? directHelperMode : requestedMode;
}
