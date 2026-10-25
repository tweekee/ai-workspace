import {
  canTransition,
  eventSchema,
  sessionKey,
  type AgentSession,
  type AgentState,
} from "./model";
export type ApplyResult =
  { ok: true; session: AgentSession } | { ok: false; reason: string };

/** Pure metadata boundary. Never accepts prompt or conversation fields. */
export class AgentRegistry {
  private sessions = new Map<string, AgentSession>();
  apply(input: unknown, now = Date.now()): ApplyResult {
    const parsed = eventSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, reason: "Invalid activity metadata" };
    const e = parsed.data;
    if (e.timestamp > now + 30_000 || e.timestamp < now - 300_000)
      return { ok: false, reason: "Stale or future event" };
    const id = sessionKey(e),
      old = this.sessions.get(id);
    if (!old && e.kind !== "connected")
      return { ok: false, reason: "Session must connect first" };
    if (old && (e.sequence <= old.sequence || e.timestamp < old.lastSeen))
      return { ok: false, reason: "Out-of-order event" };
    if (old && e.provider !== old.provider)
      return { ok: false, reason: "Provider identity changed" };
    if (old && old.state !== "offline" && e.kind === "connected")
      return { ok: false, reason: "Session already connected" };
    if (old?.state === "offline" && e.kind !== "connected")
      return { ok: false, reason: "Offline session must reconnect" };
    if (
      e.kind !== "activity" &&
      (e.state !== undefined || e.task !== undefined || e.usage !== undefined)
    )
      return { ok: false, reason: "Activity fields require an activity event" };
    let state: AgentState =
      e.kind === "connected"
        ? "detected"
        : e.kind === "disconnected"
          ? "offline"
          : (e.state ?? old!.state);
    if (
      e.kind === "activity" &&
      (!e.state || e.state === "offline" || e.state === "detected")
    )
      return { ok: false, reason: "Invalid activity state" };
    if (old && !canTransition(old.state, state))
      return { ok: false, reason: "Invalid state transition" };
    const reconnected = e.kind === "connected";
    const task =
      e.kind === "disconnected"
        ? "none"
        : (e.task ?? (reconnected ? "none" : (old?.task ?? "none")));
    const changed = !old || state !== old.state || task !== old.task;
    const session: AgentSession = {
      id,
      sessionId: e.sessionId,
      provider: e.provider,
      source: e.source,
      state,
      task,
      startedAt: reconnected ? e.timestamp : old!.startedAt,
      lastSeen: e.timestamp,
      lastActivity: changed ? e.timestamp : old!.lastActivity,
      sequence: e.sequence,
      project: e.project ?? old?.project,
      usage: e.usage ?? old?.usage,
      history: changed
        ? [{ at: e.timestamp, state, task }, ...(old?.history ?? [])].slice(
            0,
            50,
          )
        : old!.history,
    };
    this.sessions.set(id, session);
    return { ok: true, session };
  }
  snapshot(): AgentSession[] {
    return [...this.sessions.values()];
  }
  /** Heartbeats mean transport liveness, never inferred model activity. */
  expire(now = Date.now(), timeout = 45_000) {
    for (const [id, s] of this.sessions)
      if (s.state !== "offline" && now - s.lastSeen > timeout) {
        this.sessions.set(id, {
          ...s,
          state: "offline",
          task: "none",
          lastActivity: now,
          history: [
            { at: now, state: "offline" as const, task: "none" as const },
            ...s.history,
          ].slice(0, 50),
        });
      }
  }
  removeOffline(now = Date.now(), retention = 300_000) {
    for (const [id, s] of this.sessions)
      if (s.state === "offline" && now - s.lastActivity > retention)
        this.sessions.delete(id);
  }
  clear() {
    this.sessions.clear();
  }
}
