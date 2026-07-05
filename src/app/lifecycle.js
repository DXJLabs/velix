import { bindClickEvents } from "./events/click-events.js";
import { bindFormEvents } from "./events/form-events.js";
import { bindGlobalEvents } from "./events/global-events.js";

export function registerAppLifecycle({
  windowRef = window,
  documentRef = document,
  state,
  config,
  logger,
  dom,
  api,
}) {
  bindGlobalEvents({ windowRef, state, config, logger, api });
  bindClickEvents({ documentRef, state, dom, api });
  bindFormEvents({ documentRef, dom, state, api });
}
