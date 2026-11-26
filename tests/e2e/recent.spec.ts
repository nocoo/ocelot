import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { RecentPage, Snapshot } from "../../src/models/contracts";

const origin = "http://127.0.0.1:27049";
const headers = { Origin: origin, "X-Ocelot-Request": "1" };

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/local", { headers, data: { scenario: "healthy" } })).ok()).toBe(
    true,
  );
  for (const repository of ["ocelot-demo/fieldnotes", "ocelot-demo/studio-notes"])
    expect((await request.post("/api/repositories", { headers, data: { repository } })).ok()).toBe(
      true,
    );
});
test.afterEach(async ({ page }) => expect(await page.pageErrors()).toEqual([]));

test("homepage preview and top-right list follow the server's complete ranking and open real articles", async ({
  page,
}) => {
  await page.goto("/?repo=101&note=README.md");
  const preview = page.locator(".recent-preview");
  await expect(preview.getByRole("link")).toHaveCount(5);
  const snapshot: Snapshot = await (
    await page.request.get("/api/repositories/101/snapshot")
  ).json();
  const result: RecentPage = await (
    await page.request.get(`/api/repositories/101/recent?commit=${snapshot.commitSha}`)
  ).json();
  expect(result.next).toBeNull();
  expect(result.items).toHaveLength(50);
  const previewPaths = await preview
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get("note")),
    );
  expect(previewPaths).toEqual(result.items.slice(0, 5).map((note) => note.path));
  const entry = page.getByRole("button", { name: "最近更新", exact: true });
  await entry.click();
  const list = page.getByRole("dialog", { name: "最近更新", exact: true });
  await expect(list.getByRole("link")).toHaveCount(50);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await list.getByRole("link").first().click();
  await expect(page).toHaveURL((url) => url.searchParams.get("note") === result.items[0].path);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(preview.getByRole("link")).toHaveCount(5);
});
