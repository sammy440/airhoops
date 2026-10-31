import type { Side } from "@/lib/pose/kinematics";
import type { Court } from "./physics";
import { drawScenery } from "./courts";
import { DEFAULT_POSE, drawPlayer, type Vec } from "./drawPlayer";
import { COLORS as C, GameCore, type GameCallbacks, type Vec3 } from "./engine";

export type { GameCallbacks, GamePhase } from "./engine";

/**
 * 2D canvas renderer (side view): the court seen from the side, x = toward the hoop.
 * Kept as the fallback for devices without WebGL; game logic lives in GameCore.
 *
 * The side view can't show anything sideways (aim, crosswind, the hoop sliding), so
 * z is ignored here.
 */
export class Game extends GameCore {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /** Static scenery + floor, re-rendered only on resize / court / theme change. */
  private bg: HTMLCanvasElement | null = null;
  private font = "Impact, sans-serif";

  constructor(
    private canvas: HTMLCanvasElement,
    cb: GameCallbacks = {},
    court?: Court,
  ) {
    super(cb, court);
    this.ctx = canvas.getContext("2d")!;
    const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    if (display) this.font = display;
  }

  resize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1) {
    this.w = cssW;
    this.h = cssH;
    // Cap DPR: 3× phones would triple fill cost for no visible gain.
    this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.bg = null;
  }

  protected sceneChanged() {
    this.bg = null;
  }

  protected render() {
    this.draw();
  }

  // ── World ↔ screen ──

  private get hoopX() {
    return this.court.hoopDistance;
  }

  private get boardX() {
    return this.hoopX + this.court.rimRadius + this.court.boardGap;
  }

  /** Board position at rest: frames the camera so a moving hoop doesn't move the view. */
  private get restBoardX() {
    return this.court.hoopDistance + this.court.rimRadius + this.court.boardGap + (this.court.hoopMotion?.amplitude ?? 0);
  }

  private view() {
    // Portrait screens get a tighter crop so the court isn't tiny.
    const portrait = this.h > this.w;
    const inset = this.leftInset;
    const avail = this.w - inset;
    const left = portrait || inset ? -0.9 : -1.9;
    const right = this.restBoardX + (portrait ? 0.75 : 1.5);
    const top = portrait ? 4.6 : 5.3;
    const floorY = this.h * (portrait ? 0.72 : 0.86);
    const s = Math.min(avail / (right - left), floorY / top);
    const ox = inset + (avail - (right - left) * s) / 2 - left * s;
    return { s, ox, floorY };
  }

  private X(x: number) {
    const v = this.view();
    return v.ox + x * v.s;
  }

  private Y(y: number) {
    const v = this.view();
    return v.floorY - y * v.s;
  }

  /** Where the hands are (midpoint of wrists); the ball sits there until released. */
  protected handsWorld(): Vec3 {
    const fallback = { x: 0, y: this.court.releaseHeight, z: 0 };
    if (!this.pose) return fallback;
    const { pts } = this.avatar();
    const x = (pts[15].x + pts[16].x) / 2;
    const y = (pts[15].y + pts[16].y) / 2;
    // Keep the ball near the release point so the launch blend stays short.
    return { x: Math.max(-0.6, Math.min(0.4, x)), y: Math.max(1.2, Math.min(2.6, y)), z: 0 };
  }

  protected wristWorld(hand: Side): Vec3 | null {
    const { pts, live } = this.avatar();
    if (!live) return null;
    const w = pts[hand === "left" ? 15 : 16];
    return { x: w.x, y: w.y, z: 0 };
  }

  /**
   * Player joints in world space. Live pose is mapped mirror-style (torso
   * length → 0.55 m, shoulders anchored by the shooting spot); any joint the
   * camera can't see falls back to a natural set-shot pose.
   */
  private avatar(): { pts: Record<number, Vec>; live: boolean } {
    const p = this.pose;
    const pts: Record<number, Vec> = { ...DEFAULT_POSE };
    if (!p) return { pts, live: false };
    const ls = p[11];
    const rs = p[12];
    const lh = p[23];
    const rh = p[24];
    if (!ls || !rs || (ls.visibility ?? 0) < 0.5 || (rs.visibility ?? 0) < 0.5) return { pts, live: false };
    const aspect = 16 / 9;
    const sx = (ls.x + rs.x) / 2;
    const sy = (ls.y + rs.y) / 2;
    const hipsOk = lh && rh && (lh.visibility ?? 0) > 0.4 && (rh.visibility ?? 0) > 0.4;
    const torso = hipsOk ? Math.hypot(((lh.x + rh.x) / 2 - sx) * aspect, (lh.y + rh.y) / 2 - sy) : 0;
    const k = 0.55 / (torso || 0.3);
    const anchor = { x: -0.3, y: 1.5 };
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
      const lm = p[i];
      if (!lm || (lm.visibility ?? 0) < 0.4) continue;
      // Mirror x (feels like a mirror), flip y (world is y-up).
      pts[i] = { x: anchor.x - (lm.x - sx) * aspect * k, y: anchor.y - (lm.y - sy) * k };
    }
    if (!hipsOk) {
      pts[23] = { x: pts[11].x + 0.03, y: pts[11].y - 0.55 };
      pts[24] = { x: pts[12].x - 0.03, y: pts[12].y - 0.55 };
    }
    return { pts, live: true };
  }

  // ── Draw ──

  private draw() {
    const { ctx, w, dpr } = this;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { s, floorY } = this.view();

    if (!this.bg) this.bg = this.renderBackground();
    ctx.drawImage(this.bg, 0, 0, w, this.h);
    this.drawSpotlight(s);
    this.drawGhost(s);
    this.drawStand(s);
    this.drawRim("back", s);
    this.drawAvatar(s);
    this.drawBallShadow(s, floorY);
    this.drawTrail(s);
    this.drawBall(s);
    this.drawNet(s);
    this.drawRim("front", s);
    this.drawParticles(s);
    this.drawTexts(s);
    if (this.charge !== null && this.phase === "ready") this.drawCharge(s);
  }

  /** Scenery + floor never change during play: draw once into an offscreen canvas. */
  private renderBackground() {
    const off = document.createElement("canvas");
    off.width = Math.round(this.w * this.dpr);
    off.height = Math.round(this.h * this.dpr);
    const ctx = off.getContext("2d")!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { s, floorY } = this.view();
    drawScenery(ctx, this.theme, { w: this.w, h: this.h, floorY, s, X: (x) => this.X(x), hoopDistance: this.court.hoopDistance });
    return off;
  }

  /** Spotlight follows the (possibly moving) hoop, so it's drawn live. */
  private drawSpotlight(s: number) {
    const { ctx, w, h, theme } = this;
    const hx = this.X(this.hoopX);
    const hy = this.Y(this.court.rimHeight + 0.6);
    const spot = ctx.createRadialGradient(hx, hy, 0, hx, hy, 4.2 * s);
    spot.addColorStop(0, `rgba(${theme.spot},${theme.spotAlpha})`);
    spot.addColorStop(1, `rgba(${theme.spot},0)`);
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGhost(s: number) {
    if (!this.ghost || this.phase === "flying") return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = this.theme.ghost;
    ctx.setLineDash([2, s * 0.08]);
    ctx.lineWidth = Math.max(1.5, s * 0.02);
    ctx.lineCap = "round";
    ctx.beginPath();
    this.ghost.forEach(([, x, y], i) => (i ? ctx.lineTo(this.X(x), this.Y(y)) : ctx.moveTo(this.X(x), this.Y(y))));
    ctx.stroke();
    ctx.restore();
  }

  private drawStand(s: number) {
    const { ctx } = this;
    const c = this.court;
    const bx = this.boardX;
    const lo = c.rimHeight + c.boardBottom;
    const hi = c.rimHeight + c.boardTop;
    const poleX = bx + 1.0;
    ctx.fillStyle = this.theme.pole;
    ctx.fillRect(this.X(poleX) - s * 0.07, this.Y(hi - 0.25), s * 0.14, this.Y(0) - this.Y(hi - 0.25));
    ctx.strokeStyle = this.theme.arm;
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(this.X(poleX), this.Y(hi - 0.3));
    ctx.lineTo(this.X(bx + 0.2), this.Y((lo + hi) / 2));
    ctx.stroke();
    ctx.fillStyle = C.hoop;
    ctx.fillRect(this.X(poleX) - s * 0.12, this.Y(1.1), s * 0.24, this.Y(0) - this.Y(1.1));

    // Wind pennant on top of the pole: points downwind, longer when stronger.
    const top = { x: poleX, y: hi + 0.35 };
    ctx.strokeStyle = "#2b2b2a";
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(this.X(poleX), this.Y(hi - 0.25));
    ctx.lineTo(this.X(top.x), this.Y(top.y));
    ctx.stroke();
    const strength = Math.min(1, Math.abs(this.wind) / 1.2);
    const dir = this.wind === 0 ? 0 : Math.sign(this.wind);
    const flap = Math.sin(this.now / (90 - strength * 40)) * 0.03 * (0.3 + strength);
    const len = 0.12 + strength * 0.3;
    const tipX = dir ? top.x + dir * len : top.x + 0.04;
    const tipY = dir ? top.y - 0.06 + flap : top.y - 0.22;
    ctx.fillStyle = this.wind === 0 ? "rgba(247,241,214,0.35)" : C.sun;
    ctx.beginPath();
    ctx.moveTo(this.X(top.x), this.Y(top.y));
    ctx.lineTo(this.X(tipX), this.Y(tipY));
    ctx.lineTo(this.X(top.x), this.Y(top.y - 0.12));
    ctx.closePath();
    ctx.fill();

    // Glass backboard as a slab seen slightly from the front.
    const depth = { x: 0.32, y: 0.1 };
    ctx.beginPath();
    ctx.moveTo(this.X(bx), this.Y(lo));
    ctx.lineTo(this.X(bx), this.Y(hi));
    ctx.lineTo(this.X(bx + depth.x), this.Y(hi + depth.y));
    ctx.lineTo(this.X(bx + depth.x), this.Y(lo + depth.y));
    ctx.closePath();
    ctx.fillStyle = this.theme.glassFill;
    ctx.fill();
    ctx.strokeStyle = this.theme.glass;
    ctx.lineWidth = Math.max(1.5, s * 0.02);
    ctx.stroke();
    const sq = (u: number, v: number) => [this.X(bx + depth.x * u), this.Y(lo + (hi - lo) * v + depth.y * u)] as const;
    ctx.strokeStyle = C.hoop;
    ctx.lineWidth = Math.max(1.5, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(...sq(0.3, 0.12));
    ctx.lineTo(...sq(0.3, 0.55));
    ctx.lineTo(...sq(0.7, 0.55));
    ctx.lineTo(...sq(0.7, 0.12));
    ctx.stroke();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(this.X(bx), this.Y(c.rimHeight - 0.05));
    ctx.lineTo(this.X(this.hoopX + c.rimRadius), this.Y(c.rimHeight));
    ctx.stroke();
  }

  private rimEllipse(s: number) {
    const c = this.court;
    return { cx: this.X(this.hoopX), cy: this.Y(c.rimHeight), rx: c.rimRadius * s, ry: c.rimRadius * s * 0.28 };
  }

  private drawRim(half: "back" | "front", s: number) {
    const { ctx } = this;
    const e = this.rimEllipse(s);
    ctx.strokeStyle = half === "front" ? C.hoop : "#a3260f";
    ctx.lineWidth = Math.max(2.5, s * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (half === "back") ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, Math.PI, Math.PI * 2);
    else ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
    ctx.stroke();
  }

  private drawNet(s: number) {
    const { ctx } = this;
    const e = this.rimEllipse(s);
    const since = (this.now - this.netKickAt) / 1000;
    const kick = this.netKick * Math.exp(-since * 3.2);
    const sway = Math.sin(since * 16) * kick;
    const depth = 0.42 * s * (1 + kick * 0.35);
    const n = 9;
    const top: [number, number][] = [];
    const mid: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i / (n - 1));
      const cx = Math.cos(a);
      top.push([e.cx + cx * e.rx, e.cy + Math.sin(a) * e.ry]);
      mid.push([e.cx + cx * e.rx * 0.8 + sway * s * 0.06, e.cy + depth * 0.5 + Math.sin(a) * e.ry * 0.7]);
      bot.push([e.cx + cx * e.rx * 0.58 + sway * s * 0.1, e.cy + depth + Math.sin(a) * e.ry * 0.5]);
    }
    ctx.strokeStyle = this.theme.net;
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, i + 1);
      const k = Math.max(0, i - 1);
      ctx.moveTo(...top[i]);
      ctx.lineTo(...mid[j]);
      ctx.moveTo(...top[i]);
      ctx.lineTo(...mid[k]);
      ctx.moveTo(...mid[i]);
      ctx.lineTo(...bot[j]);
      ctx.moveTo(...mid[i]);
      ctx.lineTo(...bot[k]);
    }
    ctx.stroke();
    ctx.beginPath();
    bot.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  /** The player (look from the profile), upper body following the live pose. */
  private drawAvatar(s: number) {
    drawPlayer(this.ctx, this.avatar().pts, this.look, { X: (x) => this.X(x), Y: (y) => this.Y(y), s, font: this.font });
  }

  private drawBallShadow(s: number, floorY: number) {
    const { ctx } = this;
    const h = Math.max(0, this.ball.y);
    const k = Math.max(0.15, 1 - h / 5);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(this.X(this.ball.x), floorY + 3, this.court.ballRadius * s * (1.4 - k * 0.4), this.court.ballRadius * s * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTrail(s: number) {
    const { ctx } = this;
    const r = this.court.ballRadius * s;
    this.trail.forEach((p, i) => {
      const a = (i / this.trail.length) * 0.22;
      ctx.fillStyle = `rgba(246,161,58,${a})`;
      ctx.beginPath();
      ctx.arc(this.X(p.x), this.Y(p.y), r * (0.4 + (i / this.trail.length) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawBall(s: number) {
    const { ctx } = this;
    const r = Math.max(5, this.court.ballRadius * s);
    const x = this.X(this.ball.x);
    const y = this.Y(this.ball.y);
    if (this.phase === "result" && this.sim?.result.scored === false && this.now - this.respawnAt > -200) {
      ctx.globalAlpha = Math.max(0, (this.respawnAt - this.now) / 200);
    }
    if (this.hot && this.phase === "ready") {
      const flicker = 1 + Math.sin(this.now / 60) * 0.06 + Math.sin(this.now / 23) * 0.04;
      const halo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.4 * flicker);
      halo.addColorStop(0, "rgba(255,120,30,0.55)");
      halo.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.loaded && this.phase === "ready") {
      const pulse = 1 + Math.sin(this.now / 140) * 0.08;
      ctx.strokeStyle = "rgba(255,225,77,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffb070");
    g.addColorStop(0.55, C.ball);
    g.addColorStop(1, "#8f3410");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ball.rot);
    ctx.strokeStyle = "rgba(30,12,4,0.65)";
    ctx.lineWidth = Math.max(1, r * 0.09);
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
    ctx.globalAlpha = 1;
  }

  private drawParticles(s: number) {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(this.X(p.x), this.Y(p.y), p.size * Math.max(1, s / 150), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(s: number) {
    const { ctx } = this;
    for (const t of this.texts) {
      const age = (this.now - t.born) / 1000;
      const a = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.9) / 0.7);
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : 1.1 - Math.min(0.1, (age - 0.15) * 0.2);
      const x = this.X(t.x);
      const y = this.Y(t.y + age * 0.35);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.fillStyle = t.color;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 12;
      ctx.font = `${Math.round(s * 0.42)}px ${this.font}`;
      ctx.fillText(t.text, 0, 0);
      if (t.sub) {
        ctx.font = `${Math.round(s * 0.26)}px ${this.font}`;
        ctx.fillStyle = C.cream;
        ctx.fillText(t.sub, 0, s * 0.3);
      }
      ctx.restore();
    }
  }

  private drawCharge(s: number) {
    const { ctx } = this;
    const x = this.X(this.ball.x);
    const y = this.Y(this.ball.y);
    const r = this.court.ballRadius * s * 2.2;
    ctx.lineWidth = Math.max(3, s * 0.04);
    ctx.strokeStyle = "rgba(247,241,214,0.15)";
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = C.sun;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.charge ?? 0));
    ctx.stroke();
  }
}
