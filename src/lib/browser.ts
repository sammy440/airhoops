/** Saves `data` as a pretty-printed JSON file via a temporary link. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let audio: AudioContext | null = null;

/**
 * Short UI beep, so the player can hear countdowns and record start/stop
 * while standing away from the screen. Silently no-ops if audio is blocked.
 */
export function beep(freq = 880, ms = 120, volume = 0.15) {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    const now = audio.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + ms / 1000);
  } catch {
    // Audio unavailable; visual cues still work.
  }
}
