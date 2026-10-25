import { z } from "zod";
import { invoke, isTauri } from "@tauri-apps/api/core";
export const furnitureSchema = z
  .object({
    id: z.enum(["desk-1", "desk-2", "desk-3", "desk-4"]),
    x: z.number().int().min(80).max(350),
    y: z.number().int().min(106).max(264),
  })
  .strict();
export const settingsSchema = z
  .object({
    version: z.literal(1),
    demo: z.boolean(),
    fps: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    effects: z.boolean(),
    reducedMotion: z.boolean(),
    theme: z.enum(["maple", "dusk"]),
    sound: z.boolean(),
    notifications: z.boolean(),
    furniture: z
      .array(furnitureSchema)
      .length(4)
      .refine((items) => new Set(items.map((x) => x.id)).size === 4),
    appearances: z.record(
      z.string().max(128),
      z.enum(["mint", "peach", "blue", "gold"]),
    ),
    assignments: z.record(
      z.string().max(128),
      z.enum(["desk-1", "desk-2", "desk-3", "desk-4"]),
    ),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
  version: 1,
  demo: false,
  fps: 60,
  effects: true,
  reducedMotion: false,
  theme: "maple",
  sound: false,
  notifications: false,
  furniture: [
    { id: "desk-1", x: 104, y: 130 },
    { id: "desk-2", x: 264, y: 130 },
    { id: "desk-3", x: 104, y: 246 },
    { id: "desk-4", x: 264, y: 246 },
  ],
  appearances: {},
  assignments: {},
};
const key = "ai-workspace.preferences.v1";
export function decodeSettings(raw: unknown): Settings {
  return settingsSchema.parse(raw);
}
export async function loadSettings(): Promise<{
  settings: Settings;
  warning?: string;
}> {
  try {
    const raw = isTauri()
      ? await invoke<unknown>("load_preferences")
      : JSON.parse(localStorage.getItem(key) ?? "null");
    return {
      settings: raw === null ? structuredClone(defaults) : decodeSettings(raw),
    };
  } catch {
    return {
      settings: structuredClone(defaults),
      warning:
        "Saved preferences could not be read. Defaults are loaded; changes will replace them.",
    };
  }
}
let writeQueue: Promise<unknown> = Promise.resolve();
export function saveSettings(value: Settings): Promise<void> {
  const clean = decodeSettings(value);
  const write = async () => {
    if (isTauri()) await invoke("save_preferences", { preferences: clean });
    else localStorage.setItem(key, JSON.stringify(clean));
  };
  const result = writeQueue.catch(() => undefined).then(write);
  writeQueue = result;
  return result;
}
