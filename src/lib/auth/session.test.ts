import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

describe("anonymous session boundary", () => {
  it("accepts a correctly signed session", () => { const id = "4b672ced-c2a9-4bd9-9744-b72d4dc2d201"; expect(verifySession(signSession(id))).toBe(id); });
  it("rejects tampering", () => expect(verifySession(`${signSession("owner-a")}x`)).toBeNull());
});
