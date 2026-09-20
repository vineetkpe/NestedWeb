import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("shows an honest empty state and lets the reader inspect the methodology", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Every answer needs evidence.",
  );
  await expect(page.getByText("No observations collected")).toBeVisible();
  await page.getByRole("link", { name: "How evidence works" }).click();
  await expect(page).toHaveURL(/#methodology$/);
  await expect(
    page.getByRole("heading", { name: "From observation to insight" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("offers a workspace setup route from the preview page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Set up workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(
    page.getByRole("heading", { name: "Workspace setup" }),
  ).toBeVisible();
});

test("shows the next project setup step on the workspace route", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "Workspace bootstrap" }),
  ).toBeVisible();
  await expect(page.getByLabel("Workspace name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create workspace" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project setup" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load projects" })).toBeVisible();
  await expect(page.getByLabel("Workspace ID", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Client project name")).toBeVisible();
  await expect(page.getByLabel("Tracked website")).toBeVisible();
});

test("supports keyboard navigation and has no automated WCAG AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});

test("serves the security headers and a real 404", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers()["x-powered-by"]).toBeUndefined();
  expect((await request.get("/this-route-does-not-exist")).status()).toBe(404);
});
