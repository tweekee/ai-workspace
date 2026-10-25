export type BrowserProvider = "chatgpt" | "claude" | "gemini";
export interface VisibleState {
  state: "idle" | "working" | "waiting" | "unknown";
  task: "none" | "response" | "approval";
  evidence:
    | "visible-stop-control"
    | "visible-composer"
    | "visible-approval"
    | "page-unavailable";
}
const selectors: Record<
  BrowserProvider,
  { stop: string[]; composer: string[]; approval: string[] }
> = {
  chatgpt: {
    stop: [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop streaming"]',
    ],
    composer: ["#prompt-textarea", '[data-testid="composer-input"]'],
    approval: [
      '[data-testid="confirmation-dialog"] button',
      'button[data-testid="approve-button"]',
      'button[aria-label="Continue generating"]',
    ],
  },
  claude: {
    stop: [
      'button[aria-label="Stop response"]',
      'button[data-testid="stop-button"]',
      '[data-is-streaming="true"]',
    ],
    composer: [
      '[contenteditable="true"][role="textbox"]',
      '[data-testid="chat-input"]',
      '[contenteditable="true"][data-placeholder]',
    ],
    approval: [
      '[data-testid="tool-approval"] button',
      'button[data-testid="approve-tool"]',
    ],
  },
  gemini: {
    stop: [
      'button[aria-label="Stop response"]',
      'button[data-test-id="stop-button"]',
      "button.stop-button",
    ],
    composer: [
      'rich-textarea [contenteditable="true"]',
      '.input-area-container [contenteditable="true"]',
    ],
    approval: [
      '[data-test-id="tool-confirmation"] button',
      'button[data-test-id="approve-button"]',
    ],
  },
};
export function providerForUrl(url: string): BrowserProvider | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return (
      (
        {
          "chatgpt.com": "chatgpt",
          "claude.ai": "claude",
          "gemini.google.com": "gemini",
        } as Record<string, BrowserProvider>
      )[u.hostname] ?? null
    );
  } catch {
    return null;
  }
}
export function observeDocument(
  doc: Document,
  provider: BrowserProvider,
): VisibleState {
  const visible = (selector: string) =>
    Array.from(doc.querySelectorAll<HTMLElement>(selector)).some((el) => {
      const style = doc.defaultView?.getComputedStyle(el);
      return (
        !el.hidden &&
        el.getAttribute("aria-hidden") !== "true" &&
        style?.display !== "none" &&
        style?.visibility !== "hidden" &&
        el.getClientRects().length > 0
      );
    });
  const config = selectors[provider];
  if (config.approval.some(visible))
    return { state: "waiting", task: "approval", evidence: "visible-approval" };
  if (config.stop.some(visible))
    return {
      state: "working",
      task: "response",
      evidence: "visible-stop-control",
    };
  if (config.composer.some(visible))
    return { state: "idle", task: "none", evidence: "visible-composer" };
  return { state: "unknown", task: "none", evidence: "page-unavailable" };
}
