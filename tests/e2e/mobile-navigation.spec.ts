import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const origin = "http://127.0.0.1:27049";
const headers = { Origin: origin, "X-Ocelot-Request": "1" };
const article = "01 思考的方法/渐进式总结.md";
const scroller = (page: Page) => page.locator('[data-file-tree-virtualized-scroll="true"]');

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/local", { headers, data: { scenario: "healthy" } })).ok()).toBe(
    true,
  );
  expect(
    (
      await request.post("/api/repositories", {
        headers,
        data: { repository: "ocelot-demo/fieldnotes" },
      })
    ).ok(),
  ).toBe(true);
});
test.afterEach(async ({ page }) => expect(await page.pageErrors()).toEqual([]));

async function open(page: Page) {
  await page.goto("/?repo=101&note=README.md");
  await expect(page.locator("#document-title")).toHaveText("阅读，是一场安静的探索");
  await page.getByRole("button", { name: "切换知识库导航", exact: true }).tap();
  await expect(page.locator("#vault-sidebar")).toBeVisible();
}

async function expand(page: Page) {
  const first = page.getByRole("treeitem", { name: "01 思考的方法", exact: true });
  await first.tap();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  for (const name of ["02 观察与记录", "03 The Reading Room", "04 工具与实践"]) {
    const folder = page.getByRole("treeitem", { name, exact: true });
    await folder.focus();
    await folder.press("ArrowRight");
    await expect(folder).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.locator("#vault-sidebar")).toBeVisible();
}

async function swipe(page: Page, target: Locator, direction: "up" | "down") {
  const box = await target.boundingBox();
  if (!box) throw new Error("Tree scroller must be visible");
  const session = await page.context().newCDPSession(page);
  const start = box.y + box.height * (direction === "up" ? 0.8 : 0.2);
  const delta = box.height * (direction === "up" ? -0.6 : 0.6);
  const point = (y: number) => [{ x: box.x + box.width / 2, y }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(start) });
  for (let step = 1; step <= 12; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(start + (delta * step) / 12),
    });
    await page.waitForTimeout(20);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

for (const height of [844, 664, 480]) {
  test(`native touch scrolls both ways at 390×${height} without moving the page behind the drawer`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height });
    await open(page);
    await expand(page);
    const tree = scroller(page);
    const before = await tree.evaluate((element) => ({
      top: element.scrollTop,
      height: element.clientHeight,
      total: element.scrollHeight,
    }));
    expect(before.total).toBeGreaterThan(before.height);
    expect(before.height).toBeGreaterThan(60);
    await swipe(page, tree, "down");
    await expect
      .poll(() => tree.evaluate((element) => element.scrollTop))
      .toBeLessThan(before.top - 30);
    await page.waitForTimeout(350);
    const afterDown = await tree.evaluate((element) => element.scrollTop);
    await swipe(page, tree, "up");
    await expect
      .poll(() => tree.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(afterDown + 30);
    const afterUp = await tree.evaluate((element) => element.scrollTop);
    await page.getByRole("tree").press("End");
    await swipe(page, tree, "up");
    expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("#vault-sidebar")).toBeVisible();
    const drawer = await page.locator("#vault-sidebar").boundingBox();
    expect(drawer?.height).toBe(height);
    expect((await page.locator(".brand").boundingBox())?.x).toBe(24);
    await info.attach("native-touch-scroll", {
      body: JSON.stringify({ before, afterDown, afterUp, drawer }),
      contentType: "application/json",
    });
  });
}

test("mobile article taps navigate and close the drawer, including the already selected article", async ({
  page,
}, info) => {
  await open(page);
  const folder = page.getByRole("treeitem", { name: "01 思考的方法", exact: true });
  await folder.tap();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#vault-sidebar")).toBeVisible();
  await page.getByRole("treeitem", { name: "渐进式总结.md", exact: true }).tap();
  await expect(page.locator("#document-title")).toHaveText("渐进式总结");
  await expect(page).toHaveURL((url) => url.searchParams.get("note") === article);
  await expect(page.locator("#vault-sidebar")).toHaveCount(0);
  const menu = page.getByRole("button", { name: "切换知识库导航", exact: true });
  await expect(menu).toBeFocused();
  await menu.tap();
  const selected = page.getByRole("treeitem", { name: "渐进式总结.md", exact: true });
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await selected.tap();
  await expect(page.locator("#vault-sidebar")).toHaveCount(0);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: info.outputPath("mobile-article.png") });
});

test("mobile failed article navigation leaves the drawer open and allows the same row to be retried", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("treeitem", { name: "01 思考的方法", exact: true }).tap();
  const pending = "**/api/repositories/101/document?*";
  await page.route(pending, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "github_offline", message: "合成离线" } },
    }),
  );
  const row = page.getByRole("treeitem", { name: "渐进式总结.md", exact: true });
  await row.tap();
  await expect(page.locator(".reader-error")).toContainText("合成离线");
  await expect(page.locator("#vault-sidebar")).toBeVisible();
  await page.unroute(pending);
  await row.tap();
  await expect(page.locator("#document-title")).toHaveText("渐进式总结");
  await expect(page.locator("#vault-sidebar")).toHaveCount(0);
});

test("mobile drawer fits changing viewport heights and supports native keyboard scroll and accessible folder taps", async ({
  page,
}, info) => {
  await open(page);
  await expand(page);
  const tree = scroller(page);
  await page.getByRole("tree").press("End");
  const bottom = await tree.evaluate((element) => element.scrollTop);
  await page.keyboard.press("PageUp");
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeLessThan(bottom);
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(page.locator("#vault-sidebar")).toHaveCSS("height", "600px");
  expect(await tree.evaluate((element) => element.clientHeight)).toBeGreaterThan(100);
  await expect(page.locator("#vault-sidebar")).toBeVisible();
  const audit = await new AxeBuilder({ page }).include("#vault-sidebar").analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("mobile-sidebar.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator("#vault-sidebar")).toHaveCount(0);
});
