import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";
import { providers, states, type AgentSession } from "./model";
const history = z.object({
  at: z.number(),
  state: z.enum(states),
  task: z.enum([
    "none",
    "response",
    "reading",
    "editing",
    "terminal",
    "approval",
  ]),
});
const session = z.object({
  id: z.string().max(256),
  sessionId: z.string().max(128),
  provider: z.enum(providers),
  source: z.enum(["browser", "local"]),
  state: z.enum(states),
  task: z.enum([
    "none",
    "response",
    "reading",
    "editing",
    "terminal",
    "approval",
  ]),
  startedAt: z.number(),
  lastSeen: z.number(),
  lastActivity: z.number(),
  sequence: z.number(),
  history: z.array(history).max(50),
  project: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => v ?? undefined),
  evidence: z.string().max(80),
  confidence: z.enum(["observed", "limited-liveness"]),
  integration: z.string().max(32),
});
const snapshot = z.object({
  sessions: z.array(session).max(128),
  bridge: z.object({
    listening: z.boolean(),
    port: z.number(),
    pairedBrowsers: z.number(),
    error: z.string().nullable(),
  }),
});
export type LiveSnapshot = {
  sessions: AgentSession[];
  bridge: z.infer<typeof snapshot>["bridge"];
};
export async function readLive(): Promise<LiveSnapshot> {
  if (!isTauri())
    return {
      sessions: [],
      bridge: {
        listening: false,
        port: 38471,
        pairedBrowsers: 0,
        error:
          "Real monitoring requires the Windows desktop app. This browser preview cannot access native sessions.",
      },
    };
  return snapshot.parse(await invoke("monitor_snapshot"));
}
export const pairBrowser = () =>
  invoke<{ code: string; expiresAt: number; port: number }>(
    "start_browser_pairing",
  );
export const revokeBrowsers = () => invoke("revoke_browser_pairing");
export const installHooks = (projectDir: string, providers: string[]) =>
  invoke<string[]>("install_project_hooks", { projectDir, providers });
export function sourceLabel(agent: AgentSession) {
  return agent.source === "demo"
    ? "Simulated"
    : agent.source === "browser"
      ? "Browser · real"
      : "CLI · real";
}
