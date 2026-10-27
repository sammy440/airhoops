import { contrastOn, shade, type Avatar } from "./avatar";

/**
 * Draws a customizable basketball player (body, skin, hair, kit) onto a 2D
 * canvas. Pure: the game, the profile preview and avatar badges all use it.
 *
 * `pts` are joints in world meters (y up), keyed by MediaPipe landmark index
 * (0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips).
 */

export interface Vec {
  x: number;
  y: number;
}

/** Natural set-shot pose (world meters), used for any joint the camera can't see. */
export const DEFAULT_POSE: Record<number, Vec> = {
  0: { x: -0.3, y: 1.74 },
  11: { x: -0.42, y: 1.5 },
  12: { x: -0.18, y: 1.5 },
  13: { x: -0.37, y: 1.78 },
  14: { x: -0.05, y: 1.72 },
  15: { x: -0.1, y: 2.04 },
  16: { x: 0.08, y: 2.0 },
  23: { x: -0.4, y: 0.95 },
  24: { x: -0.2, y: 0.95 },
};

/** Relaxed stance, arms at the sides (profile preview, badges). */
export const STANDING_POSE: Record<number, Vec> = {
  0: { x: 0, y: 1.72 },
  11: { x: -0.16, y: 1.48 },
  12: { x: 0.16, y: 1.48 },
  13: { x: -0.22, y: 1.2 },
  14: { x: 0.22, y: 1.2 },
  15: { x: -0.24, y: 0.94 },
  16: { x: 0.24, y: 0.94 },
  23: { x: -0.11, y: 0.95 },
  24: { x: 0.11, y: 0.95 },
};

export interface PlayerView {
  /** World → screen */
  X: (x: number) => number;
  Y: (y: number) => number;
  /** Pixels per meter */
  s: number;
  font: string;
  /** Arena rim light; off for flat UI previews */
  glow?: boolean;
}

export function drawPlayer(ctx: CanvasRenderingContext2D, pts: Record<number, Vec>, look: Avatar, view: PlayerView) {
  const { X, Y, s } = view;
  const female = look.gender === "female";
  const skin = look.skin;
  const skinLight = shade(skin, 0.18);
  const glow = view.glow ?? true;
  const GLOW = 16;
  const P = (v: Vec) => [X(v.x), Y(v.y)] as const;
  const add = (v: Vec, dx: number, dy: number): Vec => ({ x: v.x + dx, y: v.y + dy });
  const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const setGlow = (on: boolean) => (ctx.shadowBlur = glow && on ? GLOW : 0);

  const limb = (a: Vec, b: Vec, width: number, color: string, shine = skinLight) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * s;
    ctx.beginPath();
    ctx.moveTo(...P(a));
    ctx.lineTo(...P(b));
    ctx.stroke();
    // Highlight along the lit edge gives the limb some volume.
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shine;
    ctx.lineWidth = width * s * 0.28;
    ctx.beginPath();
    ctx.moveTo(...P(add(a, width * 0.22, width * 0.12)));
    ctx.lineTo(...P(add(b, width * 0.22, width * 0.12)));
    ctx.stroke();
    ctx.restore();
  };

  // Hips: keep a believable stance even if the camera squeezes them together.
  const hipHalf = female ? 0.11 : 0.1;
  let hipL = pts[23];
  let hipR = pts[24];
  const hipMid = mid(hipL, hipR);
  if (Math.abs(hipR.x - hipL.x) < hipHalf * 2) {
    hipL = { x: hipMid.x - hipHalf, y: hipMid.y };
    hipR = { x: hipMid.x + hipHalf, y: hipMid.y };
  }
  const hipY = Math.max(0.75, Math.min(1.15, hipMid.y));
  hipL = { ...hipL, y: hipY };
  hipR = { ...hipR, y: hipY };
  const kneeL = { x: hipL.x - 0.04, y: hipY * 0.5 };
  const kneeR = { x: hipR.x + 0.06, y: hipY * 0.5 };
  const ankleL = { x: hipL.x - 0.08, y: 0.1 };
  const ankleR = { x: hipR.x + 0.1, y: 0.1 };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(246,161,58,0.45)";
  setGlow(true);

  const thigh = female ? 0.14 : 0.15;
  limb(hipL, kneeL, thigh, skin);
  limb(kneeL, ankleL, 0.11, skin);
  limb(hipR, kneeR, thigh, skin);
  limb(kneeR, ankleR, 0.11, skin);
  for (const [ankle, dir] of [[ankleL, -1], [ankleR, 1]] as const) {
    ctx.fillStyle = look.shoes;
    ctx.beginPath();
    ctx.ellipse(X(ankle.x + dir * 0.05), Y(0.055), 0.14 * s, 0.06 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.jersey;
    ctx.fillRect(X(ankle.x + dir * 0.05) - 0.12 * s, Y(0.03), 0.24 * s, 0.025 * s);
  }

  // Shorts (trousers): slightly wider at the hip for the female body.
  const flare = female ? 0.02 : 0;
  const waistL = add(hipL, -0.05 - flare, 0.08);
  const waistR = add(hipR, 0.05 + flare, 0.08);
  ctx.fillStyle = look.shorts;
  ctx.beginPath();
  ctx.moveTo(...P(waistL));
  ctx.lineTo(...P(waistR));
  ctx.lineTo(...P(add(kneeR, 0.1 + flare, 0.18)));
  ctx.lineTo(...P(add(kneeR, -0.08, 0.16)));
  ctx.lineTo(...P({ x: hipMid.x, y: hipY - 0.12 }));
  ctx.lineTo(...P(add(kneeL, 0.08, 0.16)));
  ctx.lineTo(...P(add(kneeL, -0.1 - flare, 0.18)));
  ctx.closePath();
  ctx.fill();
  setGlow(false);
  ctx.strokeStyle = look.jersey === look.shorts ? shade(look.jersey, 0.5) : look.jersey;
  ctx.lineWidth = Math.max(1.5, 0.02 * s);
  ctx.beginPath();
  // Side stripes stay inside the shorts' outer seam.
  ctx.moveTo(...P(add(waistL, 0.025, -0.02)));
  ctx.lineTo(...P(add(kneeL, -0.075 - flare, 0.19)));
  ctx.moveTo(...P(add(waistR, -0.025, -0.02)));
  ctx.lineTo(...P(add(kneeR, 0.075 + flare, 0.19)));
  ctx.stroke();
  setGlow(true);

  // Neck (under the jersey collar)
  const sL = pts[11];
  const sR = pts[12];
  const sMid = mid(sL, sR);
  const head = pts[0] ? add(pts[0], 0, 0.04) : add(sMid, 0, 0.27);
  limb(sMid, mid(sMid, head), female ? 0.085 : 0.1, skin);

  // Jersey (shirt): sleeveless V-neck; the female cut tapers at the waist.
  const halfW = Math.max(female ? 0.15 : 0.17, Math.abs(sR.x - sL.x) / 2 + (female ? 0.03 : 0.05));
  const tilt = Math.atan2(sR.y - sL.y, sR.x - sL.x);
  const shL = { x: sMid.x - halfW * Math.cos(tilt), y: sMid.y - halfW * Math.sin(tilt) };
  const shR = { x: sMid.x + halfW * Math.cos(tilt), y: sMid.y + halfW * Math.sin(tilt) };
  const taper = female ? 0.035 : 0;
  const waistMid = { x: hipMid.x, y: (sMid.y + hipY) / 2 - 0.02 };
  const jersey = ctx.createLinearGradient(X(sMid.x), Y(sMid.y), X(hipMid.x), Y(hipY));
  jersey.addColorStop(0, shade(look.jersey, 0.18));
  jersey.addColorStop(1, shade(look.jersey, -0.25));
  ctx.fillStyle = jersey;
  ctx.beginPath();
  ctx.moveTo(...P(shL));
  ctx.lineTo(...P(add(sMid, -0.06, 0.02)));
  ctx.lineTo(...P(add(sMid, 0, -0.08)));
  ctx.lineTo(...P(add(sMid, 0.06, 0.02)));
  ctx.lineTo(...P(shR));
  ctx.quadraticCurveTo(...P(add(shR, -0.02, -0.12)), ...P(add(shR, -0.05, -0.17)));
  ctx.quadraticCurveTo(...P({ x: waistMid.x + halfW - 0.05 - taper, y: waistMid.y }), ...P(add(waistR, -0.01, 0.02)));
  ctx.lineTo(...P(add(waistL, 0.01, 0.02)));
  ctx.quadraticCurveTo(...P({ x: waistMid.x - halfW + 0.05 + taper, y: waistMid.y }), ...P(add(shL, 0.05, -0.17)));
  ctx.quadraticCurveTo(...P(add(shL, 0.02, -0.12)), ...P(shL));
  ctx.closePath();
  ctx.fill();
  setGlow(false);
  const ink = contrastOn(look.jersey);
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.5, 0.018 * s);
  ctx.beginPath();
  ctx.moveTo(...P(add(sMid, -0.06, 0.02)));
  ctx.lineTo(...P(add(sMid, 0, -0.08)));
  ctx.lineTo(...P(add(sMid, 0.06, 0.02)));
  ctx.stroke();
  const chest = mid(sMid, { x: hipMid.x, y: hipY });
  ctx.save();
  ctx.translate(...P(add(chest, 0, 0.04)));
  ctx.rotate(-tilt);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(0.17 * s)}px ${view.font}`;
  ctx.fillText(String(look.number), 0, 0);
  ctx.restore();
  setGlow(true);

  drawHead(ctx, X(head.x), Y(head.y), s, look, skinLight, glow);

  // Arms last, so raised arms read in front of the body.
  for (const [sh, el, wr] of [[11, 13, 15], [12, 14, 16]] as const) {
    const shoulder = pts[sh];
    const elbow = pts[el];
    const wrist = pts[wr];
    limb(shoulder, elbow, female ? 0.095 : 0.105, skin);
    limb(elbow, wrist, female ? 0.078 : 0.085, skin);
    // Hand: a little past the wrist along the forearm.
    const dx = wrist.x - elbow.x;
    const dy = wrist.y - elbow.y;
    const len = Math.hypot(dx, dy) || 1;
    const hand = add(wrist, (dx / len) * 0.05, (dy / len) * 0.05);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(...P(hand), (female ? 0.05 : 0.055) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = look.jersey;
    ctx.lineWidth = 0.09 * s;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(...P(add(wrist, (-dx / len) * 0.03, (-dy / len) * 0.03)));
    ctx.lineTo(...P(add(wrist, (-dx / len) * 0.08, (-dy / len) * 0.08)));
    ctx.stroke();
    ctx.lineCap = "round";
  }
  ctx.restore();
}

/** Head with ears, face shading, hair style and a headband in the kit colour. */
function drawHead(ctx: CanvasRenderingContext2D, hx: number, hy: number, s: number, look: Avatar, skinLight: string, glow: boolean) {
  const female = look.gender === "female";
  const rx = (female ? 0.094 : 0.1) * s;
  const ry = (female ? 0.12 : 0.125) * s;
  const hair = look.hairColor;

  // Hair that sits *behind* the head.
  ctx.fillStyle = hair;
  if (look.hair === "afro") {
    ctx.beginPath();
    ctx.arc(hx, hy - 0.035 * s, 0.155 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hair === "ponytail") {
    ctx.beginPath();
    ctx.ellipse(hx + 0.12 * s, hy + 0.04 * s, 0.045 * s, 0.11 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hair === "braids") {
    ctx.strokeStyle = hair;
    ctx.lineWidth = 0.028 * s;
    for (const dx of [-0.085, -0.06, 0.06, 0.085]) {
      ctx.beginPath();
      ctx.moveTo(hx + dx * s, hy - 0.02 * s);
      ctx.lineTo(hx + dx * 1.25 * s, hy + 0.17 * s);
      ctx.stroke();
    }
  }

  ctx.fillStyle = look.skin;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(hx + dir * rx, hy + 0.01 * s, 0.024 * s, 0.038 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const face = ctx.createRadialGradient(hx + 0.03 * s, hy - 0.04 * s, 0.01 * s, hx, hy, 0.13 * s);
  face.addColorStop(0, skinLight);
  face.addColorStop(1, look.skin);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Hair cap on top of the head (every style except bald).
  if (look.hair !== "bald") {
    ctx.fillStyle = hair;
    ctx.beginPath();
    const capH = look.hair === "afro" ? 0.12 : look.hair === "short" ? 0.095 : 0.105;
    ctx.ellipse(hx, hy - 0.03 * s, rx * 1.06, capH * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (look.hair === "bun") {
      ctx.beginPath();
      ctx.arc(hx, hy - 0.15 * s, 0.05 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // A little shine so a bald head still reads as a head.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(hx + 0.025 * s, hy - 0.07 * s, 0.035 * s, 0.018 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = look.jersey;
  ctx.fillRect(hx - rx * 1.05, hy - 0.04 * s, rx * 2.1, 0.03 * s);
  if (glow) ctx.shadowBlur = 16;
}
