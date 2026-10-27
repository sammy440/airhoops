import { DEFAULT_COURT } from "./physics";

/**
 * Court themes: the scenery around the hoop. Purely cosmetic (physics and
 * scoring never look at it), so each player picks their own and multiplayer
 * opponents can shoot on different courts.
 *
 * Backdrop and floor are drawn once into the game's cached background; the
 * colours below are used live for the spotlight, glass, net and ghost path.
 */

export type CourtThemeId = "arena" | "park" | "beach" | "rooftop" | "neon";

/** Screen-space layout of the scene (same numbers the game draws with). */
export interface SceneView {
  w: number;
  h: number;
  /** Screen y of the floor line. */
  floorY: number;
  /** Pixels per meter. */
  s: number;
  /** World x (m) → screen x. */
  X: (x: number) => number;
  /** World x of the hoop at rest. */
  hoopDistance: number;
}

export interface CourtTheme {
  id: CourtThemeId;
  name: string;
  blurb: string;
  /** "r,g,b" of the glow around the hoop, and its strength. */
  spot: string;
  spotAlpha: number;
  glass: string;
  glassFill: string;
  net: string;
  ghost: string;
  pole: string;
  arm: string;
  backdrop: (ctx: CanvasRenderingContext2D, v: SceneView) => void;
  floor: (ctx: CanvasRenderingContext2D, v: SceneView) => void;
}

/** Seeded PRNG so scenery looks the same every visit. */
export function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Shared pieces ── */

function vGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, c] of stops) g.addColorStop(at, c);
  return g;
}

/** Horizontal seams getting further apart towards the viewer. */
function seams(ctx: CanvasRenderingContext2D, v: SceneView, color: string, n = 7) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    const y = v.floorY + (v.h - v.floorY) * (i / n) ** 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(v.w, y);
    ctx.stroke();
  }
}

/** Glow on the floor under the hoop. */
function floorGlow(ctx: CanvasRenderingContext2D, v: SceneView, rgb: string, a: number) {
  const hx = v.X(v.hoopDistance);
  const g = ctx.createRadialGradient(hx, v.floorY + 6, 0, hx, v.floorY + 6, 2.5 * v.s);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
}

/** Shooting line under the player. */
function shootingLine(ctx: CanvasRenderingContext2D, v: SceneView, color: string) {
  const lx = v.X(0.15);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, v.s * 0.03);
  ctx.beginPath();
  ctx.moveTo(lx - v.s * 0.05, v.floorY + 2);
  ctx.lineTo(lx + v.s * 0.25, v.h);
  ctx.stroke();
}

function stars(ctx: CanvasRenderingContext2D, v: SceneView, seed: number, n: number, maxY: number) {
  const rnd = mulberry(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.6})`;
    const r = rnd() < 0.9 ? 0.8 : 1.6;
    ctx.fillRect(rnd() * v.w, rnd() * maxY, r, r);
  }
}

function lightBeams(ctx: CanvasRenderingContext2D, v: SceneView, rgb: string) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x0, spread, a] of [[0.25, 0.18, 0.05], [0.72, 0.22, 0.06]] as const) {
    const beam = vGradient(ctx, 0, v.floorY, [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(v.w * x0 - 20, 0);
    ctx.lineTo(v.w * x0 + 20, 0);
    ctx.lineTo(v.w * (x0 + spread), v.floorY);
    ctx.lineTo(v.w * (x0 - spread * 0.4), v.floorY);
    ctx.fill();
  }
  ctx.restore();
}

/* ── Night Arena (the original court) ── */

const CROWD = (() => {
  const rnd = mulberry(23);
  return Array.from({ length: 260 }, () => ({ x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.6, a: 0.05 + rnd() * 0.18, hue: rnd() < 0.7 ? 25 : 210 }));
})();

const arena: CourtTheme = {
  id: "arena",
  name: "Night Arena",
  blurb: "Indoor hardwood under the lights",
  spot: "255,150,70",
  spotAlpha: 0.22,
  glass: "rgba(247,241,214,0.75)",
  glassFill: "rgba(247,241,214,0.10)",
  net: "rgba(247,241,214,0.75)",
  ghost: "rgba(247,241,214,0.18)",
  pole: "#1d1d1c",
  arm: "#232322",
  backdrop(ctx, v) {
    ctx.fillStyle = vGradient(ctx, 0, v.floorY, [[0, "#090908"], [0.6, "#15100c"], [1, "#2a170b"]]);
    ctx.fillRect(0, 0, v.w, v.h);
    for (const p of CROWD) {
      ctx.fillStyle = `hsla(${p.hue}, 60%, 70%, ${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x * v.w, v.floorY * (0.18 + p.y * 0.5), p.r * Math.max(1, v.s / 120), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = vGradient(ctx, v.floorY * 0.7, v.floorY, [[0, "rgba(9,9,8,0)"], [1, "rgba(9,9,8,0.85)"]]);
    ctx.fillRect(0, v.floorY * 0.7, v.w, v.floorY * 0.3);
    lightBeams(ctx, v, "255,220,170");
  },
  floor(ctx, v) {
    ctx.fillStyle = vGradient(ctx, v.floorY, v.h, [[0, "#8a4a1c"], [0.35, "#5c2f12"], [1, "#1c0f07"]]);
    ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    seams(ctx, v, "rgba(0,0,0,0.18)");
    floorGlow(ctx, v, "255,190,120", 0.22);
    shootingLine(ctx, v, "rgba(247,241,214,0.55)");
    ctx.fillStyle = "rgba(255,200,140,0.15)";
    ctx.fillRect(0, v.floorY, v.w, 1.5);
  },
};

/* ── Park Day: outdoor blacktop, blue sky, chain net ── */

const park: CourtTheme = {
  id: "park",
  name: "Park Day",
  blurb: "Sunny blacktop with a chain net",
  spot: "255,240,200",
  spotAlpha: 0.12,
  glass: "rgba(30,40,50,0.7)",
  glassFill: "rgba(255,255,255,0.22)",
  net: "rgba(70,74,80,0.9)",
  ghost: "rgba(20,30,40,0.3)",
  pole: "#2c3238",
  arm: "#353c43",
  backdrop(ctx, v) {
    const { w, floorY: f } = v;
    ctx.fillStyle = vGradient(ctx, 0, f, [[0, "#2f7fc9"], [0.65, "#7fc0ea"], [1, "#cfe9f5"]]);
    ctx.fillRect(0, 0, w, v.h);
    // Sun
    const sx = w * 0.16;
    const sy = f * 0.16;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, f * 0.35);
    glow.addColorStop(0, "rgba(255,250,220,0.9)");
    glow.addColorStop(0.15, "rgba(255,245,200,0.6)");
    glow.addColorStop(1, "rgba(255,245,200,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, f);
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath();
    ctx.arc(sx, sy, f * 0.045, 0, Math.PI * 2);
    ctx.fill();
    // Clouds
    const rnd = mulberry(7);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 5; i++) {
      const cx = w * (0.28 + rnd() * 0.42);
      const cy = f * (0.1 + rnd() * 0.25);
      const r = f * (0.03 + rnd() * 0.025);
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.arc(cx + (j - 1.5) * r * 1.1, cy - (j % 2) * r * 0.5, r * (j % 3 ? 1 : 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Tree line
    const trees = mulberry(11);
    for (const [shade, base, size] of [["#4f8f45", 0.74, 0.09], ["#3a7535", 0.8, 0.07]] as const) {
      ctx.fillStyle = shade;
      for (let x = -20; x < w + 20; x += f * size * (0.9 + trees() * 0.6)) {
        ctx.beginPath();
        ctx.arc(x, f * base, f * size * (0.8 + trees() * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(0, f * base, w, f * (1 - base));
    }
    // Chain-link fence
    const top = f * 0.62;
    ctx.fillStyle = "rgba(60,66,72,0.12)";
    ctx.fillRect(0, top, w, f - top);
    ctx.strokeStyle = "rgba(60,66,72,0.28)";
    ctx.lineWidth = 1;
    const step = Math.max(8, v.s * 0.12);
    ctx.beginPath();
    for (let x = -f; x < w + f; x += step) {
      ctx.moveTo(x, top);
      ctx.lineTo(x + (f - top), f);
      ctx.moveTo(x, top);
      ctx.lineTo(x - (f - top), f);
    }
    ctx.stroke();
    ctx.strokeStyle = "#5d656d";
    ctx.lineWidth = Math.max(2, v.s * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(w, top);
    for (let x = w * 0.06; x < w; x += w / 5) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, f);
    }
    ctx.stroke();
  },
  floor(ctx, v) {
    ctx.fillStyle = vGradient(ctx, v.floorY, v.h, [[0, "#4a5560"], [0.35, "#353d46"], [1, "#1c2127"]]);
    ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    // Painted key under the hoop.
    const hx = v.X(v.hoopDistance);
    const kw = 1.8 * v.s;
    const kd = (v.h - v.floorY) * 0.55;
    ctx.fillStyle = "rgba(200,60,40,0.55)";
    ctx.beginPath();
    ctx.moveTo(hx - kw * 0.45, v.floorY);
    ctx.lineTo(hx + kw * 0.45, v.floorY);
    ctx.lineTo(hx + kw * 0.6, v.floorY + kd);
    ctx.lineTo(hx - kw * 0.6, v.floorY + kd);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1.5, v.s * 0.02);
    ctx.stroke();
    // Cracks and wear.
    const rnd = mulberry(5);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = rnd() * v.w;
      let y = v.floorY + rnd() * (v.h - v.floorY);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) ctx.lineTo((x += (rnd() - 0.5) * 30), (y += (rnd() - 0.3) * 10));
      ctx.stroke();
    }
    floorGlow(ctx, v, "255,250,220", 0.1);
    shootingLine(ctx, v, "rgba(255,255,255,0.8)");
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(0, v.floorY, v.w, Math.max(1.5, v.s * 0.02));
  },
};

/* ── Sunset Beach: sand court, ocean, palms ── */

function palm(ctx: CanvasRenderingContext2D, x: number, base: number, height: number, lean: number) {
  const topX = x + lean * height;
  const topY = base - height;
  ctx.strokeStyle = "#1c0f22";
  ctx.lineCap = "round";
  ctx.lineWidth = height * 0.045;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + lean * height * 0.2, base - height * 0.6, topX, topY);
  ctx.stroke();
  ctx.lineWidth = height * 0.03;
  for (const [dx, dy] of [[-1, 0.25], [-0.7, -0.15], [0, -0.3], [0.7, -0.15], [1, 0.25], [0.4, 0.4], [-0.4, 0.4]]) {
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + dx * height * 0.25, topY + dy * height * 0.15 - height * 0.12, topX + dx * height * 0.38, topY + dy * height * 0.35 + height * 0.08);
    ctx.stroke();
  }
}

const beach: CourtTheme = {
  id: "beach",
  name: "Sunset Beach",
  blurb: "Golden hour on the sand",
  spot: "255,170,90",
  spotAlpha: 0.16,
  glass: "rgba(255,240,220,0.8)",
  glassFill: "rgba(255,230,200,0.14)",
  net: "rgba(255,245,230,0.85)",
  ghost: "rgba(255,240,220,0.25)",
  pole: "#2a1a2a",
  arm: "#33202f",
  backdrop(ctx, v) {
    const { w, floorY: f } = v;
    const horizon = f * 0.74;
    ctx.fillStyle = vGradient(ctx, 0, horizon, [[0, "#24163f"], [0.45, "#8d3a6b"], [0.8, "#e9714a"], [1, "#ffc77a"]]);
    ctx.fillRect(0, 0, w, v.h);
    stars(ctx, v, 3, 40, horizon * 0.3);
    // Sun sinking into the sea.
    const sx = w * 0.6;
    const r = f * 0.14;
    const glow = ctx.createRadialGradient(sx, horizon, r * 0.5, sx, horizon, r * 3.2);
    glow.addColorStop(0, "rgba(255,210,140,0.6)");
    glow.addColorStop(1, "rgba(255,180,120,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = vGradient(ctx, horizon - r, horizon, [[0, "#fff1b8"], [1, "#ffb15a"]]);
    ctx.beginPath();
    ctx.arc(sx, horizon, r, Math.PI, 0);
    ctx.fill();
    // Ocean with a shimmer path under the sun.
    ctx.fillStyle = vGradient(ctx, horizon, f, [[0, "#4a2f62"], [1, "#1d3f63"]]);
    ctx.fillRect(0, horizon, w, f - horizon);
    const rnd = mulberry(19);
    for (let i = 0; i < 40; i++) {
      const t = rnd();
      const y = horizon + 3 + t * (f - horizon - 6);
      const spread = r * (0.6 + t * 1.6);
      const x = sx + (rnd() - 0.5) * spread * 2;
      ctx.strokeStyle = `rgba(255,200,130,${0.5 - t * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 4 - t * 10, y);
      ctx.lineTo(x + 4 + t * 10, y);
      ctx.stroke();
    }
    palm(ctx, w * 0.06, f, f * 0.62, 0.18);
    palm(ctx, w * 0.95, f, f * 0.5, -0.22);
    palm(ctx, w * 0.88, f, f * 0.36, 0.1);
  },
  floor(ctx, v) {
    ctx.fillStyle = vGradient(ctx, v.floorY, v.h, [[0, "#f3c98e"], [0.35, "#d49c5f"], [1, "#7a4c2a"]]);
    ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    const rnd = mulberry(29);
    for (let i = 0; i < 220; i++) {
      const t = rnd();
      ctx.fillStyle = rnd() < 0.5 ? "rgba(110,60,25,0.25)" : "rgba(255,240,210,0.3)";
      const r = 0.6 + t * 1.6;
      ctx.fillRect(rnd() * v.w, v.floorY + t ** 1.4 * (v.h - v.floorY), r, r);
    }
    floorGlow(ctx, v, "255,190,120", 0.2);
    shootingLine(ctx, v, "rgba(255,255,255,0.7)");
  },
};

/* ── City Rooftop: skyline at night ── */

const SKYLINE = (() => {
  const rnd = mulberry(41);
  const layers: { x: number; w: number; h: number; windows: number[] }[][] = [[], []];
  for (const layer of layers) {
    for (let x = -0.02; x < 1.02; ) {
      const bw = 0.04 + rnd() * 0.07;
      layer.push({ x, w: bw, h: 0.25 + rnd() * 0.45, windows: Array.from({ length: 60 }, () => rnd()) });
      x += bw + rnd() * 0.01;
    }
  }
  return layers;
})();

const rooftop: CourtTheme = {
  id: "rooftop",
  name: "City Rooftop",
  blurb: "Concrete court above the skyline",
  spot: "150,190,255",
  spotAlpha: 0.18,
  glass: "rgba(220,235,255,0.75)",
  glassFill: "rgba(200,220,255,0.10)",
  net: "rgba(230,240,255,0.8)",
  ghost: "rgba(220,235,255,0.2)",
  pole: "#1a1e26",
  arm: "#222731",
  backdrop(ctx, v) {
    const { w, floorY: f } = v;
    ctx.fillStyle = vGradient(ctx, 0, f, [[0, "#040612"], [0.6, "#0e1834"], [1, "#27355e"]]);
    ctx.fillRect(0, 0, w, v.h);
    stars(ctx, v, 13, 120, f * 0.5);
    // Moon
    const mx = w * 0.82;
    const my = f * 0.16;
    const mr = f * 0.05;
    const glow = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 5);
    glow.addColorStop(0, "rgba(200,215,255,0.25)");
    glow.addColorStop(1, "rgba(200,215,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, f);
    ctx.fillStyle = "#e9eefc";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#070b1d";
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.9, 0, Math.PI * 2);
    ctx.fill();
    // Skyline: far layer then near layer, with lit windows.
    SKYLINE.forEach((layer, li) => {
      const body = li === 0 ? "#141d38" : "#0a0f20";
      const lit = li === 0 ? "rgba(255,214,140,0.35)" : "rgba(255,214,140,0.6)";
      const scale = li === 0 ? 0.85 : 0.6;
      for (const b of layer) {
        const bh = b.h * f * scale;
        const x = b.x * w;
        const bw = b.w * w;
        const y = f - bh;
        ctx.fillStyle = body;
        ctx.fillRect(x, y, bw, bh);
        const cell = Math.max(5, v.s * 0.1);
        let k = 0;
        ctx.fillStyle = lit;
        for (let wy = y + cell; wy < f - cell; wy += cell * 1.6) {
          for (let wx = x + cell * 0.6; wx < x + bw - cell; wx += cell * 1.4) {
            if (b.windows[k++ % b.windows.length] < 0.35) ctx.fillRect(wx, wy, cell * 0.6, cell * 0.7);
          }
        }
      }
    });
    // Railing along the roof edge.
    const rail = f - Math.max(18, v.s * 0.55);
    ctx.strokeStyle = "rgba(160,175,200,0.45)";
    ctx.lineWidth = Math.max(1.5, v.s * 0.02);
    ctx.beginPath();
    ctx.moveTo(0, rail);
    ctx.lineTo(w, rail);
    for (let x = 0; x < w; x += Math.max(14, v.s * 0.3)) {
      ctx.moveTo(x, rail);
      ctx.lineTo(x, f);
    }
    ctx.stroke();
  },
  floor(ctx, v) {
    ctx.fillStyle = vGradient(ctx, v.floorY, v.h, [[0, "#5a606b"], [0.35, "#3c414a"], [1, "#16181d"]]);
    ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    seams(ctx, v, "rgba(0,0,0,0.22)", 5);
    // Tile joints converging away from the viewer.
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -6; i <= 6; i++) {
      const x = v.w / 2 + i * v.w * 0.12;
      ctx.moveTo(x, v.floorY);
      ctx.lineTo(v.w / 2 + i * v.w * 0.2, v.h);
    }
    ctx.stroke();
    floorGlow(ctx, v, "160,195,255", 0.18);
    shootingLine(ctx, v, "rgba(255,190,70,0.8)");
    ctx.fillStyle = "rgba(180,200,240,0.2)";
    ctx.fillRect(0, v.floorY, v.w, 1.5);
  },
};

/* ── Neon Grid: retro synth sunset ── */

const neon: CourtTheme = {
  id: "neon",
  name: "Neon Grid",
  blurb: "Retro glow, infinite grid",
  spot: "255,61,200",
  spotAlpha: 0.2,
  glass: "rgba(110,240,255,0.85)",
  glassFill: "rgba(110,240,255,0.08)",
  net: "rgba(110,240,255,0.85)",
  ghost: "rgba(110,240,255,0.25)",
  pole: "#1a0b2a",
  arm: "#23103a",
  backdrop(ctx, v) {
    const { w, floorY: f } = v;
    ctx.fillStyle = vGradient(ctx, 0, f, [[0, "#06020e"], [0.55, "#1c0733"], [1, "#4a0d4f"]]);
    ctx.fillRect(0, 0, w, v.h);
    stars(ctx, v, 31, 90, f * 0.6);
    // Striped sun on the horizon.
    const sx = w * 0.55;
    const r = f * 0.3;
    const cy = f - r * 0.15;
    const glow = ctx.createRadialGradient(sx, cy, r * 0.8, sx, cy, r * 1.8);
    glow.addColorStop(0, "rgba(255,61,139,0.35)");
    glow.addColorStop(1, "rgba(255,61,139,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, f);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = vGradient(ctx, cy - r, cy + r * 0.2, [[0, "#ffe25a"], [0.55, "#ff8a3d"], [1, "#ff2d8a"]]);
    ctx.fillRect(sx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#2c0a40";
    for (let i = 0; i < 6; i++) {
      const y = cy - r * 0.55 + i * r * 0.11;
      ctx.fillRect(sx - r, y, r * 2, 1.5 + i * r * 0.018);
    }
    ctx.restore();
    // Wireframe mountains.
    ctx.fillStyle = "#12041f";
    ctx.strokeStyle = "rgba(255,61,200,0.7)";
    ctx.lineWidth = 1.5;
    const rnd = mulberry(37);
    ctx.beginPath();
    ctx.moveTo(0, f);
    for (let x = 0; x <= w + 40; x += 40) ctx.lineTo(x, f - (0.04 + rnd() * 0.12) * f * (Math.abs(x / w - 0.55) > 0.18 ? 1 : 0.3));
    ctx.lineTo(w, f);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  floor(ctx, v) {
    ctx.fillStyle = vGradient(ctx, v.floorY, v.h, [[0, "#1f0636"], [1, "#05010a"]]);
    ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,61,200,0.55)";
    ctx.lineWidth = 1;
    seams(ctx, v, "rgba(255,61,200,0.55)", 9);
    const vx = v.w * 0.55;
    ctx.beginPath();
    for (let i = -14; i <= 14; i++) {
      ctx.moveTo(vx + i * v.w * 0.04, v.floorY);
      ctx.lineTo(vx + i * v.w * 0.22, v.h);
    }
    ctx.stroke();
    ctx.restore();
    floorGlow(ctx, v, "110,240,255", 0.14);
    shootingLine(ctx, v, "rgba(110,240,255,0.9)");
    ctx.fillStyle = "rgba(255,61,200,0.9)";
    ctx.fillRect(0, v.floorY, v.w, 2);
  },
};

export const COURT_THEMES: Record<CourtThemeId, CourtTheme> = { arena, park, beach, rooftop, neon };
export const COURT_THEME_ORDER: CourtThemeId[] = ["arena", "park", "beach", "rooftop", "neon"];
export const DEFAULT_COURT_THEME: CourtThemeId = "arena";

/** Accepts anything (e.g. localStorage) and returns a known theme id. */
export function courtThemeId(x: unknown): CourtThemeId {
  return typeof x === "string" && x in COURT_THEMES ? (x as CourtThemeId) : DEFAULT_COURT_THEME;
}

/** Static backdrop + floor. */
export function drawScenery(ctx: CanvasRenderingContext2D, theme: CourtTheme, v: SceneView) {
  theme.backdrop(ctx, v);
  theme.floor(ctx, v);
}

/** Thumbnail for the picker: scenery plus a simple hoop, framed like the game. */
export function drawCourtPreview(ctx: CanvasRenderingContext2D, theme: CourtTheme, w: number, h: number) {
  const c = DEFAULT_COURT;
  const left = -1.9;
  const board = c.hoopDistance + c.rimRadius + c.boardGap;
  const right = board + 1.5;
  const floorY = h * 0.86;
  const s = Math.min(w / (right - left), floorY / 5.3);
  const ox = (w - (right - left) * s) / 2 - left * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => floorY - y * s;
  drawScenery(ctx, theme, { w, h, floorY, s, X, hoopDistance: c.hoopDistance });

  const spot = ctx.createRadialGradient(X(c.hoopDistance), Y(c.rimHeight + 0.6), 0, X(c.hoopDistance), Y(c.rimHeight + 0.6), 4.2 * s);
  spot.addColorStop(0, `rgba(${theme.spot},${theme.spotAlpha})`);
  spot.addColorStop(1, `rgba(${theme.spot},0)`);
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);

  const lo = c.rimHeight + c.boardBottom;
  const hi = c.rimHeight + c.boardTop;
  const pole = board + 1;
  ctx.fillStyle = theme.pole;
  ctx.fillRect(X(pole) - s * 0.07, Y(hi - 0.25), s * 0.14, Y(0) - Y(hi - 0.25));
  ctx.strokeStyle = theme.arm;
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(X(pole), Y(hi - 0.3));
  ctx.lineTo(X(board + 0.2), Y((lo + hi) / 2));
  ctx.stroke();
  ctx.fillStyle = theme.glassFill;
  ctx.strokeStyle = theme.glass;
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath();
  ctx.rect(X(board), Y(hi), s * 0.3, Y(lo) - Y(hi));
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#ea3a1d";
  ctx.lineWidth = Math.max(1.5, s * 0.035);
  ctx.beginPath();
  ctx.ellipse(X(c.hoopDistance), Y(c.rimHeight), c.rimRadius * s, c.rimRadius * s * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = theme.net;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [-1, -0.33, 0.33, 1]) {
    ctx.moveTo(X(c.hoopDistance + k * c.rimRadius), Y(c.rimHeight));
    ctx.lineTo(X(c.hoopDistance + k * c.rimRadius * 0.58), Y(c.rimHeight - 0.42));
  }
  ctx.stroke();
}
