// Pixi’s static uniform/shader adapters avoid eval under Tauri’s strict CSP.
import "pixi.js/unsafe-eval";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { characterArt, deskArt, H, officeArt, W, type Outfit } from "./art";
import { findPath, type Obstacle, type Point } from "./navigation";
import { providerNames, type AgentSession } from "../core/model";
import { type Settings } from "../core/settings";

interface Worker {
  root: Container;
  sprite: Sprite;
  label: Text;
  badge: Text;
  ring: Graphics;
  position: Point;
  path: Point[];
  goal: string;
  index: number;
  agent: AgentSession;
}
export interface SceneInput {
  agents: AgentSession[];
  settings: Settings;
  selected: string | null;
  editing: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}
const looks: Outfit[] = ["mint", "peach", "blue", "gold"];
export class OfficeEngine {
  private app = new Application();
  private world = new Container();
  private background?: Sprite;
  private desks = new Container();
  private workers = new Map<string, Worker>();
  private textures = new Map<string, Texture>();
  private input: SceneInput;
  private layoutKey = "";
  private ready = false;
  private disposed = false;
  private observer?: ResizeObserver;
  private elapsed = 0;
  private lastFrame = -1;
  private drag: { node: Container; id: string; offset: Point } | null = null;
  constructor(
    private host: HTMLElement,
    input: SceneInput,
  ) {
    this.input = input;
  }
  async start() {
    await this.app.init({
      width: this.host.clientWidth,
      height: this.host.clientHeight,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      preference: "webgl",
      powerPreference: "low-power",
    });
    if (this.disposed) {
      this.app.destroy(true, {
        children: true,
        texture: true,
        textureSource: true,
      });
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute(
      "aria-label",
      "Animated pixel office. Select sessions in the team sidebar for keyboard access.",
    );
    this.app.canvas.setAttribute("role", "img");
    this.app.stage.addChild(this.world);
    this.world.sortableChildren = true;
    this.desks.sortableChildren = true;
    this.world.addChild(this.desks);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("globalpointermove", (e) => {
      if (!this.drag) return;
      const p = this.world.toLocal(e.global);
      this.drag.node.position.set(
        Math.max(80, Math.min(350, p.x - this.drag.offset.x)),
        Math.max(106, Math.min(264, p.y - this.drag.offset.y)),
      );
    });
    const finish = () => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      d.node.alpha = 1;
      this.input.onMove(
        d.id,
        Math.round(d.node.x / 8) * 8,
        Math.round(d.node.y / 8) * 8,
      );
      this.layoutKey = "";
      this.sync();
    };
    this.app.stage.on("pointerup", finish);
    this.app.stage.on("pointerupoutside", finish);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.ready = true;
    this.sync();
    this.resize();
    this.app.ticker.add((t) => this.tick(Math.min(t.deltaMS, 80) / 1000));
    document.addEventListener("visibilitychange", this.visibility);
  }
  private visibility = () => {
    if (!this.ready) return;
    if (document.hidden) this.app.stop();
    else this.app.start();
  };
  private texture(key: string, draw: () => HTMLCanvasElement) {
    let t = this.textures.get(key);
    if (!t) {
      t = Texture.from(draw());
      t.source.scaleMode = "nearest";
      this.textures.set(key, t);
    }
    return t;
  }
  update(input: SceneInput) {
    this.input = input;
    if (this.ready) {
      this.sync();
      this.resize();
    }
  }
  private resize() {
    if (!this.ready || this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.app.renderer.resize(w, h);
    const scale = Math.min(w / W, h / H) * this.input.zoom;
    this.world.scale.set(scale);
    this.world.position.set(
      Math.round((w - W * scale) / 2),
      Math.round((h - H * scale) / 2),
    );
  }
  private sync() {
    const { settings, agents, editing } = this.input;
    this.app.ticker.maxFPS = settings.reducedMotion ? 15 : settings.fps;
    if (!this.background) {
      this.background = new Sprite();
      this.background.zIndex = -1000;
      this.world.addChild(this.background);
    }
    this.background.texture = this.texture("office-" + settings.theme, () =>
      officeArt(settings.theme),
    );
    const key = JSON.stringify(settings.furniture) + editing;
    if (key !== this.layoutKey && !this.drag) {
      this.layoutKey = key;
      for (const worker of this.workers.values()) worker.goal = "";
      this.desks.removeChildren().forEach((c) => c.destroy({ children: true }));
      settings.furniture.forEach((desk, i) => {
        const node = new Container();
        node.position.set(desk.x, desk.y);
        node.zIndex = desk.y + 38;
        const sprite = new Sprite(this.texture("desk-" + i, () => deskArt(i)));
        node.addChild(sprite);
        const label = new Text({
          text: "0" + (i + 1),
          style: { fontFamily: "monospace", fontSize: 5, fill: "#e7d6af" },
        });
        label.position.set(57, 27);
        node.addChild(label);
        node.eventMode = editing ? "static" : "none";
        node.cursor = editing ? "grab" : "default";
        node.on("pointerdown", (e) => {
          if (!this.input.editing) return;
          e.stopPropagation();
          const p = this.world.toLocal(e.global);
          this.drag = {
            node,
            id: desk.id,
            offset: { x: p.x - node.x, y: p.y - node.y },
          };
          node.alpha = 0.7;
        });
        this.desks.addChild(node);
      });
    }
    const visible = agents.filter((a) => a.state !== "offline");
    for (const [id, w] of this.workers)
      if (!visible.some((a) => a.id === id)) {
        w.root.destroy({ children: true });
        this.workers.delete(id);
      }
    visible.forEach((agent, i) => {
      let w = this.workers.get(agent.id);
      if (!w) {
        const root = new Container(),
          sprite = new Sprite(),
          ring = new Graphics();
        const label = new Text({
          text: providerNames[agent.provider],
          style: {
            fontFamily: "monospace",
            fontSize: 6,
            fill: "#f4e8cd",
            align: "center",
          },
        });
        const badge = new Text({
          text: "",
          style: {
            fontFamily: "monospace",
            fontSize: 7,
            fontWeight: "bold",
            fill: "#e6d29c",
            align: "center",
          },
        });
        sprite.anchor.set(0.5, 1);
        label.anchor.set(0.5, 0);
        label.position.set(0, 3);
        badge.anchor.set(0.5, 1);
        badge.position.set(0, -36);
        root.addChild(ring, sprite, label, badge);
        root.eventMode = "static";
        root.cursor = "pointer";
        root.on("pointertap", () => {
          if (!this.input.editing) this.input.onSelect(agent.id);
        });
        w = {
          root,
          sprite,
          label,
          badge,
          ring,
          position: { x: 256 + i * 16, y: 328 },
          path: [],
          goal: "",
          index: i,
          agent,
        };
        this.world.addChild(root);
        this.workers.set(agent.id, w);
      }
      w.agent = agent;
      w.ring.clear();
      if (this.input.selected === agent.id)
        w.ring
          .ellipse(0, -2, 12, 4)
          .stroke({ width: 1, color: 0xf2dfae, alpha: 0.9 });
    });
    this.lastFrame = -1;
  }
  private obstacles(): Obstacle[] {
    return this.input.settings.furniture.map((d) => ({
      x: d.x,
      y: d.y,
      width: 74,
      height: 37,
    }));
  }
  private target(w: Worker): Point {
    const a = w.agent,
      settings = this.input.settings;
    if (a.state === "idle")
      return w.index % 2 ? { x: 64, y: 312 } : { x: 400, y: 144 };
    const id = settings.assignments[a.id] ?? "desk-" + ((w.index % 4) + 1);
    const desk = settings.furniture.find((d) => d.id === id)!;
    return { x: desk.x + 38, y: desk.y + 58 };
  }
  private tick(dt: number) {
    if (this.disposed) return;
    this.elapsed += dt;
    const frame = Math.floor(this.elapsed * 5);
    const reduce = this.input.settings.reducedMotion;
    for (const w of this.workers.values()) {
      const target = this.target(w),
        goal = target.x + "," + target.y;
      if (w.goal !== goal) {
        w.goal = goal;
        w.path = findPath(w.position, target, this.obstacles());
        if (reduce && w.path.length) {
          w.position = w.path[w.path.length - 1];
          w.path = [];
        }
      }
      if (reduce && w.path.length) {
        w.position = w.path[w.path.length - 1];
        w.path = [];
      }
      const walking = w.path.length > 0;
      if (walking && !reduce) {
        const next = w.path[0],
          dx = next.x - w.position.x,
          dy = next.y - w.position.y,
          d = Math.hypot(dx, dy),
          speed = 36 * dt;
        if (d <= speed) {
          w.position = { ...next };
          w.path.shift();
        } else {
          w.position.x += (dx / d) * speed;
          w.position.y += (dy / d) * speed;
        }
        if (dx !== 0) w.sprite.scale.x = dx < 0 ? -1 : 1;
      }
      w.root.position.set(Math.round(w.position.x), Math.round(w.position.y));
      w.root.zIndex = w.position.y + 1;
      if (this.lastFrame !== frame) {
        const a = w.agent;
        const behavior = walking
          ? "walk"
          : a.state === "completed"
            ? "celebrate"
            : a.state === "working"
              ? a.task === "reading"
                ? "read"
                : "work"
              : a.state === "idle"
                ? "coffee"
                : "stand";
        const outfit =
          this.input.settings.appearances[a.id] ?? looks[w.index % 4];
        const f = reduce ? 0 : frame % 4;
        w.sprite.texture = this.texture(
          [outfit, f, behavior, w.index].join("-"),
          () => characterArt(outfit, f, behavior, w.index),
        );
        w.badge.text = walking
          ? ""
          : a.state === "thinking"
            ? ".".repeat((frame % 3) + 1)
            : a.state === "waiting"
              ? "!"
              : a.state === "completed"
                ? "✦"
                : a.state === "working"
                  ? a.task === "terminal"
                    ? ">_"
                    : a.task === "reading"
                      ? "≡"
                      : "··"
                  : "";
        w.badge.style.fill =
          a.state === "waiting"
            ? "#ffcf75"
            : a.state === "completed"
              ? "#c5e4ac"
              : "#edddbc";
        w.label.alpha =
          this.input.settings.effects || this.input.selected === a.id ? 1 : 0.0;
      }
    }
    this.lastFrame = frame;
  }
  destroy() {
    this.disposed = true;
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    if (this.ready) {
      this.app.destroy(true, { children: true });
      for (const t of this.textures.values()) t.destroy(true);
    }
  }
}
