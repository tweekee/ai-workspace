import { z } from "zod";

export const states = [
  "offline",
  "detected",
  "idle",
  "thinking",
  "working",
  "waiting",
  "completed",
  "unknown",
] as const;
export type AgentState = (typeof states)[number];
export const providers = ["chatgpt", "claude", "gemini", "codex"] as const;
export type Provider = (typeof providers)[number];
export const stateLabels: Record<AgentState, string> = {
  offline: "Offline",
  detected: "Detected",
  idle: "Idle",
  thinking: "Thinking",
  working: "Working",
  waiting: "Needs input",
  completed: "Completed",
  unknown: "Activity uncertain",
};
export const providerNames: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
};
export const eventSchema = z
  .object({
    version: z.literal(1),
    sessionId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    source: z.enum(["demo", "browser", "local"]),
    provider: z.enum(providers),
    sequence: z.number().int().nonnegative(),
    timestamp: z.number().int().nonnegative(),
    kind: z.enum(["connected", "activity", "heartbeat", "disconnected"]),
    state: z.enum(states).optional(),
    task: z
      .enum(["none", "response", "reading", "editing", "terminal", "approval"])
      .optional(),
    project: z.string().max(120).optional(),
    usage: z
      .object({
        input: z.number().int().nonnegative(),
        output: z.number().int().nonnegative(),
        evidence: z.enum(["official-log", "official-api"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type AgentEvent = z.infer<typeof eventSchema>;
export type Task = NonNullable<AgentEvent["task"]>;
export interface HistoryItem {
  at: number;
  state: AgentState;
  task: Task;
}
export interface AgentSession {
  id: string;
  sessionId: string;
  provider: Provider;
  source: AgentEvent["source"];
  state: AgentState;
  task: Task;
  startedAt: number;
  lastSeen: number;
  lastActivity: number;
  sequence: number;
  project?: string;
  usage?: AgentEvent["usage"];
  history: HistoryItem[];
  evidence?: string;
  confidence?: "observed" | "limited-liveness";
  integration?: string;
}
export const taskLabels: Record<Task, string> = {
  none: "No active task",
  response: "Generating a response",
  reading: "Reading documents",
  editing: "Editing project files",
  terminal: "Running a terminal command",
  approval: "Waiting for your approval",
};
export const transitions: Record<AgentState, readonly AgentState[]> = {
  offline: ["detected"],
  detected: ["idle", "thinking", "working", "waiting", "unknown", "offline"],
  idle: ["thinking", "working", "waiting", "unknown", "offline"],
  thinking: ["working", "waiting", "completed", "idle", "unknown", "offline"],
  working: ["thinking", "waiting", "completed", "unknown", "offline"],
  waiting: ["thinking", "working", "idle", "completed", "unknown", "offline"],
  completed: ["idle", "thinking", "unknown", "offline"],
  unknown: [
    "idle",
    "thinking",
    "working",
    "waiting",
    "completed",
    "detected",
    "offline",
  ],
};
export function canTransition(from: AgentState, to: AgentState) {
  return from === to || transitions[from].includes(to);
}
export function sessionKey(event: Pick<AgentEvent, "source" | "sessionId">) {
  return event.source + ":" + event.sessionId;
}
