import { describe, expect, it } from "vitest";

import { passwordErrorKey, validatePasswordChange } from "@/lib/password-change";

describe("change password validation", () => {
  it("requires every field", () => {
    expect(validatePasswordChange({ current: "", next: "", confirm: "" })).toBe("cp.required");
    expect(validatePasswordChange({ current: "old", next: "newpass1", confirm: "" })).toBe(
      "cp.required",
    );
  });

  it("enforces a minimum length of 8 characters", () => {
    expect(validatePasswordChange({ current: "oldpass1", next: "short", confirm: "short" })).toBe(
      "cp.tooShort",
    );
  });

  it("rejects a mismatched confirmation", () => {
    expect(
      validatePasswordChange({ current: "oldpass1", next: "newpass12", confirm: "newpass13" }),
    ).toBe("cp.mismatch");
  });

  it("rejects reusing the current password", () => {
    expect(
      validatePasswordChange({ current: "samepass1", next: "samepass1", confirm: "samepass1" }),
    ).toBe("cp.sameAsOld");
  });

  it("accepts a valid change", () => {
    expect(
      validatePasswordChange({ current: "oldpass1", next: "newpass12", confirm: "newpass12" }),
    ).toBeNull();
  });

  it("maps re-authentication failures to a wrong-current-password message", () => {
    expect(passwordErrorKey("Invalid login credentials")).toBe("cp.wrongCurrent");
    expect(passwordErrorKey("Network request failed")).toBe("cp.error");
    expect(passwordErrorKey(undefined)).toBe("cp.error");
  });
});
