import { describe, expect, it } from "vitest";
import { highlightFor, MAX_HIGHLIGHTS, roomForHighlight } from "./highlights";

const shot = { scored: true, swish: false, at: 10, streak: 1 };

describe("auto-highlights", () => {
  it("picks the moments worth keeping, best reason first", () => {
    expect(highlightFor({ ...shot, scored: false, at: 59.5, seconds: 60 })).toBeNull();
    expect(highlightFor(shot)).toBeNull();
    expect(highlightFor({ ...shot, at: 59.5, seconds: 60, green: true, swish: true })).toBe("Buzzer beater");
    expect(highlightFor({ ...shot, green: true, swish: true })).toBe("Green swish");
    expect(highlightFor({ ...shot, green: true })).toBeNull(); // green rim but not a swish
    expect(highlightFor({ ...shot, streak: 10, clutch: true })).toBe("10 in a row");
    expect(highlightFor({ ...shot, streak: 11 })).toBeNull();
    expect(highlightFor({ ...shot, clutch: true, swish: true })).toBe("Clutch swish");
    expect(highlightFor({ ...shot, clutch: true })).toBe("Clutch bucket");
  });

  it("keeps highlights apart and few", () => {
    expect(roomForHighlight([{ at: 10 }], 12)).toBe(false);
    expect(roomForHighlight([{ at: 10 }], 13)).toBe(true);
    expect(roomForHighlight(Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => ({ at: i * 10 })), 100)).toBe(false);
  });
});
