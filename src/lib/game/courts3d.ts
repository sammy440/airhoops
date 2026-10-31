import type { CourtThemeId } from "./courts";

/**
 * The 3D look of each court theme (courts.ts has the 2D painters). Colours only:
 * the 3D scene builds the same court, hoop and stand for every theme.
 */
export interface Court3D {
  /** Sky gradient, top → horizon */
  sky: [string, string];
  fog: string;
  floor: string;
  /** Court markings */
  lines: string;
  /** The lane ("key") under the hoop */
  paint: string;
  /** Hemisphere light: from above, from below */
  light: [string, string];
  lightIntensity: number;
  /** Glass tint and opacity */
  glass: string;
  glassOpacity: number;
  net: string;
  pole: string;
  ghost: string;
}

export const COURTS_3D: Record<CourtThemeId, Court3D> = {
  arena: {
    sky: ["#120a08", "#2e1a12"],
    fog: "#1a0f0b",
    floor: "#b8783f",
    lines: "#f7f1d6",
    paint: "#7a2a18",
    light: ["#ffe2c2", "#3a2414"],
    lightIntensity: 1.25,
    glass: "#ffffff",
    glassOpacity: 0.3,
    net: "#f7f1d6",
    pole: "#1d1d1c",
    ghost: "#f7f1d6",
  },
  park: {
    sky: ["#5bb4f5", "#d6eeff"],
    fog: "#cfe7fb",
    floor: "#3a3e44",
    lines: "#f0f0ea",
    paint: "#2c5c8a",
    light: ["#ffffff", "#4b4f55"],
    lightIntensity: 1.6,
    glass: "#dfe9f2",
    glassOpacity: 0.3,
    net: "#5d636b",
    pole: "#2c3238",
    ghost: "#14202c",
  },
  beach: {
    sky: ["#ff7e5f", "#ffd59e"],
    fog: "#ffc79b",
    floor: "#e6c28a",
    lines: "#fff6e6",
    paint: "#d98a5c",
    light: ["#ffd2a8", "#8a5a3c"],
    lightIntensity: 1.45,
    glass: "#fff3e6",
    glassOpacity: 0.22,
    net: "#fff5e6",
    pole: "#2a1a2a",
    ghost: "#fff0dc",
  },
  rooftop: {
    sky: ["#0b1530", "#2f4774"],
    fog: "#1b2947",
    floor: "#686c74",
    lines: "#e8eef8",
    paint: "#38507e",
    light: ["#cfe0ff", "#2a2f3a"],
    lightIntensity: 1.3,
    glass: "#dceaff",
    glassOpacity: 0.2,
    net: "#e6f0ff",
    pole: "#1a1e26",
    ghost: "#dceaff",
  },
  neon: {
    sky: ["#07000f", "#26003f"],
    fog: "#12002a",
    floor: "#0d0b1c",
    lines: "#6ef0ff",
    paint: "#3d0f4a",
    light: ["#c9a6ff", "#1a0830"],
    lightIntensity: 1.1,
    glass: "#6ef0ff",
    glassOpacity: 0.16,
    net: "#6ef0ff",
    pole: "#1a1030",
    ghost: "#6ef0ff",
  },
};
