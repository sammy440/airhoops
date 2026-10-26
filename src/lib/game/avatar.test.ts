import { describe, expect, it } from "vitest";
import { contrastOn, DEFAULT_AVATAR, randomAvatar, sanitizeAvatar, shade, validName } from "./avatar";

describe("sanitizeAvatar", () => {
  it("keeps a valid avatar and normalises hex case", () => {
    const a = { ...DEFAULT_AVATAR, gender: "female", hair: "braids", skin: "#4A2A17", number: 0 };
    expect(sanitizeAvatar(a)).toEqual({ ...a, skin: "#4a2a17" });
  });

  it("replaces anything invalid with defaults", () => {
    const bad = { gender: "robot", skin: "red", hair: "mohawk", jersey: "#12345", number: 100, extra: "<script>" };
    expect(sanitizeAvatar(bad)).toEqual(DEFAULT_AVATAR);
    expect(sanitizeAvatar(null)).toEqual(DEFAULT_AVATAR);
    expect(sanitizeAvatar("nope")).toEqual(DEFAULT_AVATAR);
  });

  it("random avatars are always valid", () => {
    for (let i = 0; i < 50; i++) {
      const a = randomAvatar();
      expect(sanitizeAvatar(a)).toEqual(a);
    }
  });
});

describe("colour helpers", () => {
  it("shades toward white and black", () => {
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 0)).toBe("#808080");
  });

  it("picks a readable number colour", () => {
    expect(contrastOn("#f4f1ea")).toBe("#17110d");
    expect(contrastOn("#17110d")).toBe("#f7f1d6");
  });
});

describe("validName", () => {
  it("matches the server's rules", () => {
    expect(validName("Dayo")).toBe(true);
    expect(validName("  Ade_23  ")).toBe(true);
    expect(validName("Zoë-K.")).toBe(true);
    expect(validName("A")).toBe(false);
    expect(validName("x".repeat(21))).toBe(false);
    expect(validName("<b>hi</b>")).toBe(false);
  });
});
