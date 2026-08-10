import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAccountDeletion, type DeleteAccountDeps } from "@/lib/delete-account-flow";
import { clearToasts, getToasts } from "@/lib/toast-store";

function makeDeps(overrides: Partial<DeleteAccountDeps> = {}) {
  const deps: DeleteAccountDeps = {
    deleteAccount: vi.fn(async () => ({ ok: true })),
    signOut: vi.fn(async () => undefined),
    clearLocalData: vi.fn(),
    redirect: vi.fn(),
    setBusy: vi.fn(),
    setError: vi.fn(),
    lang: "en",
    ...overrides,
  };
  return deps;
}

describe("Delete Account flow", () => {
  beforeEach(() => {
    clearToasts();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("marks the flow busy before calling the server", async () => {
    const deps = makeDeps();
    await runAccountDeletion(deps, false);
    expect(deps.setBusy).toHaveBeenCalledWith(true);
    expect(deps.setError).toHaveBeenCalledWith(null);
  });

  it("ignores a second submit while a deletion is in flight", async () => {
    const deps = makeDeps();
    const outcome = await runAccountDeletion(deps, true);
    expect(outcome).toEqual({ status: "busy" });
    expect(deps.deleteAccount).not.toHaveBeenCalled();
  });

  it("clears local data, signs out and routes home on success", async () => {
    const deps = makeDeps();
    const outcome = await runAccountDeletion(deps, false);

    expect(outcome).toEqual({ status: "deleted" });
    expect(deps.clearLocalData).toHaveBeenCalledOnce();
    expect(deps.signOut).toHaveBeenCalledOnce();
    expect(deps.redirect).toHaveBeenCalledOnce();
    expect(getToasts()[0]?.tone).toBe("success");
  });

  it("surfaces a friendly banner and stops when the server rejects", async () => {
    const deps = makeDeps({
      deleteAccount: vi.fn(async () => {
        throw new Error("Unauthorized");
      }),
    });

    const outcome = await runAccountDeletion(deps, false);

    expect(outcome.status).toBe("failed");
    expect(deps.setBusy).toHaveBeenLastCalledWith(false);
    expect(deps.redirect).not.toHaveBeenCalled();
    expect(deps.signOut).not.toHaveBeenCalled();

    const banner = getToasts()[0];
    expect(banner?.tone).toBe("error");
    // Never a raw technical string.
    expect(banner?.title).not.toContain("Unauthorized");
    expect(banner?.title?.length).toBeGreaterThan(0);
  });

  it("treats an ok:false response as a failure", async () => {
    const deps = makeDeps({ deleteAccount: vi.fn(async () => ({ ok: false })) });
    const outcome = await runAccountDeletion(deps, false);
    expect(outcome.status).toBe("failed");
    expect(deps.redirect).not.toHaveBeenCalled();
  });

  it("never shows raw JSON error payloads to the user", async () => {
    const deps = makeDeps({
      deleteAccount: vi.fn(async () => {
        throw new Error('{"code":"500","message":"internal error"}');
      }),
    });

    await runAccountDeletion(deps, false);
    const banner = getToasts()[0];
    expect(banner?.title).not.toContain("{");
    expect(banner?.body ?? "").not.toContain("{");
  });

  it("still redirects when local cleanup or sign-out throws", async () => {
    const deps = makeDeps({
      clearLocalData: vi.fn(() => {
        throw new Error("storage blocked");
      }),
      signOut: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    const outcome = await runAccountDeletion(deps, false);
    expect(outcome).toEqual({ status: "deleted" });
    expect(deps.redirect).toHaveBeenCalledOnce();
  });
});
