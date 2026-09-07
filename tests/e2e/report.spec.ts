import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("opens the report prototype without implying data was collected", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("link", { name: "Explore the report prototype" })
    .click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "AI visibility report",
  );
  await expect(page.getByText("Company not selected")).toBeVisible();
  await expect(page.getByText("Not generated")).toBeVisible();
  await expect(
    page.getByText("Query templates only. None have been executed."),
  ).toBeVisible();
  await expect(page.getByText("No observations collected yet.")).toBeVisible();
  await expect(page.getByText("No citations recorded yet.")).toBeVisible();
  await expect(
    page.getByText("No interpretations available yet."),
  ).toBeVisible();
  await expect(
    page.getByText("No evidence-based actions available yet."),
  ).toBeVisible();
  const metrics = page.getByRole("table", { name: "Visibility metrics" });
  await expect(
    metrics.getByRole("cell", { name: "Not measured", exact: true }),
  ).toHaveCount(5);
  await expect(metrics).not.toContainText(/\d+(?:\.\d+)?%/);
  await expect(page.locator("time")).toHaveCount(0);
  await expect(page.locator('main a[href^="http"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Back to product preview" }).click();
  await expect(page.getByText("No observations collected")).toBeVisible();
  expect(errors).toEqual([]);
});

test("report supports keyboard navigation, reflow, and automated accessibility", async ({
  page,
}, testInfo) => {
  await page.goto("/report");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to report" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Company", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#company$/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("report.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("report-narrow.png"),
    fullPage: true,
  });
});
