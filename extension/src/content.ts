/// <reference types="chrome" />
import { observeDocument, providerForUrl } from "./adapters";
const provider = providerForUrl(location.href);
if (provider && window === window.top) {
  let scheduled = 0,
    last = "",
    lastSent = 0;
  const report = () => {
    scheduled = 0;
    const observation = observeDocument(document, provider),
      key = JSON.stringify(observation);
    if (key === last && Date.now() - lastSent < 20_000) return;
    last = key;
    lastSent = Date.now();
    void chrome.runtime
      .sendMessage({ type: "observation", ...observation })
      .catch(() => {});
  };
  const schedule = () => {
    if (!scheduled) scheduled = window.setTimeout(report, 400);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "aria-label",
      "aria-busy",
      "aria-hidden",
      "data-testid",
      "data-test-id",
      "data-is-streaming",
      "hidden",
      "class",
      "style",
    ],
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "read-observable-state") {
      respond(observeDocument(document, provider));
    }
  });
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("pagehide", () => {
    void chrome.runtime
      .sendMessage({ type: "page-unavailable" })
      .catch(() => {});
  });
  window.setInterval(schedule, 15_000);
  schedule();
}
