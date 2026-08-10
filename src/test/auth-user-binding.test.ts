import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => getUser() } },
}));
vi.mock("@/lib/session-refresh", () => ({
  ensureFreshSession: vi.fn(async () => ({ state: "fresh" })),
}));

import {
  AuthRequiredError,
  isMissingAuthUserError,
  notifyReauthRequired,
  requireAuthUserId,
  resetReauthNotice,
} from "@/lib/auth-user";
import { clearToasts, getToasts } from "@/lib/toast-store";

describe("auth user binding", () => {
  beforeEach(() => {
    getUser.mockReset();
    resetReauthNotice();
    clearToasts();
  });

  it("returns the live authenticated user id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await expect(requireAuthUserId()).resolves.toBe("user-1");
  });

  it("never yields an empty owner id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "" } }, error: null });
    await expect(requireAuthUserId()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("asks the user to re-authenticate when the session is gone", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAuthUserId()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(getToasts().length).toBe(1);
  });

  it("recognises the categories foreign-key violation", () => {
    expect(
      isMissingAuthUserError({
        code: "23503",
        message: 'insert or update on table "categories" violates foreign key constraint',
        details: 'Key (user_id)=(x) is not present in table "users".',
      }),
    ).toBe(true);
    expect(isMissingAuthUserError({ message: "network error" })).toBe(false);
  });

  it("throttles repeated re-auth notices", () => {
    expect(notifyReauthRequired(1_000)).toBe(true);
    expect(notifyReauthRequired(2_000)).toBe(false);
    expect(notifyReauthRequired(60_000)).toBe(true);
  });
});
