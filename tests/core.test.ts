import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../src/core/registry";
import { canTransition, eventSchema, states } from "../src/core/model";
import { DemoDirector } from "../src/core/demo";
import { decodeSettings, defaults } from "../src/core/settings";
import { moveFurniture } from "../src/core/layout";
import { findPath } from "../src/scene/navigation";
const now = 100_000;
const event = {
  version: 1,
  source: "browser",
  sessionId: "tab-23",
  provider: "chatgpt",
  sequence: 0,
  timestamp: now,
  kind: "connected",
};
describe("activity boundary and lifecycle", () => {
  it("requires connection before activity", () => {
    expect(
      new AgentRegistry().apply(
        { ...event, kind: "activity", state: "working" },
        now,
      ).ok,
    ).toBe(false);
  });
  it("rejects arbitrary conversation data", () => {
    expect(eventSchema.safeParse({ ...event, prompt: "private" }).success).toBe(
      false,
    );
  });
  it("rejects stale timestamps", () => {
    expect(
      new AgentRegistry().apply({ ...event, timestamp: now }, now + 300001).ok,
    ).toBe(false);
  });
  it("rejects future timestamps", () => {
    expect(
      new AgentRegistry().apply({ ...event, timestamp: now + 30001 }, now).ok,
    ).toBe(false);
  });
  it("preserves one stable session across events", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    r.apply({ ...event, sequence: 1, kind: "activity", state: "idle" }, now);
    expect(r.snapshot()).toHaveLength(1);
    expect(r.snapshot()[0].id).toBe("browser:tab-23");
  });
  it("rejects duplicate events and provider changes", () => {
    const r = new AgentRegistry();
    expect(r.apply(event, now).ok).toBe(true);
    expect(r.apply(event, now).ok).toBe(false);
    expect(
      r.apply(
        { ...event, sequence: 1, provider: "claude", kind: "heartbeat" },
        now,
      ).ok,
    ).toBe(false);
  });
  it("rejects activity fields on a heartbeat", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    expect(
      r.apply(
        { ...event, sequence: 1, kind: "heartbeat", state: "working" },
        now,
      ).ok,
    ).toBe(false);
  });
  it("rejects invalid transitions and retains original state", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    expect(
      r.apply(
        { ...event, sequence: 1, kind: "activity", state: "completed" },
        now,
      ).ok,
    ).toBe(false);
    expect(r.snapshot()[0].state).toBe("detected");
  });
  it("expires missing heartbeats and cleans up offline sessions", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    r.expire(now + 45001);
    expect(r.snapshot()[0].state).toBe("offline");
    r.removeOffline(now + 345002);
    expect(r.snapshot()).toHaveLength(0);
  });
  it("requires reconnect after expiry", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    r.expire(now + 45001);
    expect(
      r.apply(
        { ...event, sequence: 1, kind: "heartbeat", timestamp: now + 45002 },
        now + 45002,
      ).ok,
    ).toBe(false);
    expect(
      r.apply({ ...event, sequence: 2, timestamp: now + 45003 }, now + 45003)
        .ok,
    ).toBe(true);
  });
  it("never turns a heartbeat into activity", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    r.apply(
      { ...event, sequence: 1, timestamp: now + 100, kind: "heartbeat" },
      now + 100,
    );
    expect(r.snapshot()[0].lastActivity).toBe(now);
    expect(r.snapshot()[0].state).toBe("detected");
  });
  it("keeps uncertain activity explicit", () => {
    expect(canTransition("working", "unknown")).toBe(true);
    expect(canTransition("unknown", "idle")).toBe(true);
  });
  it("separates multiple sources and tabs", () => {
    const r = new AgentRegistry();
    r.apply(event, now);
    r.apply({ ...event, sessionId: "tab-24" }, now);
    r.apply({ ...event, source: "local" }, now);
    expect(r.snapshot()).toHaveLength(3);
  });
});
describe("demo director", () => {
  it("runs repeated valid cycles and never reports token usage", () => {
    const d = new DemoDirector(now);
    for (let i = 0; i < 200; i++) d.advance(undefined, now + i);
    expect(d.registry.snapshot()).toHaveLength(4);
    for (const a of d.registry.snapshot()) {
      expect(a.source).toBe("demo");
      expect(a.usage).toBeUndefined();
      expect(states).toContain(a.state);
    }
  });
  it("advances only the selected teammate", () => {
    const d = new DemoDirector(now),
      before = d.registry.snapshot();
    d.advance(before[0].id, now + 1);
    expect(d.registry.snapshot()[0].sequence).toBe(before[0].sequence + 1);
    expect(d.registry.snapshot()[1].sequence).toBe(before[1].sequence);
  });
});
describe("preferences and office layout", () => {
  it("round trips a complete preference payload", () => {
    expect(decodeSettings(JSON.parse(JSON.stringify(defaults)))).toEqual(
      defaults,
    );
  });
  it("rejects duplicate desks, unsafe values and unknown fields", () => {
    expect(() => decodeSettings({ ...defaults, fps: 1000 })).toThrow();
    expect(() =>
      decodeSettings({
        ...defaults,
        furniture: [defaults.furniture[0], ...defaults.furniture.slice(0, 3)],
      }),
    ).toThrow();
    expect(() => decodeSettings({ ...defaults, apiKey: "no" })).toThrow();
  });
  it("rejects desk collisions and placement outside the rug", () => {
    expect(moveFurniture(defaults.furniture, "desk-1", 264, 130)).toBeNull();
    expect(moveFurniture(defaults.furniture, "desk-1", 48, 140)).toBeNull();
    expect(moveFurniture(defaults.furniture, "desk-1", 120, 140)?.[0].x).toBe(
      120,
    );
  });
});
describe("worker navigation", () => {
  it("routes around furniture without crossing its footprint", () => {
    const obstacle = { x: 96, y: 160, width: 72, height: 40 };
    const p = findPath({ x: 128, y: 240 }, { x: 128, y: 120 }, [obstacle]);
    expect(p.length).toBeGreaterThan(1);
    expect(
      p.every((v) => !(v.x >= 89 && v.x <= 175 && v.y >= 157 && v.y <= 204)),
    ).toBe(true);
  });
  it("returns no path for an occupied destination", () => {
    expect(
      findPath({ x: 128, y: 240 }, { x: 128, y: 176 }, [
        { x: 96, y: 160, width: 72, height: 40 },
      ]),
    ).toEqual([]);
  });
});
