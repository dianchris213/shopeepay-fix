import { afterEach, describe, expect, it, vi } from "vitest";

import { describeAuthError, describeDataError } from "@/lib/error-messages";

describe("friendly network errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not claim the user is offline for an online fetch failure", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    expect(describeAuthError(new TypeError("Failed to fetch"), "en").title).toBe("Sign-in failed");
    expect(describeDataError(new TypeError("Failed to fetch"), "en").title).toBe(
      "Something went wrong",
    );
  });

  it("shows the offline message only when the browser reports offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    expect(describeAuthError(new TypeError("Failed to fetch"), "en").title).toBe(
      "You appear to be offline",
    );
    expect(describeDataError(new Error("Unexpected response"), "en").title).toBe(
      "You appear to be offline",
    );
  });
});
