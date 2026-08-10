import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

test("sign-in screen renders for anonymous visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByPlaceholder("you@email.com")).toBeVisible();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});

test("login routes to the authenticated dashboard", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  await expect(page.getByRole("link", { name: /wallets/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /settings/i })).toBeVisible();
  await expect(page.getByPlaceholder("you@email.com")).toHaveCount(0);
});
