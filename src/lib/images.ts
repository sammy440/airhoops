// Static imports: Next.js gives each file a content-hashed URL (so replacing a
// file busts every cache) plus a blur placeholder and intrinsic size.
// All photos are from Unsplash under the free Unsplash License (no Unsplash+).
import type { StaticImageData } from "next/image";
import basketball from "../../public/basketball.jpg";
import stepFrame from "../../public/images/step-frame.jpg";
import stepScoop from "../../public/images/step-scoop.jpg";
import stepLoad from "../../public/images/step-load.jpg";
import stepFly from "../../public/images/step-fly.jpg";
import stepSwish from "../../public/images/step-swish.jpg";
import airDunk from "../../public/images/air-dunk.jpg";
import jumpLeap from "../../public/images/jump-leap.jpg";
import sunsetHoop from "../../public/images/sunset-hoop.jpg";
import enjoyGame from "../../public/images/enjoy-game.jpg";
import modeFree from "../../public/images/mode-free.jpg";
import modeTimed from "../../public/images/mode-timed.jpg";
import modeKing from "../../public/images/mode-king.jpg";
import mode1v1 from "../../public/images/mode-1v1.jpg";
import modeRace from "../../public/images/mode-race.jpg";

export interface Photo {
  src: StaticImageData;
  alt: string;
  /** CSS object-position, so the subject survives tight crops */
  position?: string;
  /** Unsplash page, for credits */
  credit: string;
}

const u = (id: string) => `https://unsplash.com/photos/${id}`;

export const HERO_IMAGE = basketball;

export const PHOTOS = {
  hero: { src: basketball, alt: "Basketball dropping through the net under arena lights", credit: u("BfphcCvhl6E") },
  stepFrame: { src: stepFrame, alt: "Player standing on an outdoor court holding a basketball", position: "50% 40%", credit: u("YDrqAcHEP_k") },
  stepScoop: { src: stepScoop, alt: "Silhouette of a player dribbling low in a gym", position: "45% 50%", credit: u("23ZL8GbiK0g") },
  stepLoad: { src: stepLoad, alt: "Player raising the ball overhead before a shot", position: "50% 25%", credit: u("Q_C-fJ34wpM") },
  stepFly: { src: stepFly, alt: "Silhouette of a player shooting toward a hoop at dusk", position: "35% 50%", credit: u("KnI5ms7Ysso") },
  stepSwish: { src: stepSwish, alt: "Basketball dropping through the net, seen from below", position: "50% 35%", credit: u("2maOD5762rk") },
  airDunk: { src: airDunk, alt: "Player soaring toward the rim for a dunk", position: "60% 35%", credit: u("o_8LV06JioI") },
  jumpLeap: { src: jumpLeap, alt: "Player leaping for the ball on a gym court", position: "50% 30%", credit: u("S_uecFPwOGo") },
  sunsetHoop: { src: sunsetHoop, alt: "Hoop silhouetted against a sunset", position: "50% 50%", credit: u("cX05Cn9EQoQ") },
  enjoyGame: { src: enjoyGame, alt: "Young player holding a basketball, jersey reading Enjoy the Game", position: "50% 30%", credit: u("Vxj2b74ruQg") },
  modeFree: { src: modeFree, alt: "Player shooting on an outdoor court", position: "20% 50%", credit: u("7Hka6LbpN1k") },
  modeTimed: { src: modeTimed, alt: "Arena game with the scoreboard lit up", position: "55% 40%", credit: u("bQ1HhXgdH6U") },
  modeKing: { src: modeKing, alt: "Player dunking in front of a packed crowd", position: "50% 30%", credit: u("VE2XViFNOP4") },
  mode1v1: { src: mode1v1, alt: "Two players battling one-on-one", position: "50% 40%", credit: u("d0zj6Vv3n80") },
  modeRace: { src: modeRace, alt: "Players driving to the basket mid-game", position: "45% 40%", credit: u("h9teyHyKvds") },
} satisfies Record<string, Photo>;

export type PhotoKey = keyof typeof PHOTOS;
