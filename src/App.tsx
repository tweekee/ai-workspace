import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Armchair,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Coffee,
  Columns3,
  Expand,
  Folder,
  Home,
  Info,
  Leaf,
  Link2,
  List,
  Minus,
  Monitor,
  Move,
  Pause,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { DemoDirector } from "./core/demo";
import {
  providerNames,
  stateLabels,
  taskLabels,
  type AgentSession,
  type AgentState,
} from "./core/model";
import {
  defaults,
  loadSettings,
  saveSettings,
  type Settings,
} from "./core/settings";
import { moveFurniture } from "./core/layout";
import { Office } from "./scene/Office";
import { outfitColors, type Outfit } from "./scene/art";

type View = "office" | "sessions" | "activity" | "settings" | "connections";
const looks: Outfit[] = ["mint", "peach", "blue", "gold"];
function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return (
    Math.floor(s / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (s % 60).toString().padStart(2, "0")
  );
}
function ago(ms: number) {
  return ms < 1000
    ? "just now"
    : ms < 60_000
      ? Math.floor(ms / 1000) + "s ago"
      : Math.floor(ms / 60000) + "m ago";
}
function State({ state }: { state: AgentState }) {
  return (
    <span className={"state state-" + state}>
      <i />
      {stateLabels[state]}
    </span>
  );
}
function Toggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={"toggle-row" + (disabled ? " disabled" : "")}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function Avatar({
  agent,
  index,
  settings,
  large = false,
}: {
  agent: AgentSession;
  index: number;
  settings: Settings;
  large?: boolean;
}) {
  const look = settings.appearances[agent.id] ?? looks[index % 4];
  return (
    <span
      className={"avatar" + (large ? " large" : "")}
      style={{ "--shirt": outfitColors[look] } as React.CSSProperties}
    >
      <span className={"mini-person person-" + index} />
    </span>
  );
}
function ProviderIcon({ provider }: { provider: string }) {
  return (
    <span className="provider-icon">
      {provider === "codex" ? (
        <Terminal size={13} />
      ) : provider === "claude" ? (
        <Sparkles size={13} />
      ) : provider === "gemini" ? (
        <Plus size={13} />
      ) : (
        <Radio size={13} />
      )}
    </span>
  );
}
const integrationRows = [
  [
    "Browser extension",
    "ChatGPT · Claude · Gemini",
    "Milestone 2",
    "Browser tabs are not monitored in this build.",
  ],
  [
    "Local coding agents",
    "Codex CLI · Claude Code · Gemini CLI",
    "Milestone 3",
    "No process or session log scanning is enabled.",
  ],
  [
    "Cursor & local models",
    "Cursor · Ollama · custom adapters",
    "Planned",
    "Detection is unavailable in this build.",
  ],
];

export function App() {
  const [settings, setSettings] = useState<Settings>(structuredClone(defaults));
  const [loaded, setLoaded] = useState(false),
    [saveStatus, setSaveStatus] = useState("Loading preferences…");
  const [sessions, setSessions] = useState<AgentSession[]>([]),
    [view, setView] = useState<View>("office");
  const [selected, setSelected] = useState<string | null>("demo:codex-studio"),
    [paused, setPaused] = useState(false);
  const [editing, setEditing] = useState(false),
    [zoom, setZoom] = useState(1),
    [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(""),
    [filter, setFilter] = useState("all");
  const director = useRef<DemoDirector | null>(null),
    lastAdvance = useRef(Date.now()),
    audio = useRef<AudioContext | null>(null);
  const settingsRef = useRef(settings),
    saveRevision = useRef(0);
  settingsRef.current = settings;
  useEffect(() => {
    let active = true;
    loadSettings().then(({ settings: s, warning }) => {
      if (active) {
        setSettings(s);
        setLoaded(true);
        setSaveStatus(warning ?? "Saved on this device");
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    if (settings.demo) {
      director.current = new DemoDirector();
      setSessions(director.current.registry.snapshot());
      setSelected("demo:codex-studio");
    } else {
      director.current = null;
      setSessions([]);
      setSelected(null);
    }
    lastAdvance.current = Date.now();
  }, [loaded, settings.demo]);
  const chime = () => {
    if (!settingsRef.current.sound || !audio.current) return;
    const a = audio.current;
    void a.resume();
    const o = a.createOscillator(),
      g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.type = "sine";
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.04, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.35);
    o.start();
    o.stop(a.currentTime + 0.35);
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (!paused && director.current && time - lastAdvance.current > 4500) {
        const before = director.current.registry.snapshot();
        director.current.advance(undefined, time);
        const after = director.current.registry.snapshot();
        if (
          after.some(
            (a) =>
              a.state === "completed" &&
              before.find((b) => b.id === a.id)?.state !== "completed",
          )
        )
          chime();
        setSessions(after);
        lastAdvance.current = time;
      }
    }, 500);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    setSaveStatus("Saving…");
    const revision = ++saveRevision.current;
    void saveSettings(next)
      .then(() => {
        if (revision === saveRevision.current)
          setSaveStatus("Saved on this device");
      })
      .catch(() => {
        if (revision === saveRevision.current)
          setSaveStatus("Could not save. Your changes are only in memory.");
      });
  };
  const advance = (id?: string) => {
    director.current?.advance(id);
    setSessions(director.current?.registry.snapshot() ?? []);
    lastAdvance.current = Date.now();
  };
  const chosen = sessions.find((a) => a.id === selected);
  const working = sessions.filter(
    (a) => a.state === "working" || a.state === "thinking",
  ).length;
  const waiting = sessions.filter((a) => a.state === "waiting").length;
  const history = sessions
    .flatMap((a) =>
      a.history.map((h, i) => ({
        ...h,
        agent: a,
        key: a.id + "-" + h.at + "-" + i,
      })),
    )
    .sort((a, b) => b.at - a.at);
  const setDemo = (value: boolean) => {
    update({ demo: value });
    setPaused(false);
    setToast(
      value
        ? "Demo office opened. All activity is simulated."
        : "Demo stopped. Real integrations are not connected.",
    );
  };
  const move = (id: string, x: number, y: number) => {
    const layout = moveFurniture(settings.furniture, id, x, y);
    if (layout) {
      update({ furniture: layout });
      setToast("Workstation moved and saved.");
    } else
      setToast(
        "Keep desks on the studio rug, with space between workstations.",
      );
  };
  const assign = (agent: AgentSession, desk: string) => {
    const i = sessions.indexOf(agent),
      old = settings.assignments[agent.id] ?? "desk-" + (i + 1);
    const assignments = {
      ...settings.assignments,
      [agent.id]: desk as Settings["assignments"][string],
    };
    const other = sessions.find(
      (a, j) =>
        a.id !== agent.id && (assignments[a.id] ?? "desk-" + (j + 1)) === desk,
    );
    if (other) assignments[other.id] = old as Settings["assignments"][string];
    update({ assignments });
  };
  const download = () => {
    const report = {
      app: "AI Workspace",
      version: "0.1.0",
      runtime: isTauri() ? "tauri" : "browser-preview",
      mode: settings.demo ? "demo" : "live-unconnected",
      sessionCount: sessions.length,
      renderer: "PixiJS WebGL",
      integrations: { browser: "not-implemented", local: "not-implemented" },
      preferences: settings,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-workspace-diagnostics.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const nav = (to: View) => {
    setView(to);
    setEditing(false);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("office");
          }}
          aria-label="AI Workspace home"
        >
          <img src="/icon.svg" alt="" />
          <span>
            AI Workspace<span className="brand-period">.</span>
          </span>
        </a>
        <span className="top-divider" />
        <span className="workspace-name">
          <span className="workspace-dot" />
          Personal workspace
        </span>
        <div className="top-actions">
          <span className="local-mark">
            <ShieldCheck size={14} /> Local by design
          </span>
          <span className="version">v0.1.0</span>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => nav("settings")}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      <nav className="nav-rail" aria-label="Main navigation">
        {(
          [
            { to: "office", label: "Office", icon: Home },
            { to: "sessions", label: "Sessions", icon: Columns3 },
            { to: "activity", label: "Activity", icon: List },
            { to: "connections", label: "Connect", icon: Link2 },
          ] as const
        ).map((n) => (
          <button
            key={n.to}
            aria-label={n.label}
            title={n.label}
            aria-current={view === n.to ? "page" : undefined}
            className={view === n.to ? "active" : ""}
            onClick={() => nav(n.to)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <div className="nav-bottom">
          <Leaf size={19} />
          <span>
            Made for
            <br />a calmer day
          </span>
        </div>
      </nav>
      <div className="main-wrap">
        <main>
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                Personal workspace <ChevronRight size={12} />{" "}
                {view === "office"
                  ? "Maple studio"
                  : view.charAt(0).toUpperCase() + view.slice(1)}
              </div>
              <h1>
                {view === "office"
                  ? "The office"
                  : view === "connections"
                    ? "Connect your team"
                    : view.charAt(0).toUpperCase() + view.slice(1)}
              </h1>
              <p>
                {view === "office"
                  ? settings.demo
                    ? "A small studio for your AI team. All activity here is simulated."
                    : "Your studio is ready. Connectors are coming in the next milestones."
                  : view === "settings"
                    ? "Make a little room for the way you work."
                    : view === "connections"
                      ? "Private, local connections. Honest about what is available."
                      : view === "sessions"
                        ? "Every session has its own seat in the studio."
                        : "A little context behind every change of pace."}
              </p>
            </div>
            <div className="heading-actions">
              <span className={"mode-tag" + (!settings.demo ? " live" : "")}>
                <span />
                {settings.demo ? "Demo mode" : "Live · unconnected"}
              </span>
              {view === "office" && (
                <button
                  className={"button" + (editing ? " selected" : "")}
                  onClick={() => setEditing(!editing)}
                >
                  <SlidersHorizontal size={14} />
                  {editing ? "Done editing" : "Customize"}
                </button>
              )}
            </div>
          </div>
          {!loaded ? (
            <div className="loading-panel">Opening your studio…</div>
          ) : (
            <>
              {view === "office" && (
                <>
                  <section
                    className={"office-panel" + (editing ? " editing" : "")}
                  >
                    <div className="scene-top">
                      <div>
                        <span className="studio-indicator" />
                        <strong>
                          {settings.theme === "maple"
                            ? "Maple studio"
                            : "Evening studio"}
                        </strong>
                        <span className="scene-floor">First floor</span>
                      </div>
                      <span className="scene-hint">
                        {editing ? (
                          <>
                            <Move size={13} />
                            Drag a desk to rearrange
                          </>
                        ) : (
                          <>
                            <Monitor size={13} />
                            {sessions.length} simulated sessions
                          </>
                        )}
                      </span>
                    </div>
                    <Office
                      agents={sessions}
                      settings={settings}
                      selected={selected}
                      editing={editing}
                      zoom={zoom}
                      onSelect={setSelected}
                      onMove={move}
                    />
                    {sessions.length === 0 && (
                      <div className="empty-office">
                        <h3>Your team hasn’t arrived yet</h3>
                        <p>Real monitoring is not available in Milestone 1.</p>
                        <button
                          className="button primary"
                          onClick={() => setDemo(true)}
                        >
                          Explore the demo <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                    <div className="scene-bottom">
                      <span>
                        <span className="tiny-key">↖</span>
                        {editing
                          ? "Drag workstations on the rug"
                          : "Click a teammate to see their activity"}
                      </span>
                      <div className="zoom-control">
                        <button
                          aria-label="Zoom out"
                          disabled={zoom <= 0.8}
                          onClick={() => setZoom(Math.max(0.8, zoom - 0.1))}
                        >
                          <Minus size={13} />
                        </button>
                        <span>{Math.round(zoom * 100)}%</span>
                        <button
                          aria-label="Zoom in"
                          disabled={zoom >= 1.4}
                          onClick={() => setZoom(Math.min(1.4, zoom + 0.1))}
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          aria-label="Fit office"
                          onClick={() => setZoom(1)}
                        >
                          <Expand size={13} />
                        </button>
                      </div>
                    </div>
                  </section>
                  <div className="below-office">
                    <section className="activity-preview">
                      <div className="section-title">
                        <h2>Office activity</h2>
                        <button onClick={() => nav("activity")}>
                          View all <ArrowRight size={13} />
                        </button>
                      </div>
                      {history.slice(0, 3).map((h) => (
                        <div className="activity-line" key={h.key}>
                          <span className={"event-dot dot-" + h.state} />
                          <span>
                            <strong>{providerNames[h.agent.provider]}</strong>{" "}
                            {h.state === "working"
                              ? taskLabels[h.task].toLowerCase()
                              : stateLabels[h.state].toLowerCase()}
                            <em>Simulated</em>
                          </span>
                          <time>{ago(now - h.at)}</time>
                        </div>
                      ))}
                      {!history.length && (
                        <p className="quiet-empty">
                          Activity will appear when a session is connected.
                        </p>
                      )}
                    </section>
                    <section className="studio-note">
                      <Coffee size={23} />
                      <h2>Room to breathe.</h2>
                      <p>
                        While your assistants do their thing,
                        <br />
                        your workspace stays a little calmer.
                      </p>
                      <span>No API keys. No tokens consumed.</span>
                    </section>
                  </div>
                </>
              )}
              {view === "sessions" && (
                <section className="session-table">
                  <div className="table-tools">
                    <span>
                      {sessions.length}{" "}
                      {settings.demo ? "simulated" : "connected"} sessions
                    </span>
                    <label>
                      Show{" "}
                      <select
                        aria-label="Filter sessions"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">All sessions</option>
                        <option value="working">Working & thinking</option>
                        <option value="waiting">Needs input</option>
                      </select>
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Assistant</th>
                          <th>State</th>
                          <th>Project</th>
                          <th>Session</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions
                          .filter(
                            (a) =>
                              filter === "all" ||
                              (filter === "working" &&
                                (a.state === "working" ||
                                  a.state === "thinking")) ||
                              a.state === filter,
                          )
                          .map((a, i) => (
                            <tr key={a.id} onClick={() => setSelected(a.id)}>
                              <td>
                                <button
                                  className="table-agent"
                                  onClick={() => setSelected(a.id)}
                                >
                                  <Avatar
                                    agent={a}
                                    index={i}
                                    settings={settings}
                                  />
                                  <span>
                                    {providerNames[a.provider]}
                                    <small>{a.sessionId}</small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <State state={a.state} />
                              </td>
                              <td>{a.project ?? "—"}</td>
                              <td className="num">
                                {duration(now - a.startedAt)}
                              </td>
                              <td>
                                <span className="source-label">Simulated</span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {!sessions.length && (
                    <p className="quiet-empty">
                      No connected sessions. Explore demo mode from Settings.
                    </p>
                  )}
                </section>
              )}
              {view === "activity" && (
                <section className="activity-full">
                  <div className="section-title">
                    <h2>Session timeline</h2>
                    <span>In memory · up to 50 events per session</span>
                  </div>
                  {history.map((h) => (
                    <div className="timeline-row" key={h.key}>
                      <span className={"event-dot dot-" + h.state} />
                      <span>
                        <strong>{providerNames[h.agent.provider]}</strong>
                        <small>
                          {h.state === "working"
                            ? taskLabels[h.task]
                            : stateLabels[h.state]}
                        </small>
                      </span>
                      <span className="source-label">Simulated</span>
                      <time>
                        {new Date(h.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                    </div>
                  ))}
                  {!history.length && (
                    <p className="quiet-empty">
                      No activity recorded in this session.
                    </p>
                  )}
                </section>
              )}
              {view === "connections" && (
                <>
                  <div className="connection-intro">
                    <ShieldCheck size={23} />
                    <div>
                      <h2>Your computer. Your conversations.</h2>
                      <p>
                        Core animation runs locally without model inference.
                        This foundation build does not read your tabs,
                        processes, files, or conversation contents.
                      </p>
                    </div>
                  </div>
                  <div className="connections-list">
                    {integrationRows.map(
                      ([title, subtitle, status, description]) => (
                        <section className="connection-row" key={title}>
                          <span className="connection-symbol">
                            {title === "Browser extension" ? (
                              <Monitor />
                            ) : title === "Local coding agents" ? (
                              <Terminal />
                            ) : (
                              <Link2 />
                            )}
                          </span>
                          <div>
                            <h2>{title}</h2>
                            <p>{subtitle}</p>
                            <small>{description}</small>
                          </div>
                          <span className="limited-tag">
                            {status} · unavailable
                          </span>
                        </section>
                      ),
                    )}
                  </div>
                  <div className="connection-bottom">
                    <p>
                      Until connectors are implemented, live mode shows an empty
                      office.
                    </p>
                    <button
                      className="button"
                      onClick={() => {
                        setDemo(!settings.demo);
                        nav("office");
                      }}
                    >
                      {settings.demo
                        ? "Switch to live mode"
                        : "Open the demo office"}{" "}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {view === "settings" && (
                <div className="settings-content">
                  <SettingsSection
                    title="The studio"
                    description="A few small details make it your own."
                  >
                    <label className="field-label">
                      Office palette
                      <select
                        aria-label="Office palette"
                        value={settings.theme}
                        onChange={(e) =>
                          update({ theme: e.target.value as Settings["theme"] })
                        }
                      >
                        <option value="maple">Maple · warm daylight</option>
                        <option value="dusk">Dusk · cool evening</option>
                      </select>
                    </label>
                    <Toggle
                      label="Character labels"
                      description="Show assistant names in the office."
                      value={settings.effects}
                      onChange={(effects) => update({ effects })}
                    />
                    <Toggle
                      label="Reduced motion"
                      description="Place workers directly at their destination."
                      value={settings.reducedMotion}
                      onChange={(reducedMotion) => update({ reducedMotion })}
                    />
                    <button
                      className="text-action"
                      onClick={() => {
                        update({
                          furniture: structuredClone(defaults.furniture),
                          assignments: {},
                        });
                        setToast("Studio layout reset.");
                      }}
                    >
                      Reset furniture layout <ArrowRight size={13} />
                    </button>
                  </SettingsSection>
                  <SettingsSection
                    title="Performance"
                    description="A quiet office should be quiet on your computer, too."
                  >
                    <label className="field-label">
                      Frame rate
                      <select
                        aria-label="Frame rate"
                        value={settings.fps}
                        onChange={(e) =>
                          update({
                            fps: Number(e.target.value) as Settings["fps"],
                          })
                        }
                      >
                        <option value="60">60 FPS · smoothest</option>
                        <option value="30">30 FPS · balanced</option>
                        <option value="15">15 FPS · power saver</option>
                      </select>
                    </label>
                    <p className="field-help">
                      Rendering pauses while the window is hidden. Reduced
                      motion caps rendering at 15 FPS.
                    </p>
                    <Toggle
                      label="Completion sound"
                      description="A soft chime when a simulated task finishes."
                      value={settings.sound}
                      onChange={(sound) => {
                        if (sound && !audio.current)
                          audio.current = new AudioContext();
                        update({ sound });
                      }}
                    />
                  </SettingsSection>
                  <SettingsSection
                    title="Demo & connections"
                    description="Simulated sessions always identify themselves."
                  >
                    <Toggle
                      label="Demo mode"
                      description="Four fictional sessions. No AI requests."
                      value={settings.demo}
                      onChange={setDemo}
                    />
                    <button
                      className="text-action"
                      onClick={() => nav("connections")}
                    >
                      Integration availability <ArrowRight size={13} />
                    </button>
                    <div className="unavailable-setting">
                      <span>Launch at Windows startup</span>
                      <small>Not implemented in this milestone</small>
                    </div>
                    <div className="unavailable-setting">
                      <span>Desktop notifications</span>
                      <small>Not implemented in this milestone</small>
                    </div>
                  </SettingsSection>
                  <SettingsSection
                    title="Privacy & diagnostics"
                    description="No account, cloud backend, analytics, or AI inference."
                  >
                    <p className="field-help">
                      Only office preferences are saved. Session activity stays
                      in memory and disappears when the app closes. No prompts
                      or conversation text are collected.
                    </p>
                    <button className="button" onClick={download}>
                      <ArrowDownToLine size={14} />
                      Export diagnostics
                    </button>
                    <p className="field-help">
                      Contains app status and preferences only. Review the JSON
                      before sharing.
                    </p>
                  </SettingsSection>
                  <div className="saved-note">
                    <Check size={14} />
                    {saveStatus}
                    <span>
                      {isTauri()
                        ? "Windows app config"
                        : "Browser preview storage"}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
        <aside className="team-sidebar" aria-label="Agent sidebar">
          <div className="team-heading">
            <div>
              <h2>
                Your team <span>{sessions.length}</span>
              </h2>
              <p>
                {settings.demo
                  ? "A few familiar faces."
                  : "Waiting for a connection."}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Connection availability"
              onClick={() => nav("connections")}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="team-summary">
            <span>
              <i className="working-dot" />
              {working} at work
            </span>
            <span>
              <i className="waiting-dot" />
              {waiting} needs input
            </span>
          </div>
          <div className="agent-list">
            {sessions.map((a, i) => (
              <button
                className={"agent-row" + (selected === a.id ? " selected" : "")}
                key={a.id}
                aria-label={"Inspect " + providerNames[a.provider]}
                aria-pressed={selected === a.id}
                onClick={() => setSelected(a.id)}
              >
                <Avatar agent={a} index={i} settings={settings} />
                <span className="agent-copy">
                  <strong>
                    {providerNames[a.provider]}
                    <ProviderIcon provider={a.provider} />
                  </strong>
                  <span>
                    {a.state === "working"
                      ? taskLabels[a.task]
                      : a.state === "thinking"
                        ? "Working through an idea"
                        : a.state === "waiting"
                          ? "Ready for your input"
                          : "A moment at the coffee corner"}
                  </span>
                  <State state={a.state} />
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          {!sessions.length && (
            <div className="sidebar-empty">
              <Armchair size={32} />
              <h3>A seat for every session</h3>
              <p>
                Browser and local monitoring are not connected in this build.
              </p>
              <button className="button" onClick={() => setDemo(true)}>
                Try the demo
              </button>
            </div>
          )}
          {chosen && (
            <section className="agent-details">
              <div className="section-title">
                <h2>At their desk</h2>
                <span className="source-label">Simulated</span>
              </div>
              <div className="detail-identity">
                <Avatar
                  agent={chosen}
                  index={sessions.indexOf(chosen)}
                  settings={settings}
                  large
                />
                <div>
                  <h3>{providerNames[chosen.provider]}</h3>
                  <span>
                    {chosen.provider === "codex"
                      ? "Coding assistant"
                      : "AI assistant"}{" "}
                    · demo session
                  </span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>
                    <Folder size={12} /> Project
                  </dt>
                  <dd>{chosen.project ?? "—"}</dd>
                </div>
                <div>
                  <dt>Session time</dt>
                  <dd>{duration(now - chosen.startedAt)}</dd>
                </div>
                <div>
                  <dt>Last activity</dt>
                  <dd>{ago(now - chosen.lastActivity)}</dd>
                </div>
                <div>
                  <dt>Verified tokens</dt>
                  <dd>
                    {chosen.usage
                      ? (
                          chosen.usage.input + chosen.usage.output
                        ).toLocaleString()
                      : "Unavailable"}
                  </dd>
                </div>
              </dl>
              <label className="assignment">
                Workstation
                <select
                  aria-label="Assign workstation"
                  value={
                    settings.assignments[chosen.id] ??
                    "desk-" + (sessions.indexOf(chosen) + 1)
                  }
                  onChange={(e) => assign(chosen, e.target.value)}
                >
                  {[1, 2, 3, 4].map((i) => (
                    <option key={i} value={"desk-" + i}>
                      Desk 0{i}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} />
              </label>
              <div className="appearance">
                <span>Outfit</span>
                <div>
                  {looks.map((look) => (
                    <button
                      key={look}
                      aria-label={"Choose " + look + " outfit"}
                      aria-pressed={
                        (settings.appearances[chosen.id] ??
                          looks[sessions.indexOf(chosen) % 4]) === look
                      }
                      style={{ background: outfitColors[look] }}
                      onClick={() =>
                        update({
                          appearances: {
                            ...settings.appearances,
                            [chosen.id]: look,
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <button
                className="button advance"
                onClick={() => advance(chosen.id)}
              >
                Advance demo state <ArrowRight size={13} />
              </button>
            </section>
          )}
          <div className="sidebar-foot">
            <div>
              <ShieldCheck size={15} />
              <span>Everything stays on your device.</span>
            </div>
            <button onClick={() => nav("connections")}>
              About local connections <ArrowRight size={12} />
            </button>
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          <i className={settings.demo ? "demo-dot" : "neutral-dot"} />
          {settings.demo
            ? "Simulated office · no live monitoring"
            : "Live mode · connectors unavailable"}
          <span className="footer-separator">/</span>
          {isTauri() ? "Windows desktop" : "Browser preview"}
        </span>
        <div>
          {settings.demo && (
            <button onClick={() => setPaused(!paused)}>
              {paused ? <Play size={12} /> : <Pause size={12} />}{" "}
              {paused ? "Resume demo" : "Pause demo"}
            </button>
          )}
          <span>
            {settings.reducedMotion
              ? "Reduced motion"
              : settings.fps + " FPS target"}
          </span>
          <span className="footer-separator">/</span>
          <span>
            {saveStatus === "Saved on this device"
              ? "Preferences saved"
              : saveStatus}
          </span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Info size={15} />
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-well">{children}</div>
    </section>
  );
}
