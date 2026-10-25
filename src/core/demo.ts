import { AgentRegistry } from "./registry";
import { type AgentState, type Provider, type Task } from "./model";
const cycle: { state: AgentState; task: Task }[] = [
  { state: "idle", task: "none" },
  { state: "thinking", task: "response" },
  { state: "working", task: "reading" },
  { state: "working", task: "editing" },
  { state: "working", task: "terminal" },
  { state: "waiting", task: "approval" },
  { state: "working", task: "editing" },
  { state: "completed", task: "none" },
  { state: "idle", task: "none" },
];
const people: Provider[] = ["codex", "claude", "chatgpt", "gemini"];
const initial = [4, 1, 5, 0];
/** Synthetic metadata only. No models, network calls or paid APIs. */
export class DemoDirector {
  readonly registry = new AgentRegistry();
  private sequence = [0, 0, 0, 0];
  private positions = [0, 0, 0, 0];
  private next = 0;
  constructor(now = Date.now()) {
    people.forEach((provider, i) => {
      this.registry.apply(
        {
          version: 1,
          source: "demo",
          sessionId: provider + "-studio",
          provider,
          sequence: 0,
          timestamp: now,
          kind: "connected",
          project:
            i === 0
              ? "ai-workspace"
              : i === 1
                ? "Design notes"
                : i === 2
                  ? "Product ideas"
                  : "Research desk",
        },
        now,
      );
      for (let j = 0; j <= initial[i]; j++) this.emit(i, j, now);
    });
  }
  private emit(i: number, position: number, now: number) {
    this.positions[i] = position;
    const event = {
      version: 1,
      source: "demo",
      sessionId: people[i] + "-studio",
      provider: people[i],
      sequence: ++this.sequence[i],
      timestamp: now,
      kind: "activity",
      ...cycle[position],
    };
    const result = this.registry.apply(event, now);
    if (!result.ok) throw new Error(result.reason);
  }
  advance(id?: string, now = Date.now()) {
    const index = id
      ? people.findIndex((p) => "demo:" + p + "-studio" === id)
      : this.next++ % people.length;
    if (index < 0) return;
    this.emit(index, (this.positions[index] + 1) % cycle.length, now);
  }
}
