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
}, info) => {
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
  const sectionBox = await preview.boundingBox();
  const headingBox = await page.locator(".article-heading").boundingBox();
  expect(sectionBox && headingBox && sectionBox.y + sectionBox.height <= headingBox.y).toBe(true);
  const entry = page.getByRole("button", { name: "最近更新", exact: true });
  expect((await entry.boundingBox())?.x).toBeGreaterThan(720);
  await entry.click();
  const list = page.getByRole("dialog", { name: "最近更新", exact: true });
  await expect(list.getByRole("link")).toHaveCount(50);
  expect(
    await list
      .locator("time")
      .evaluateAll((times) => times.map((time) => time.getAttribute("datetime"))),
  ).toEqual(result.items.map((note) => note.updatedAt));
  for (let index = 1; index < result.items.length; index++) {
    const [previous, current] = [result.items[index - 1], result.items[index]];
    expect(Date.parse(previous.updatedAt)).toBeGreaterThanOrEqual(Date.parse(current.updatedAt));
    if (previous.updatedAt === current.updatedAt) expect(previous.path < current.path).toBe(true);
  }
  expect(result.items.some((note) => note.path === "README.md" || note.path.startsWith("."))).toBe(
    false,
  );
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath("recent-desktop.png") });
  await list.getByRole("link").first().click();
  await expect(page).toHaveURL((url) => url.searchParams.get("note") === result.items[0].path);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".recent-preview")).toHaveCount(0);
  await expect(page.locator(".ocelot-sidebar")).toHaveAttribute("data-side", "left");
  await expect(page.locator(".ocelot-sidebar")).not.toHaveAttribute("data-collapsed", "");
  await page.goBack();
  await expect(preview.getByRole("link")).toHaveCount(5);
  await page.reload();
  await expect(preview.getByRole("link")).toHaveCount(5);
  expect(
    new URL(
      (await preview.getByRole("link").first().getAttribute("href")) ?? "/",
      origin,
    ).searchParams.get("note"),
  ).toBe(result.items[0].path);
});

test("a small vault shows only its two articles and keeps the list usable at 320px", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?repo=102&note=README.md");
  await expect(page.locator(".recent-preview").getByRole("link")).toHaveCount(2);
  await page.getByRole("button", { name: "最近更新", exact: true }).click();
  const list = page.getByRole("dialog", { name: "最近更新", exact: true });
  await expect(list.getByRole("link")).toHaveCount(2);
  await expect(list.getByRole("link").first()).toContainText("Color and contrast");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("recent-mobile.png") });
  await list.getByRole("link").first().click();
  await expect(page.locator("#document-title")).toHaveText("Color and contrast");
  await expect(page.locator("#vault-sidebar")).toHaveCount(0);
});

test("applying an update replaces the ranking, removes deleted paths and opens a renamed article", async ({
  page,
  request,
}) => {
  await page.goto("/?repo=101&note=README.md");
  const preview = page.locator(".recent-preview");
  await expect(preview.getByRole("link")).toHaveCount(5);
  const oldFirst = await preview.getByRole("link").first().getAttribute("href");
  await request.post("/api/local", { headers, data: { scenario: "updated" } });
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(page.getByRole("button", { name: "应用更新，5 份文件", exact: true })).toBeVisible();
  expect(await preview.getByRole("link").first().getAttribute("href")).toBe(oldFirst);
  await page.getByRole("button", { name: "应用更新，5 份文件", exact: true }).click();
  await expect(preview.getByRole("link").first()).toContainText("今天的新发现");
  await expect(preview.getByRole("link").nth(1)).toContainText("雨后散步");
  await page.getByRole("button", { name: "最近更新", exact: true }).click();
  const links = page.getByRole("dialog").getByRole("link");
  await expect(links).toHaveCount(50);
  const paths = await links.evaluateAll((items) =>
    items.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get("note")),
  );
  expect(paths).not.toContain("02 观察与记录/书店的一角.md");
  expect(paths).not.toContain("02 观察与记录/雨后的街道.md");
  await links.nth(1).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("note") === "02 观察与记录/雨后散步.md",
  );
  await expect(page.locator("#document-title")).toHaveText("雨后的街道");
});

test("recent loading, errors, retry and empty states never replace the README or show a partial ranking", async ({
  page,
}) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/repositories/102/recent?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("cursor") === "0") {
      await route.fulfill({
        json: {
          commitSha: params.get("commit"),
          items: [{ path: "incomplete.md", updatedAt: "2026-09-12T00:00:00.000Z" }],
          next: 100,
        },
      });
    } else {
      await ready;
      await route.fulfill({
        status: 503,
        json: { error: { code: "github_offline", message: "合成最近更新失败" } },
      });
    }
  });
  await page.goto("/?repo=102&note=README.md");
  await expect(page.locator("#document-title")).toHaveText("A studio for small ideas");
  const preview = page.locator(".recent-preview");
  await expect(preview.getByRole("status")).toContainText("正在载入最近更新");
  await expect(preview.getByRole("link")).toHaveCount(0);
  release();
  await expect(preview.getByRole("alert")).toContainText("合成最近更新失败");
  await page.unroute("**/api/repositories/102/recent?*");
  await page.route("**/api/repositories/102/recent?*", (route) =>
    route.fulfill({
      json: {
        commitSha: new URL(route.request().url()).searchParams.get("commit"),
        items: [],
        next: null,
      },
    }),
  );
  await preview.getByRole("button", { name: "重试", exact: true }).click();
  await expect(preview).toContainText("这个知识库还没有可展示的文章");
  await expect(page.locator("#document-title")).toHaveText("A studio for small ideas");
});
