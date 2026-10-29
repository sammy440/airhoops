import type { Avatar } from "./game/avatar";
import { COURT_THEMES, drawScenery, type CourtThemeId } from "./game/courts";
import { DEFAULT_POSE, drawPlayer, STANDING_POSE, type Vec } from "./game/drawPlayer";

/**
 * Shareable result image (1080×1350, the 4:5 portrait size feeds and chats show
 * uncropped): the player's court, the players in their own look, a big score,
 * a few stats and the site address. Drawn in the browser; nothing is uploaded.
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardPlayer {
  name: string;
  avatar: Avatar;
  /** Shown big, e.g. "8" (points) or "4/5" (shootout makes). */
  score: string;
  you: boolean;
  winner: boolean;
}

export interface ResultCardData {
  /** Small caps line at the top right, e.g. "Race · 1 min · All-Star". */
  context: string;
  /** "YOU WIN!", "BUCKETS.", … */
  headline: string;
  /** Highlight pill under the headline, e.g. "New personal best". */
  badge?: string;
  /** One = solo card; two = head to head; three or four = ranked list. */
  players: CardPlayer[];
  /** Solo only: what the big number counts ("points", "in a row"). */
  unit?: string;
  stats: [label: string, value: string][];
  theme: CourtThemeId;
  url: string;
}

const C = {
  ink: "#0e0e0d",
  cream: "#f7f1d6",
  hoop: "#ea3a1d",
  hoopSoft: "#ff6b3d",
  sun: "#f6a13a",
  muted: "rgba(247,241,214,0.6)",
};
const PAD = 72;
/** Where the court floor meets the backdrop; every layout stands its players here. */
const FLOOR = 1010;

interface Fonts {
  display: string;
  sans: string;
  mono: string;
}

function cssFont(variable: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** Fonts come from next/font; wait for them so the card never renders in a fallback. */
async function loadFonts(): Promise<Fonts> {
  const fonts = {
    display: cssFont("--font-display", "Impact, sans-serif"),
    sans: cssFont("--font-geist-sans", "system-ui, sans-serif"),
    mono: cssFont("--font-geist-mono", "ui-monospace, monospace"),
  };
  try {
    await Promise.all([
      document.fonts.load(`100px ${fonts.display}`),
      document.fonts.load(`600 40px ${fonts.sans}`),
      document.fonts.load(`40px ${fonts.mono}`),
    ]);
  } catch {}
  return fonts;
}

export async function renderResultCard(data: ResultCardData): Promise<Blob> {
  const fonts = await loadFonts();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  drawCard(ctx, data, fonts);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

function drawCard(ctx: CanvasRenderingContext2D, d: ResultCardData, f: Fonts) {
  // The player's court behind everything (scenery only: a hoop would sit behind someone's head),
  // darkened top and bottom so the type reads.
  const s = 125;
  drawScenery(ctx, COURT_THEMES[d.theme], { w: CARD_W, h: CARD_H, floorY: FLOOR, s, X: (x) => 300 + x * s, hoopDistance: 4.6 });
  const shade = ctx.createLinearGradient(0, 0, 0, CARD_H);
  shade.addColorStop(0, "rgba(14,14,13,0.9)");
  shade.addColorStop(0.32, "rgba(14,14,13,0.55)");
  shade.addColorStop(0.62, "rgba(14,14,13,0.35)");
  shade.addColorStop(0.8, "rgba(14,14,13,0.85)");
  shade.addColorStop(1, "rgba(14,14,13,0.96)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Brand + context
  drawBall(ctx, PAD + 22, PAD + 24, 22, 0.3);
  ctx.textBaseline = "middle";
  ctx.font = `italic 46px ${f.display}`;
  ctx.fillStyle = C.cream;
  ctx.fillText("AIR", PAD + 58, PAD + 26);
  ctx.fillStyle = C.hoop;
  ctx.fillText("HOOPS", PAD + 58 + ctx.measureText("AIR").width, PAD + 26);
  ctx.textAlign = "right";
  ctx.font = `600 26px ${f.sans}`;
  spaced(ctx, 3);
  ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, d.context.toUpperCase(), 560), CARD_W - PAD, PAD + 26);
  spaced(ctx, 0);
  ctx.textAlign = "left";

  // Headline + badge
  ctx.textBaseline = "alphabetic";
  ctx.font = `${headlineSize(ctx, d.headline, f)}px ${f.display}`;
  ctx.fillStyle = d.players.some((p) => p.you && p.winner) || d.players.length === 1 ? C.hoop : C.cream;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 24;
  ctx.fillText(d.headline.toUpperCase(), PAD - 4, 330);
  ctx.shadowBlur = 0;
  if (d.badge) pill(ctx, d.badge.toUpperCase(), PAD, 372, f);

  if (d.players.length <= 1) drawSolo(ctx, d, f);
  else if (d.players.length === 2) drawHeadToHead(ctx, d, f);
  else drawRanking(ctx, d, f);

  drawStats(ctx, d.stats, f);

  // Footer
  ctx.textBaseline = "middle";
  ctx.font = `500 26px ${f.sans}`;
  ctx.fillStyle = C.muted;
  ctx.fillText("Played with nothing but my arms.", PAD, CARD_H - 62);
  ctx.textAlign = "right";
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillStyle = C.hoopSoft;
  ctx.fillText(d.url.replace(/^https?:\/\//, ""), CARD_W - PAD, CARD_H - 62);
  ctx.textAlign = "left";
}

/* ── Layouts ── */

function drawSolo(ctx: CanvasRenderingContext2D, d: ResultCardData, f: Fonts) {
  const p = d.players[0];
  // Shooting pose with the ball up in the hands.
  const s = 600 / 2.35;
  const view = player(ctx, p.avatar, DEFAULT_POSE, { cx: 300, feet: FLOOR, s, centerX: -0.18 }, f);
  drawBall(ctx, view.X(-0.01), view.Y(2.19), 0.12 * s, -0.5);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  const right = CARD_W - PAD;
  let size = 300;
  ctx.font = `${size}px ${f.display}`;
  while (ctx.measureText(p.score).width > 470 && size > 120) ctx.font = `${(size -= 10)}px ${f.display}`;
  ctx.fillStyle = C.cream;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 30;
  ctx.fillText(p.score, right, 780);
  ctx.shadowBlur = 0;
  if (d.unit) {
    ctx.font = `64px ${f.display}`;
    ctx.fillStyle = C.sun;
    ctx.fillText(d.unit.toUpperCase(), right, 860);
  }
  ctx.font = `600 38px ${f.sans}`;
  ctx.fillStyle = C.cream;
  ctx.fillText(fit(ctx, p.name, 440), right, 940);
  ctx.textAlign = "left";
}

function drawHeadToHead(ctx: CanvasRenderingContext2D, d: ResultCardData, f: Fonts) {
  const [a, b] = d.players;
  const s = 470 / 2.1;
  const spots = [
    { p: a, cx: 235 },
    { p: b, cx: CARD_W - 235 },
  ];
  for (const { p, cx } of spots) {
    ctx.globalAlpha = p.winner ? 1 : 0.78;
    const view = player(ctx, p.avatar, STANDING_POSE, { cx, feet: FLOOR, s, centerX: 0 }, f);
    ctx.globalAlpha = 1;
    if (p.winner) crown(ctx, cx, view.Y(2.0), 46);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 38px ${f.sans}`;
    ctx.fillStyle = C.cream;
    ctx.fillText(fit(ctx, p.name, 380), cx, 1058);
    if (p.you) {
      ctx.font = `600 22px ${f.sans}`;
      spaced(ctx, 3);
      ctx.fillStyle = C.sun;
      ctx.fillText("YOU", cx, 1092);
      spaced(ctx, 0);
    }
  }

  // Score between them: winner's number in hoop red.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  let size = 190;
  const parts = [a.score, "–", b.score];
  const measure = () => {
    ctx.font = `${size}px ${f.display}`;
    return parts.reduce((w, t) => w + ctx.measureText(t).width, 0) + 2 * 24;
  };
  while (measure() > 420 && size > 90) size -= 10;
  const total = measure();
  let x = CARD_W / 2 - total / 2;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 30;
  parts.forEach((t, i) => {
    const w = ctx.measureText(t).width;
    ctx.fillStyle = i === 1 ? C.muted : (i === 0 ? a : b).winner ? C.hoop : C.cream;
    ctx.fillText(t, x + w / 2, 760);
    x += w + 24;
  });
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
}

function drawRanking(ctx: CanvasRenderingContext2D, d: ResultCardData, f: Fonts) {
  const top = d.players.find((p) => p.winner) ?? d.players[0];
  const s = 520 / 2.1;
  const view = player(ctx, top.avatar, STANDING_POSE, { cx: 260, feet: FLOOR, s, centerX: 0 }, f);
  crown(ctx, 260, view.Y(2.0), 50);

  const x0 = 500;
  const w = CARD_W - PAD - x0;
  d.players.forEach((p, i) => {
    const y = 520 + i * 128;
    ctx.fillStyle = p.you ? "rgba(234,58,29,0.28)" : "rgba(14,14,13,0.6)";
    roundRect(ctx, x0, y, w, 104, 28);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.font = `56px ${f.display}`;
    ctx.fillStyle = p.winner ? C.sun : C.muted;
    ctx.fillText(String(i + 1), x0 + 28, y + 54);
    ctx.font = `600 36px ${f.sans}`;
    ctx.fillStyle = C.cream;
    ctx.fillText(fit(ctx, p.name + (p.you ? " (you)" : ""), w - 260), x0 + 90, y + 54);
    ctx.textAlign = "right";
    ctx.font = `60px ${f.display}`;
    ctx.fillStyle = p.winner ? C.hoop : C.cream;
    ctx.fillText(p.score, x0 + w - 28, y + 56);
    ctx.textAlign = "left";
  });
}

function drawStats(ctx: CanvasRenderingContext2D, stats: [string, string][], f: Fonts) {
  if (!stats.length) return;
  const y = 1128;
  const h = 120;
  const w = CARD_W - PAD * 2;
  ctx.fillStyle = "rgba(247,241,214,0.07)";
  roundRect(ctx, PAD, y, w, h, 32);
  ctx.fill();
  ctx.strokeStyle = "rgba(247,241,214,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const col = w / stats.length;
  stats.forEach(([label, value], i) => {
    const cx = PAD + col * i + col / 2;
    if (i) {
      ctx.fillStyle = "rgba(247,241,214,0.12)";
      ctx.fillRect(PAD + col * i, y + 24, 2, h - 48);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `54px ${f.display}`;
    ctx.fillStyle = C.cream;
    ctx.fillText(fit(ctx, value, col - 24), cx, y + 66);
    ctx.font = `600 20px ${f.sans}`;
    spaced(ctx, 2.5);
    ctx.fillStyle = C.muted;
    ctx.fillText(fit(ctx, label.toUpperCase(), col - 24), cx, y + 98);
    spaced(ctx, 0);
  });
  ctx.textAlign = "left";
}

/* ── Pieces ── */

function player(
  ctx: CanvasRenderingContext2D,
  look: Avatar,
  pose: Record<number, Vec>,
  at: { cx: number; feet: number; s: number; centerX: number },
  f: Fonts,
) {
  const X = (x: number) => at.cx + (x - at.centerX) * at.s;
  const Y = (y: number) => at.feet - y * at.s;
  // Soft floor shadow
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(at.cx, at.feet + 6, at.s * 0.42, at.s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  drawPlayer(ctx, pose, look, { X, Y, s: at.s, font: f.display, glow: true });
  ctx.restore();
  return { X, Y };
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, "#ffb070");
  g.addColorStop(0.55, "#f07b2c");
  g.addColorStop(1, "#8f3410");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = "rgba(30,12,4,0.65)";
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.moveTo(-r * 0.55, -r * 0.83);
  ctx.quadraticCurveTo(-r * 0.15, 0, -r * 0.55, r * 0.83);
  ctx.moveTo(r * 0.55, -r * 0.83);
  ctx.quadraticCurveTo(r * 0.15, 0, r * 0.55, r * 0.83);
  ctx.stroke();
  ctx.restore();
}

function crown(ctx: CanvasRenderingContext2D, cx: number, bottom: number, w: number) {
  const h = w * 0.62;
  ctx.fillStyle = C.sun;
  ctx.shadowColor = "rgba(246,161,58,0.6)";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, bottom);
  ctx.lineTo(cx - w / 2, bottom - h * 0.55);
  ctx.lineTo(cx - w / 4, bottom - h * 0.25);
  ctx.lineTo(cx, bottom - h);
  ctx.lineTo(cx + w / 4, bottom - h * 0.25);
  ctx.lineTo(cx + w / 2, bottom - h * 0.55);
  ctx.lineTo(cx + w / 2, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, f: Fonts) {
  ctx.font = `700 26px ${f.sans}`;
  spaced(ctx, 3);
  const w = ctx.measureText(text).width + 44;
  ctx.fillStyle = C.sun;
  roundRect(ctx, x, y, w, 52, 26);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 22, y + 27);
  spaced(ctx, 0);
}

function headlineSize(ctx: CanvasRenderingContext2D, text: string, f: Fonts) {
  let size = 190;
  ctx.font = `${size}px ${f.display}`;
  while (ctx.measureText(text.toUpperCase()).width > CARD_W - PAD * 2 && size > 90) ctx.font = `${(size -= 8)}px ${f.display}`;
  return size;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Letter spacing where the browser supports it (Chrome, Safari 17+); plain text elsewhere. */
function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

/** Truncates with an ellipsis to fit `max` px in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
