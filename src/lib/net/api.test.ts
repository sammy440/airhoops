import { describe, expect, it } from "vitest";
import { extractRoomCode } from "./api";

describe("extractRoomCode", () => {
  it("accepts typed codes in any case", () => {
    expect(extractRoomCode("abcde")).toBe("ABCDE");
    expect(extractRoomCode(" ab c")).toBe("ABC");
  });

  it("pulls the code out of a pasted invite link", () => {
    expect(extractRoomCode("http://localhost:3000/multiplayer?room=Q4Z23")).toBe("Q4Z23");
    expect(extractRoomCode("https://airhoops.app/multiplayer?foo=1&room=ve9xq#x")).toBe("VE9XQ");
  });

  it("finds a code inside a chat message", () => {
    expect(extractRoomCode("Join my room: Z85SP !")).toBe("Z85SP");
  });

  it("never returns more than 5 characters", () => {
    expect(extractRoomCode("ABCDEFGHIJ").length).toBe(5);
  });
});
