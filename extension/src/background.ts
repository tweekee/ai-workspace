/// <reference types="chrome" />
import {
  providerForUrl,
  type BrowserProvider,
  type VisibleState,
} from "./adapters";
const endpoint = "http://127.0.0.1:38471";
interface TabRecord {
  sessionId: string;
  provider: BrowserProvider;
  sequence: number;
  state: string;
  task: string;
  evidence: string;
  observedAt: number;
}
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const result = queue.catch(() => {}).then(work);
  queue = result;
  return result;
};
const stateKey = "tabStates";
async function identity() {
  const old = await chrome.storage.local.get("clientId");
  if (typeof old.clientId === "string") return old.clientId as string;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ clientId: id });
  return id;
}
async function runId() {
  const old = await chrome.storage.session.get("runId");
  if (typeof old.runId === "string") return old.runId as string;
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ runId: id });
  return id;
}
async function records(): Promise<Record<string, TabRecord>> {
  return ((await chrome.storage.session.get(stateKey))[stateKey] ??
    {}) as Record<string, TabRecord>;
}
function validVisible(value: unknown): value is VisibleState {
  if (!value || typeof value !== "object") return false;
  const v = value as VisibleState;
  return (
    ["idle", "working", "waiting", "unknown"].includes(v.state) &&
    ["none", "response", "approval"].includes(v.task) &&
    [
      "visible-stop-control",
      "visible-composer",
      "visible-approval",
      "page-unavailable",
    ].includes(v.evidence)
  );
}
async function send(observations: TabRecord[]) {
  const { token } = await chrome.storage.local.get("token");
  if (typeof token !== "string") return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(endpoint + "/v1/browser", {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ observations }),
      signal: controller.signal,
    });
    if (!response.ok)
      throw Error(
        response.status === 401
          ? "Pair again in the desktop app."
          : "Desktop bridge rejected metadata.",
      );
    await chrome.storage.session.set({ lastSuccess: Date.now(), error: null });
    await chrome.action.setBadgeText({ text: "" });
  } catch (error) {
    await chrome.storage.session.set({
      error:
        error instanceof Error ? error.message : "Desktop bridge unavailable",
    });
    await chrome.action.setBadgeText({ text: "!" });
  } finally {
    clearTimeout(timer);
  }
}
async function observeTab(tabId: number, url: string, visible: VisibleState) {
  const provider = providerForUrl(url);
  if (!provider) return;
  const all = await records();
  const old = all[String(tabId)];
  if (old && old.provider !== provider) {
    await send([
      {
        ...old,
        state: "offline",
        task: "none",
        evidence: "tab-closed",
        sequence: old.sequence + 1,
        observedAt: Date.now(),
      },
    ]);
  }
  const sequence = Math.max(Date.now() * 1000, (old?.sequence ?? 0) + 1);
  const record: TabRecord = {
    sessionId: (await runId()) + ":" + provider + ":tab:" + tabId,
    provider,
    sequence,
    state: visible.state,
    task: visible.task,
    evidence: visible.evidence,
    observedAt: Date.now(),
  };
  all[String(tabId)] = record;
  await chrome.storage.session.set({ [stateKey]: all });
  await send([record]);
}
async function remove(tabId: number) {
  const all = await records(),
    old = all[String(tabId)];
  if (!old) return;
  await send([
    {
      ...old,
      state: "offline",
      task: "none",
      evidence: "tab-closed",
      sequence: Math.max(Date.now() * 1000, old.sequence + 1),
      observedAt: Date.now(),
    },
  ]);
  delete all[String(tabId)];
  await chrome.storage.session.set({ [stateKey]: all });
}
async function poll() {
  const tabs = await chrome.tabs.query({
    url: [
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*",
    ],
  });
  const all = await records();
  for (const id of Object.keys(all))
    if (!tabs.some((t) => t.id === Number(id))) await remove(Number(id));
  for (const tab of tabs) {
    if (tab.id === undefined || !tab.url) continue;
    if (tab.discarded) {
      await remove(tab.id);
      continue;
    }
    try {
      const visible: unknown = await chrome.tabs.sendMessage(tab.id, {
        type: "read-observable-state",
      });
      if (validVisible(visible)) await observeTab(tab.id, tab.url, visible);
    } catch {
      await observeTab(tab.id, tab.url, {
        state: "unknown",
        task: "none",
        evidence: "page-unavailable",
      });
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  void serial(async () => {
    if (
      sender.tab?.id !== undefined &&
      sender.frameId === 0 &&
      providerForUrl(sender.url ?? sender.tab.url ?? "") !== null
    ) {
      const tab = await chrome.tabs.get(sender.tab.id);
      if (!tab.url || !providerForUrl(tab.url)) return;
      if (message?.type === "observation" && validVisible(message))
        await observeTab(tab.id!, tab.url, message);
      else if (message?.type === "page-unavailable")
        await observeTab(tab.id!, tab.url, {
          state: "unknown",
          task: "none",
          evidence: "page-unavailable",
        });
      return { ok: true };
    }
    if (!sender.url?.startsWith(chrome.runtime.getURL("")))
      return { error: "Untrusted extension page" };
    if (message?.type === "pair") {
      const code = String(message.code ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-F0-9]{8}$/.test(code))
        return { error: "Enter the eight-character desktop pairing code." };
      try {
        const response = await fetch(endpoint + "/v1/pair", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, clientId: await identity() }),
          signal: AbortSignal.timeout(2000),
        });
        const body = await response.json();
        if (!response.ok) return { error: body.error ?? "Pairing failed." };
        await chrome.storage.local.set({ token: body.token });
        await poll();
        return { ok: true };
      } catch {
        return { error: "Open AI Workspace on this computer, then try again." };
      }
    }
    if (message?.type === "status") {
      const local = await chrome.storage.local.get("token"),
        session = await chrome.storage.session.get(["lastSuccess", "error"]);
      return {
        paired: typeof local.token === "string",
        lastSuccess: session.lastSuccess ?? null,
        error: session.error ?? null,
        tabs: Object.keys(await records()).length,
      };
    }
    if (message?.type === "refresh") {
      await poll();
      return { ok: true };
    }
    return { error: "Unknown request" };
  }).then(respond, (error) =>
    respond({
      error: error instanceof Error ? error.message : "Extension error",
    }),
  );
  return true;
});
chrome.tabs.onRemoved.addListener((id) => {
  void serial(() => remove(id));
});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (
    change.discarded === true ||
    (change.url && !providerForUrl(change.url))
  ) {
    void serial(() => remove(id));
    return;
  }
  if (change.status === "loading" && tab.url && providerForUrl(tab.url))
    void serial(() =>
      observeTab(id, tab.url!, {
        state: "unknown",
        task: "none",
        evidence: "page-unavailable",
      }),
    );
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "monitor-heartbeat") void serial(poll);
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("monitor-heartbeat", { periodInMinutes: 0.5 });
  void serial(poll);
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create("monitor-heartbeat", { periodInMinutes: 0.5 });
  void serial(poll);
});
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
void chrome.alarms.create("monitor-heartbeat", { periodInMinutes: 0.5 });
