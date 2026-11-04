/**
 * What's drawn over the court in a clip (the page's HTML HUD isn't part of the canvas):
 * the score top left, the wordmark and site in a corner, and, only if you've turned it on,
 * your camera in a rounded inset.
 */
export interface ClipHud {
  /** Big number, e.g. points or the streak */
  score: string;
  /** Under it, e.g. "POINTS · TIMED 60S" */
  label: string;
  /** Your camera (mirrored like the preview), or null to leave you out */
  camera: HTMLVideoElement | null;
  site: string;
}

export function drawClipOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, hud: ClipHud) {
  const u = Math.min(w, h) / 100; // 1% of the short side
  ctx.save();
  // Score top left, clear of the hoop and the floating "SWISH!" over it
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = u * 1.5;
  ctx.fillStyle = "#f7f1d6";
  ctx.font = `${Math.round(u * 11)}px Impact, "Anton", sans-serif`;
  ctx.fillText(hud.score, u * 4, u * 3);
  ctx.font = `600 ${Math.round(u * 2.6)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(247,241,214,.75)";
  ctx.fillText(hud.label.toUpperCase(), u * 4, u * 15);

  // Wordmark, bottom right
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.font = `italic ${Math.round(u * 6)}px Impact, "Anton", sans-serif`;
  ctx.fillStyle = "#f7f1d6";
  const air = "AIR";
  const hoops = "HOOPS";
  const hoopsW = ctx.measureText(hoops).width;
  ctx.fillStyle = "#ea3a1d";
  ctx.fillText(hoops, w - u * 3, h - u * 5);
  ctx.fillStyle = "#f7f1d6";
  ctx.fillText(air, w - u * 3 - hoopsW, h - u * 5);
  ctx.font = `500 ${Math.round(u * 2.4)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(247,241,214,.7)";
  ctx.fillText(hud.site, w - u * 3, h - u * 2);
  ctx.restore();

  const cam = hud.camera;
  if (cam && cam.readyState >= 2 && cam.videoWidth) {
    const ch = h * 0.28;
    const cw = ch * (cam.videoWidth / cam.videoHeight);
    const x = u * 3;
    const y = h - ch - u * 3;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, u * 2);
    ctx.clip();
    ctx.translate(x + cw, y);
    ctx.scale(-1, 1); // mirrored, like the preview
    ctx.drawImage(cam, 0, 0, cw, ch);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(247,241,214,.5)";
    ctx.lineWidth = Math.max(1, u * 0.4);
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, u * 2);
    ctx.stroke();
    ctx.restore();
  }
}
