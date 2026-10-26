/**
 * Exports physics/scoring fixtures for the backend's parity test
 * (airhoops-backend/tests/test_physics_parity.py). Run after changing physics,
 * shot mapping, difficulty or scoring:
 *
 *   GEN_PARITY=1 npx vitest run src/lib/game/parity.gen.test.ts
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { courtFor, DIFFICULTIES, DIFFICULTY_ORDER } from "./difficulty";
import { simulateShot } from "./physics";
import { scoreShot } from "./scoring";
import { throwToLaunch } from "./shot";

const OUT = new URL("../../../../airhoops-backend/tests/fixtures/physics_parity.json", import.meta.url);

it.runIf(process.env.GEN_PARITY)("writes physics parity fixtures", () => {
  const cases = [];
  for (const difficulty of DIFFICULTY_ORDER) {
    const d = DIFFICULTIES[difficulty];
    const court = courtFor(d);
    for (const power of [0.1, 0.25, 0.3, 0.33, 0.36, 0.4, 0.5, 0.65, 0.8, 1]) {
      for (const [angle, arc] of [[30, 0.7], [10, 0.4], [55, 0.95], [-20, 0.2]]) {
        for (const [wind, phase] of [[0, 0], [d.windMax, 1.7], [-d.windMax, 3.25]]) {
          const launch = throwToLaunch({ power, angle, arc });
          const sim = simulateShot(launch, court, { wind, phase });
          cases.push({
            input: { difficulty, power, angle, arc, wind, phase },
            launch,
            result: sim.result,
            duration: sim.duration,
            events: sim.events.map((e) => ({ t: e.t, type: e.type })),
            pathLength: sim.path.length,
            path: sim.path.filter((_, i) => i % 15 === 0),
            points: [0, 4, 11].map((streak) => scoreShot(sim.result, streak, d.scoreMultiplier).points),
          });
        }
      }
    }
  }
  writeFileSync(OUT, JSON.stringify({ generatedBy: "airhoops-frontend/src/lib/game/parity.gen.test.ts", cases }));
  console.log(`wrote ${cases.length} cases`);
});
