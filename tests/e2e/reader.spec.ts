import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, test as base, expect, type Page } from "@playwright/test";
import manifest from "../../package.json" with { type: "json" };
import type { Repository, Scenario, Snapshot } from "../../src/models/contracts";

const test = base.extend<{ pageErrors: undefined }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(undefined);
      expect(errors, "Unexpected browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

const version = manifest.version;
const origin = "http://127.0.0.1:27049";
const headers = { Origin: origin, "X-Ocelot-Request": "1" };
const welcome = "阅读，是一场安静的探索";
const laboratory = "04 工具与实践/Markdown 排版实验室.md";
const longRead = "06 阅读器体验/长文与多级目录.md";
const illustrated = "06 阅读器体验/图文与版式图鉴.md";

async function scenario(request: APIRequestContext, value: Scenario) {
  const response = await request.post("/api/local", { headers, data: { scenario: value } });
  expect(response.ok()).toBe(true);
}

async function open(page: Page, path = "README.md", repository = 101) {
  await page.goto(`/?repo=${repository}&note=${encodeURIComponent(path)}`);
  await expect(page.locator("#document-title")).toBeVisible();
  await expect(page.locator(".loading-line")).toHaveCount(0);
}

async function search(page: Page, query: string) {
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("textbox", { name: "搜索笔记" });
  await expect(input).toBeFocused();
  await input.fill(query);
  await input.press("Enter");
}

async function chooseScenario(page: Page, label: string) {
  await page.getByRole("button", { name: "本地体验场景" }).click();
  const button = page.getByRole("button", { name: label, exact: true });
  const rechecked = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/connection/check") && response.request().method() === "POST",
  );
  await button.click();
  await rechecked;
  await expect(button).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function settleMotion(page: Page) {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY);
    await Promise.allSettled(finite.map((animation) => animation.finished));
  });
}

async function expectReadableText(page: Page) {
  const small = await page.evaluate(() => {
    const found: { text: string; size: string }[] = [];
    const scan = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) scan(element.shadowRoot);
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (
          !hasText ||
          element.closest(".katex") ||
          !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        )
          continue;
        const size = getComputedStyle(element).fontSize;
        if (Number.parseFloat(size) < 11)
          found.push({ text: element.textContent?.trim().slice(0, 80) ?? "", size });
      }
    };
    scan(document);
    return found;
  });
  expect(small, "Visible interface text must be at least 11px").toEqual([]);
}

test.beforeEach(async ({ request }) => {
  await scenario(request, "healthy");
  const repositories: Repository[] = await (await request.get("/api/repositories")).json();
  for (const [id, name] of [
    [101, "fieldnotes"],
    [102, "studio-notes"],
  ] as const) {
    if (!repositories.some((repository) => repository.id === id)) {
      const response = await request.post("/api/repositories", {
        headers,
        data: { repository: `ocelot-demo/${name}` },
      });
      expect(response.ok()).toBe(true);
    }
  }
  const response = await request.post("/api/repositories/101/sync?force=1", { headers });
  expect(response.ok()).toBe(true);
});

test("an empty sidebar offers a repository action instead of an idle loading animation", async ({
  page,
}) => {
  await page.route("**/api/repositories", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  const sidebar = page.getByRole("navigation", { name: "笔记导航", exact: true });
  await expect(sidebar.getByText("还没有知识库", { exact: true })).toBeVisible();
  await expect(sidebar.locator(".tree-skeleton")).toHaveCount(0);
  await expect(page.locator(".loading-line")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "在 GitHub 打开 Markdown" })).toBeDisabled();
  await sidebar.getByRole("button", { name: "添加知识库", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "添加 GitHub 知识库" })).toBeVisible();
});

test("sidebar loading ends after a failed sync and the registered vault can be reopened", async ({
  page,
}) => {
  let finishSync!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishSync = resolve;
  });
  const endpoint = "**/api/repositories/101/sync";
  await page.route(endpoint, async (route) => {
    await pending;
    await route.fulfill({
      status: 503,
      json: { error: { code: "github_offline", message: "暂时无法连接 GitHub。" } },
    });
  });
  await page.goto("/");
  const sidebar = page.getByRole("navigation", { name: "笔记导航", exact: true });
  await expect(sidebar.locator(".tree-skeleton")).toBeVisible();
  finishSync();
  await expect(sidebar.getByText("目录暂未载入", { exact: true })).toBeVisible();
  await expect(sidebar).toContainText("暂时无法连接 GitHub。");
  await expect(sidebar.locator(".tree-skeleton")).toHaveCount(0);
  await expect(page.locator(".loading-line")).toHaveCount(0);
  await page.unroute(endpoint);
  await sidebar.getByRole("button", { name: "选择知识库", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^fieldnotes/ })
    .click();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await expect(page.locator(".vault-tree")).toBeVisible();
});

test("Chinese and English reading, wikilinks, deep links and browser history", async ({ page }) => {
  await open(page);
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await expect(page.getByText("1,178 篇", { exact: true })).toBeVisible();
  await search(page, "On paying attention");
  await expect(page.locator("#document-title")).toHaveText("On paying attention");
  await expect(page.locator(".prose")).toContainText(
    "Attention does not always ask us to do more.",
  );
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("note") === "03 The Reading Room/On paying attention.md",
  );
  await page.locator(".prose").getByRole("link", { name: "progressive summarization" }).click();
  await expect(page.locator("#document-title")).toHaveText("渐进式总结");
  await expect(page.getByRole("treeitem", { name: "渐进式总结.md", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await expect(page.locator("#document-title")).toHaveText("On paying attention");
  await page.goForward();
  await expect(page.locator("#document-title")).toHaveText("渐进式总结");
  await page.reload();
  await expect(page.locator("#document-title")).toHaveText("渐进式总结");
});

test("Pierre directory supports keyboard navigation and large-vault search", async ({ page }) => {
  await open(page);
  const folder = page.getByRole("treeitem", { name: "01 思考的方法", exact: true });
  await folder.focus();
  await folder.press("ArrowRight");
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await folder.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#document-title")).toHaveText("一张笔记的生命周期");
  await search(page, "学习日志 1149");
  await expect(page.locator("#document-title")).toHaveText("学习日志 1149");
  await expect(
    page.getByRole("treeitem", { name: "学习日志 1149.md", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await page.getByRole("treeitem").count()).toBeLessThan(80);
  await expect(page.locator(".prose")).toContainText("第 1149 则合成笔记");
  const treeScroll = page.locator('[data-file-tree-virtualized-scroll="true"]');
  const before = await treeScroll.evaluate((element) => element.scrollTop);
  const readingScroll = await page
    .locator(".reading-scroll")
    .evaluate((element) => element.scrollTop);
  await treeScroll.hover();
  await page.mouse.wheel(0, -400);
  await expect
    .poll(() => treeScroll.evaluate((element) => element.scrollTop))
    .toBeLessThan(before - 100);
  const up = await treeScroll.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => treeScroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(up + 100);
  expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(
    readingScroll,
  );
  await expect(page.locator(".ocelot-sidebar")).not.toHaveAttribute("data-collapsed", "");
  expect((await page.locator(".brand").boundingBox())?.x).toBe(24);
});

test("Basalt breadcrumbs reveal folders and the collapsed rail preserves the Pierre tree", async ({
  page,
}) => {
  await open(page, "01 思考的方法/渐进式总结.md");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("渐进式总结");
  await expect(breadcrumb.getByRole("button", { name: "在目录中定位 fieldnotes" })).toBeVisible();
  const other = page.getByRole("treeitem", { name: "02 观察与记录", exact: true });
  await other.click();
  await expect(other).toHaveAttribute("aria-expanded", "true");
  const scroll = await page.locator(".reading-scroll").evaluate((element) => {
    element.scrollTop = 200;
    return element.scrollTop;
  });
  const url = page.url();
  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/document?")) documents.push(request.url());
  });
  await page.getByRole("button", { name: "切换知识库导航", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "知识库快捷导航" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "笔记导航", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "搜索笔记", exact: true })).toBeVisible();
  await expect(page.locator(".ocelot-sidebar")).toHaveCSS("width", "68px");
  await breadcrumb.getByRole("button", { name: "在目录中定位 01 思考的方法" }).click();
  const folder = page.getByRole("treeitem", { name: "01 思考的方法", exact: true });
  await expect(folder).toBeFocused();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(other).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(url);
  expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(
    scroll,
  );
  expect(documents).toEqual([]);
  await expect(page.getByRole("treeitem", { name: "渐进式总结.md", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await folder.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#document-title")).toHaveText("一张笔记的生命周期");
});

test("adjacent hovered and selected tree rows keep a gap without shifting virtual positions", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, "05 长期档案/01 月/创作练习/创作练习 0032.md");
  const selected = page.getByRole("treeitem", { name: "创作练习 0032.md", exact: true });
  const previous = page.getByRole("treeitem", { name: "创作练习 0020.md", exact: true });
  await previous.hover();
  await expect(selected).toHaveAttribute("aria-selected", "true");
  const before = await previous.boundingBox();
  const after = await selected.boundingBox();
  if (!before || !after) throw new Error("The adjacent tree rows must be visible.");
  expect(after.y - before.y - before.height).toBe(4);
  expect(after.y - before.y).toBe(36);
  await expectReadableText(page);
  await page.locator(".ocelot-sidebar").screenshot({ path: info.outputPath("tree-row-gap.png") });
  await search(page, "创作练习 1148");
  await expect(
    page.getByRole("treeitem", { name: "创作练习 1148.md", exact: true }),
  ).toBeInViewport();
  await expect(page.locator("#document-title")).toHaveText("创作练习 1148");
});

test("long Unicode paths remain accessible in breadcrumbs and GitHub links at every viewport", async ({
  page,
}) => {
  const path =
    "资料 & References/100% 原样的 %2F 文件夹/中文与 English 的长期阅读记录/Long-unbroken-directory-name-for-layout-checks/一份很长的中英文笔记 Reading with attention.md";
  let currentCommit = "";
  await page.route("**/api/repositories/101/sync*", async (route) => {
    const response = await route.fetch();
    const snapshot: Snapshot = await response.json();
    currentCommit = snapshot.commitSha;
    snapshot.files.push({ path, sha: "a".repeat(40), size: 100 });
    await route.fulfill({ response, json: snapshot });
  });
  await page.route("**/api/repositories/101/document?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("path") !== path) return route.continue();
    await route.fulfill({
      json: {
        path,
        sha: "a".repeat(40),
        treeSha: url.searchParams.get("tree"),
        content: "# 一份很长的中英文笔记 Reading with attention\n\n一份合成的路径布局样例。",
      },
    });
  });
  await open(page, path);
  const github = page.getByRole("link", { name: "在 GitHub 打开 Markdown", exact: true });
  await expect(github).toHaveAttribute("target", "_blank");
  await expect(github).toHaveAttribute("rel", "noopener noreferrer");
  const sourceUrl = new URL((await github.getAttribute("href")) ?? "");
  expect(sourceUrl.origin).toBe("https://github.com");
  expect(decodeURIComponent(sourceUrl.pathname)).toBe(
    `/ocelot-demo/fieldnotes/blob/${currentCommit}/${path}`,
  );
  expect(sourceUrl.search + sourceUrl.hash).toBe("");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await settleMotion(page);
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(
      "一份很长的中英文笔记 Reading with attention",
    );
    await expect(page.getByRole("button", { name: "检查更新", exact: true })).toBeInViewport();
    await expect(github).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const trigger = breadcrumb.getByRole("button", { name: "浏览完整路径" });
    await trigger.click();
    const menu = page.getByRole("menu", { name: "完整路径" });
    await expect(menu).toContainText(path);
    await expect(menu.getByRole("menuitem")).toHaveCount(5);
    await expectReadableText(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  await page
    .context()
    .route("https://github.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "Synthetic GitHub destination" }),
    );
  const opened = page.waitForEvent("popup");
  await github.click();
  const destination = await opened;
  await expect(destination).toHaveURL(sourceUrl.toString());
  expect(await destination.evaluate(() => window.opener === null)).toBe(true);
  await destination.close();
  await expect(page).toHaveURL((url) => url.searchParams.get("note") === path);
  await page.getByRole("button", { name: "浏览完整路径" }).click();
  await page
    .getByRole("menuitem", { name: "资料 & References/100% 原样的 %2F 文件夹", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "知识库导航" })).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: "100% 原样的 %2F 文件夹", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "浏览完整路径" })).toBeFocused();
});

test("toolbar uses consistent Lucide icons with pointer and keyboard descriptions", async ({
  page,
}, info) => {
  await open(page);
  const controls = page.locator(".reader-options, .global-actions").locator("button, a");
  for (const control of await controls.all()) {
    await expect(control).toHaveText("");
    await expect(control).toHaveAttribute("aria-label", /\S/u);
    await expect(control.locator("svg.lucide")).toHaveCount(1);
    await expect(control.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(control.locator("svg")).toHaveCSS("width", "18px");
    await expect(control.locator("svg")).toHaveCSS("stroke-width", "1.75px");
  }
  const preferences = page.getByRole("button", { name: "阅读偏好", exact: true });
  await preferences.hover();
  await expect(page.getByRole("tooltip")).toHaveText("阅读偏好");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const external = page.getByRole("link", { name: "在 GitHub 打开 Markdown", exact: true });
  await external.focus();
  await expect(page.getByRole("tooltip")).toHaveText("在 GitHub 打开 Markdown");
  await expect(external).toHaveAttribute(
    "aria-describedby",
    (await page.getByRole("tooltip").getAttribute("id")) ?? "",
  );
  await expect(external).toHaveCSS("outline-width", "2px");
  // Portaled tooltips are transient descriptions, not document landmarks.
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("toolbar-light.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await preferences.click();
  await expect(page.getByRole("dialog", { name: "让阅读更合心意", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("renders math, diagrams, pinned images, note embeds and safe semantic HTML", async ({
  page,
}, info) => {
  await open(page, laboratory);
  await expect(page.locator("#document-title")).toHaveText("Markdown 排版实验室");
  await expect(page.locator(".katex")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "笔记中的 Mermaid 图示" })).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );
  const image = page.getByRole("img", { name: "暮色中的山峦" });
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1200);
  await expect(image).toHaveAttribute("src", /\/api\/repositories\/101\/asset\?tree=/);
  await expect(page.getByRole("complementary", { name: "嵌入笔记" })).toContainText(
    "下次在哪种情境里",
  );
  await page.getByText("展开一条补充说明", { exact: true }).click();
  await expect(page.getByText("简单的语义 HTML 可以丰富表达。", { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath("laboratory.png") });
  await page.locator(".prose").getByRole("link", { name: "一个具体例子", exact: true }).click();
  await expect(page.locator("#document-title")).toHaveText("渐进式总结");
  await expect(page).toHaveURL(/#note-/);
  await expect(page.getByRole("heading", { name: "一个例子", exact: true })).toBeInViewport();
  expect(
    await page.locator(".reading-scroll").evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
});

test("adds and removes a private vault with a slash in its branch", async ({ page, request }) => {
  await request.delete("/api/repositories/103", { headers });
  await open(page);
  await page.locator(".repository-switch").click();
  await page
    .getByRole("textbox", { name: "添加 GitHub 知识库" })
    .fill("https://github.com/ocelot-demo/reading-room");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.locator("#document-title")).toHaveText("The reading room");
  await expect(page.locator(".reading-status")).toContainText("notes/2026");
  await page.locator(".prose").getByRole("link", { name: "如何阅读一本书", exact: true }).click();
  await expect(page.locator("#document-title")).toHaveText("如何阅读一本书");
  await page.locator(".repository-switch").click();
  await page.getByRole("button", { name: "移除 reading-room", exact: true }).click();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  const repositories: Repository[] = await (await request.get("/api/repositories")).json();
  expect(repositories.some((repository) => repository.id === 103)).toBe(false);
});

test("slow Worker responses retain the old article until the new one is ready", async ({
  page,
}) => {
  await open(page);
  await chooseScenario(page, "慢速加载");
  await search(page, "实验记录 1152");
  await expect(
    page.getByRole("status").filter({ hasText: "正在打开 实验记录 1152" }),
  ).toBeVisible();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await expect(page.locator(".reading-status")).toContainText("正在准备下一份笔记");
  await expect(page.locator("#document-title")).toHaveText("实验记录 1152");
  await expect(page.locator(".loading-line")).toHaveCount(0);
});

test("PAT renewal stays quiet and invalid credentials cannot read cached private content", async ({
  page,
  request,
}, info) => {
  await open(page);
  await chooseScenario(page, "3 天后到期");
  await expect(page.getByRole("button", { name: "3 天后需要轮换", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "3 天后需要轮换", exact: true }).click();
  await expect(
    page.getByText("找一个方便的时候更新即可，阅读可以继续。", { exact: false }),
  ).toBeVisible();
  await page.getByText("如何更新连接", { exact: false }).click();
  await expect(page.getByText("GITHUB_TOKEN", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("renewal.png") });
  await page.keyboard.press("Escape");
  const snapshot: Snapshot = await (await request.get("/api/repositories/101/snapshot")).json();
  const path = `/api/repositories/101/document?tree=${snapshot.treeSha}&path=README.md`;
  expect((await request.get(path)).ok()).toBe(true);
  await chooseScenario(page, "凭据失效");
  await expect(page.getByRole("button", { name: "连接需要更新", exact: true })).toBeVisible();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  const denied = await request.get(path);
  expect(denied.status()).toBe(424);
  expect((await denied.json()).error.code).toBe("github_invalid");
  await scenario(request, "healthy");
  await page.getByRole("button", { name: "连接需要更新", exact: true }).click();
  await page.getByRole("button", { name: "重新检查", exact: true }).click();
  await expect(page.locator(".connection-card")).toContainText("GitHub 已连接");
  await page.keyboard.press("Escape");
  await search(page, "On paying attention");
  await expect(page.locator("#document-title")).toHaveText("On paying attention");
});

test("new Git revisions wait for explicit handoff without moving text or collapsing folders", async ({
  page,
}) => {
  await open(page);
  const folder = page.getByRole("treeitem", { name: "02 观察与记录", exact: true });
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await page.locator(".reading-scroll").evaluate((element) => {
    element.scrollTop = 440;
  });
  const before = await page
    .locator(".reading-scroll")
    .evaluate((element) => ({ y: element.getBoundingClientRect().top, scroll: element.scrollTop }));
  await chooseScenario(page, "收到新提交");
  await expect(page.getByRole("button", { name: "应用更新，5 份文件", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "一次新的重访", exact: true })).toHaveCount(0);
  const pending = await page
    .locator(".reading-scroll")
    .evaluate((element) => ({ y: element.getBoundingClientRect().top, scroll: element.scrollTop }));
  expect(pending).toEqual(before);
  await page.getByRole("button", { name: "应用更新，5 份文件", exact: true }).click();
  await expect(page.getByRole("heading", { name: "一次新的重访", exact: true })).toHaveCount(1);
  expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(
    before.scroll,
  );
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("treeitem", { name: /今天的新发现\.md/ })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /书店的一角\.md/ })).toHaveCount(0);
});

test("unchanged checks reuse cached blobs and transfer only version metadata", async ({
  page,
  request,
}) => {
  await open(page);
  const before = await (await request.get("/api/local")).json();
  const response = page.waitForResponse(
    (value) => value.url().includes("/sync?") && value.url().includes("known="),
  );
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  const unchanged = await (await response).json();
  expect(unchanged.unchanged).toBe(true);
  expect(unchanged.files).toBeUndefined();
  await expect(page.locator(".reading-status")).toContainText("已经是最新版本");
  const after = await (await request.get("/api/local")).json();
  expect(after.requests.blob).toBe(before.requests.blob);
  expect(after.requests.tree).toBe(before.requests.tree);
  expect(after.requests["not-modified"]).toBeGreaterThan(before.requests["not-modified"] ?? 0);
});

test("rate limits back off and an offline upstream recovers without losing the article", async ({
  page,
  request,
}) => {
  await open(page);
  await chooseScenario(page, "GitHub 限流");
  await expect(page.getByRole("button", { name: "稍后继续检查", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "检查更新", exact: true })).toBeDisabled();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await chooseScenario(page, "上游离线");
  await expect(page.getByRole("button", { name: "连接暂不可用", exact: true })).toBeVisible();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await scenario(request, "healthy");
  await page.getByRole("button", { name: "连接暂不可用", exact: true }).click();
  await page.getByRole("button", { name: "重新检查", exact: true }).click();
  await expect(page.locator(".connection-card")).toContainText("GitHub 已连接");
});

test("untrusted note content cannot execute scripts, clobber anchors or load trackers", async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== new URL(baseURL ?? origin).origin
    )
      external.push(request.url());
  });
  await page.route("**/api/repositories/101/document?*", async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    await route.fulfill({
      json: {
        ...document,
        content: [
          "# Safety garden",
          "<script>window.ocelotInjected = true</script>",
          '<img src="https://tracking.invalid/pixel" onerror="window.ocelotInjected = true" alt="External image">',
          '<iframe srcdoc="<script>parent.ocelotInjected = true</script>"></iframe>',
          '<form action="https://tracking.invalid/send"><input name="location"></form>',
          '<a id="document-title" href="javascript:window.ocelotInjected=true">Unsafe link</a>',
          "<details><summary>Safe details</summary><p>A readable explanation.</p></details>",
          "## Still readable",
          "A safe paragraph and [a safe link](https://example.com).",
        ].join("\n\n"),
      },
    });
  });
  await open(page);
  await expect(page.locator("#document-title")).toHaveText("Safety garden");
  await expect(
    page.locator(".prose script, .prose iframe, .prose form, .prose [onerror]"),
  ).toHaveCount(0);
  await expect(page.locator(".image-unavailable")).toContainText("External image");
  await page.getByText("Safe details", { exact: true }).click();
  await expect(page.getByText("A readable explanation.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "a safe link", exact: true })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(await page.evaluate(() => "ocelotInjected" in window)).toBe(false);
  expect(external).toEqual([]);
  await page.getByRole("button", { name: "查看 Markdown 原文" }).click();
  await expect(page.locator(".raw-markdown code")).toContainText(
    "<script>window.ocelotInjected = true</script>",
  );
  await expect(
    page.locator(".raw-markdown script, .raw-markdown img, .raw-markdown iframe"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => "ocelotInjected" in window)).toBe(false);
  expect(external).toEqual([]);
});

test("Access identity loads after reading, hides local controls and handles a failed avatar", async ({
  page,
}, info) => {
  let revealProfile!: () => void;
  const profileReady = new Promise<void>((resolve) => {
    revealProfile = resolve;
  });
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), local: false, email: "reader@example.test" },
    });
  });
  await page.route("**/api/profile", async (route) => {
    await profileReady;
    await route.fulfill({ json: { name: "示例读者", avatar: "/api/avatar" } });
  });
  let available = true;
  try {
    await open(page);
    await expect(page.locator(".space-identity p").first()).toHaveText("reader@example.test");
    await expect(page.getByRole("button", { name: "本地体验场景" })).toHaveCount(0);
    const snapshot: Snapshot = await (
      await page.request.get("/api/repositories/101/snapshot")
    ).json();
    const image = await page.request.get(
      `/api/repositories/101/asset?${new URLSearchParams({ tree: snapshot.treeSha, path: "附件/blue-hour.png" })}`,
    );
    expect(image.ok()).toBe(true);
    const body = await image.body();
    await page.route("**/api/avatar", (route) =>
      route.fulfill(available ? { contentType: "image/png", body } : { status: 404, body: "" }),
    );
  } finally {
    revealProfile();
  }
  await expect(page.locator(".space-identity p").first()).toHaveText("示例读者");
  await expect(page.locator(".identity-avatar img")).toBeVisible();
  await expect(page.locator(".identity-avatar")).toHaveCSS("width", "36px");
  await expect(page.locator(".space-identity p").first()).toHaveCSS("margin", "0px");
  await expect(page.locator(".space-identity p").first()).toHaveCSS("font-size", "14px");
  await expect(page.locator(".space-identity p").last()).toHaveCSS("font-size", "12px");
  const alignment = await page.locator(".space-identity").evaluate((element) => {
    const avatar = element.querySelector(".identity-avatar")?.getBoundingClientRect();
    const name = element.querySelector("p")?.parentElement?.getBoundingClientRect();
    return avatar && name ? Math.abs(avatar.y + avatar.height / 2 - name.y - name.height / 2) : -1;
  });
  expect(alignment).toBeLessThanOrEqual(1);
  expect(alignment).toBeGreaterThanOrEqual(0);
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await page
    .locator(".ocelot-sidebar")
    .screenshot({ path: info.outputPath("public-identity.png") });
  available = false;
  const failedAvatar = page.waitForResponse(
    (response) => response.url().endsWith("/api/avatar") && response.status() === 404,
  );
  await page.reload();
  await failedAvatar;
  await expect(page.locator(".identity-icon")).toHaveText("示");
  await expect(page.locator(".identity-avatar img")).toHaveCount(0);
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await expect(page.locator(".reader-error")).toHaveCount(0);
  await expectReadableText(page);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} desktop has accessible contrast, keyboard dialogs and persistent preferences`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    await expect(page.locator(".version-pill")).toHaveText(`v${version}`);
    await expect(
      page.locator(".reader-toolbar").getByRole("button", { name: "本地体验场景" }),
    ).toBeVisible();
    await expect(
      page.locator(".ocelot-sidebar").getByRole("button", { name: "本地体验场景" }),
    ).toHaveCount(0);
    const github = page
      .locator(".reader-toolbar")
      .getByRole("link", { name: "Ocelot GitHub 仓库" });
    await expect(github).toHaveAttribute("href", "https://github.com/nocoo/ocelot");
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(page.locator(".ocelot-sidebar")).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(18, 22, 28)" : "rgb(243, 245, 247)",
    );
    await expect(page.locator(".reader-toolbar")).toHaveCSS(
      "background-color",
      await page
        .locator(".ocelot-sidebar")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    await settleMotion(page);
    const audit = await new AxeBuilder({ page }).analyze();
    await info.attach("axe", {
      body: JSON.stringify(audit.violations, null, 2),
      contentType: "application/json",
    });
    expect(audit.violations).toEqual([]);
    await expectReadableText(page);
    await page.screenshot({ path: info.outputPath(`reader-${theme}.png`) });
    const preferences = page.getByRole("button", { name: "阅读偏好", exact: true });
    await preferences.click();
    await expectReadableText(page);
    await page.getByRole("button", { name: "Aa 舒展", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(preferences).toBeFocused();
    await page.reload();
    await expect(page.locator(".article")).toHaveCSS("--reading-scale", "1.15");
    const themeToggle = page.getByRole("button", { name: "切换主题", exact: true });
    const stored = await page.evaluate(() => localStorage.getItem("ocelot-theme"));
    const current =
      stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
    await themeToggle.click();
    await settleMotion(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ocelot-theme"))).toBe(next);
    await page.reload();
    await expect(themeToggle).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ocelot-theme"))).toBe(next);
    const resolvedDark = next === "dark" || (next === "system" && theme === "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-mode",
      resolvedDark ? "dark" : "light",
    );
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(
      expect.arrayContaining(["ocelot-font-scale", "ocelot-theme"]),
    );
  });
}

test("mobile drawer and outline are keyboard accessible and respect reduced motion", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole("button", { name: "浏览完整路径" }).click();
  await page.getByRole("menuitem", { name: "fieldnotes", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "知识库导航", exact: true });
  await expect(drawer).toBeVisible();
  await expectReadableText(page);
  await expect(drawer.getByRole("treeitem", { name: "01 思考的方法", exact: true })).toBeFocused();
  await drawer.getByRole("treeitem", { name: "03 The Reading Room", exact: true }).click();
  await drawer.getByRole("treeitem", { name: "On paying attention.md", exact: true }).click();
  await expect(page.locator("#document-title")).toHaveText("On paying attention");
  await expect(drawer).toHaveCount(0);
  await page.getByRole("button", { name: "文章大纲", exact: true }).click();
  await page.getByRole("link", { name: "Leaving room", exact: true }).click();
  await expect(page.locator(".mobile-outline")).toHaveCount(0);
  await page.getByRole("button", { name: "回到文章顶部", exact: true }).click();
  expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  const audit = await new AxeBuilder({ page }).analyze();
  await info.attach("axe-mobile", {
    body: JSON.stringify(audit.violations, null, 2),
    contentType: "application/json",
  });
  expect(audit.violations).toEqual([]);
  await expectReadableText(page);
  await page.screenshot({ path: info.outputPath("reader-mobile.png") });
});

test("a 144-section Basalt outline scrolls independently, animates and reaches the final section", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, longRead);
  const article = page.locator(".reading-scroll");
  const outline = page.locator(".outline-column .outline-scroll");
  await expect(outline.locator(".basalt-ui")).toHaveAttribute("aria-label", "在这篇笔记里");
  await expect(outline.getByRole("link")).toHaveCount(144);
  const progressBounds = await page.locator(".reading-progress").boundingBox();
  const indexBounds = await outline.boundingBox();
  expect(
    progressBounds && indexBounds && progressBounds.y + progressBounds.height <= indexBounds.y,
  ).toBe(true);
  expect(
    await article.evaluate((element) => element.scrollHeight / element.clientHeight),
  ).toBeGreaterThan(50);
  expect(await outline.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  const initial = await article.evaluate((element) => element.scrollTop);
  await outline.hover();
  await page.mouse.wheel(0, 1400);
  await expect.poll(() => outline.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
  expect(await article.evaluate((element) => element.scrollTop)).toBe(initial);

  const last = outline.getByRole("link").last();
  await last.focus();
  await expect(last).toBeInViewport();
  await last.press("Enter");
  const animated = await page.evaluate(async () => {
    const marker = document.querySelector<HTMLElement>(".outline-column .outline-marker");
    const body = document.querySelector<HTMLElement>(".outline-column .outline-body");
    let moving = false;
    for (let frame = 0; frame < 70; frame++) {
      await new Promise(requestAnimationFrame);
      if (!marker || !body) continue;
      const target = Number.parseFloat(body.style.getPropertyValue("--outline-marker-top"));
      const current = new DOMMatrixReadOnly(getComputedStyle(marker).transform).m42;
      if (Math.abs(target - current) > 1) moving = true;
    }
    return moving;
  });
  expect(animated, "The persistent active marker must move between sections").toBe(true);
  await expect(last).toHaveAttribute("aria-current", "location");
  await expect(page.locator(".reading-progress")).toContainText("100%");
  const outlineBounds = await outline.boundingBox();
  expect(outlineBounds && outlineBounds.y + outlineBounds.height).toBeLessThan(760);
  await page.screenshot({ path: info.outputPath("long-reader.png") });
  const toTop = page.getByRole("button", { name: "回到文章顶部", exact: true });
  await expect(toTop).toBeInViewport();
  await toTop.click();
  await expect.poll(() => article.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(outline.getByRole("link").first()).toHaveAttribute("aria-current", "location");
});

test("full width persists and Raw shows the exact Markdown without another content request", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  let raw = "";
  let documents = 0;
  await page.route("**/api/repositories/101/document?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    documents++;
    if (new URL(route.request().url()).searchParams.get("path") === illustrated) raw = body.content;
    await route.fulfill({ response, json: body });
  });
  await open(page, illustrated);
  await expect(page.locator(".embed-skeleton")).toHaveCount(0);
  const article = page.locator(".article");
  const limited = (await article.boundingBox())?.width ?? 0;
  expect(limited).toBeGreaterThan(600);
  expect(limited).toBeLessThanOrEqual(680);
  const readerOptions = page.getByRole("group", { name: "阅读器选项", exact: true });
  const fullWidth = readerOptions.getByRole("button", { name: "全宽阅读", exact: true });
  await expect(fullWidth).toBeInViewport();
  await expect(fullWidth).toHaveText("");
  await expect(fullWidth).toHaveAttribute("aria-pressed", "false");
  await fullWidth.click();
  await expect(fullWidth).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "阅读偏好", exact: true }).click();
  await expect(page.getByRole("button", { name: "全宽", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  expect((await article.boundingBox())?.width).toBeGreaterThan(limited + 150);
  await page.reload();
  await expect(page.locator(".reading-grid")).toHaveClass(/is-full-width/);
  await expect(page.locator(".embed-skeleton")).toHaveCount(0);
  const before = documents;
  await page.getByRole("button", { name: "查看 Markdown 原文" }).click();
  await expect(page.locator(".raw-markdown code")).toHaveText(raw, { useInnerText: false });
  expect(raw.startsWith("---\n")).toBe(true);
  expect(raw).toContain("# 图文与版式图鉴");
  expect(raw).toContain("<details>");
  await expect(page.locator(".prose, .raw-markdown img, .raw-markdown details")).toHaveCount(0);
  await expect(page.locator(".outline-column")).toHaveCount(0);
  expect(documents).toBe(before);
  await page.screenshot({ path: info.outputPath("raw-reader.png") });
  await page.getByRole("button", { name: "返回文章阅读" }).click();
  await expect(page.locator(".prose img").first()).toBeVisible();
  expect(documents).toBe(before);
  const table = page.getByRole("region", { name: "表格，可横向滚动" });
  expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "阅读偏好", exact: true }).click();
  await page.getByRole("button", { name: "舒适行宽", exact: true }).click();
  await page.keyboard.press("Escape");
  expect((await article.boundingBox())?.width).toBe(limited);
  await expect(fullWidth).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["ocelot-full-width"]);
});

test("image overlays fit the viewport, scroll at original size and restore reading focus", async ({
  page,
}, info) => {
  await open(page, illustrated);
  const trigger = page.getByRole("button", { name: "放大图片：横向全景", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  const before = await page.locator(".reading-scroll").evaluate((element) => element.scrollTop);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(dialog).toBeVisible();
  const image = dialog.getByRole("img", { name: "横向全景", exact: true });
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(2400);
  const stage = dialog.getByRole("region", { name: "图片，可滚动查看原图" });
  expect(await stage.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("image-lightbox.png") });
  await dialog.getByRole("button", { name: "查看原图尺寸" }).click();
  expect(await stage.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => stage.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(
    before,
  );

  const poster = page.getByRole("button", { name: "放大图片：超长山峦海报", exact: true });
  await poster.click();
  await dialog.getByRole("button", { name: "查看原图尺寸" }).click();
  expect(await stage.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await stage.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "适应窗口" }).click();
  await expect(stage).not.toHaveClass(/is-zoomed/);
  await dialog.getByRole("button", { name: "关闭图片预览" }).click();
  await expect(poster).toBeFocused();

  const linked = page.getByRole("button", { name: "放大图片：带链接的山峦", exact: true });
  await linked.click();
  await expect(dialog.getByRole("img", { name: "带链接的山峦" })).toBeVisible();
  await settleMotion(page);
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(linked).toBeFocused();
  await expect(page).toHaveURL(/note=/);
  expect(await linked.evaluate((element) => element.closest("a"))).toBeNull();
});

test("image attachments and Mermaid use the same lightbox with a readable failure fallback", async ({
  page,
}) => {
  await open(page, laboratory);
  await page.getByRole("button", { name: "放大图片：笔记中的 Mermaid 图示" }).click();
  const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(dialog.getByRole("img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await page.keyboard.press("Escape");
  await page.route("**/api/repositories/101/asset?*", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await open(page, "附件/small.png");
  await expect(page.getByRole("button", { name: "查看 Markdown 原文" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "在 GitHub 打开 Markdown" })).toBeDisabled();
  await page.getByRole("button", { name: "放大图片：small.png" }).click();
  await expect(dialog.getByRole("status")).toContainText("图片暂时无法加载");
  await expect(dialog.getByRole("button", { name: "查看原图尺寸" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#document-title")).toHaveText("small.png");
});

test("sidebar keyboard resizing uses a short focus handle and retains the collapsed identity", async ({
  page,
}, info) => {
  await open(page);
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  await page.keyboard.press("Tab");
  await handle.focus();
  await expect(handle).toHaveCSS("outline-style", "none");
  await settleMotion(page);
  const marker = await handle.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return { height: style.height, color: style.backgroundColor };
  });
  expect(marker.height).toBe("36px");
  expect(marker.color).not.toBe("rgba(0, 0, 0, 0)");
  await handle.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "272");
  await page.locator(".reader-main").focus();
  await expect(page.locator(".reader-main")).toHaveCSS("outline-style", "none");
  const toggle = page.getByRole("button", { name: "切换知识库导航", exact: true });
  await toggle.focus();
  await expect(toggle).toHaveCSS("outline-width", "2px");
  await toggle.click();
  await settleMotion(page);
  await expect(page.locator(".sidebar-bottom .identity-avatar")).toBeVisible();
  expect((await page.locator(".brand .ocelot-mark").boundingBox())?.x).toBe(24);
  await page.screenshot({ path: info.outputPath("collapsed-identity.png") });
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} mobile handles the long outline, reduced motion and image overlay`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await open(page, longRead);
    const options = page.getByRole("group", { name: "阅读器选项", exact: true });
    const global = page.getByRole("group", { name: "全局操作", exact: true });
    await expect(options.getByRole("button", { name: "全宽阅读", exact: true })).toBeInViewport();
    await expect(
      options.getByRole("link", { name: "在 GitHub 打开 Markdown", exact: true }),
    ).toBeInViewport();
    const readerBounds = await options.boundingBox();
    const globalBounds = await global.boundingBox();
    expect(
      readerBounds && globalBounds && readerBounds.y >= globalBounds.y + globalBounds.height,
    ).toBe(true);
    const trigger = page.getByRole("button", { name: "文章大纲", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "文章大纲", exact: true });
    const last = dialog.getByRole("link").last();
    await last.focus();
    await expect(last).toBeInViewport();
    expect(
      await dialog.locator(".outline-scroll").evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(2000);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
    await last.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator(".reading-scroll")).toHaveJSProperty(
      "scrollTop",
      await page
        .locator(".reading-scroll")
        .evaluate((element) => element.scrollHeight - element.clientHeight),
    );
    await page.getByRole("button", { name: "回到文章顶部", exact: true }).click();
    expect(await page.locator(".reading-scroll").evaluate((element) => element.scrollTop)).toBe(0);
    await open(page, illustrated);
    await page.getByRole("button", { name: "放大图片：暮色中的山峦", exact: true }).click();
    const lightbox = page.getByRole("dialog", { name: "图片预览", exact: true });
    await expect(lightbox).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expectReadableText(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: info.outputPath(`lightbox-mobile-${theme}.png`) });
    await page.keyboard.press("Escape");
  });
}

test("short local examples keep an empty outline and a working Raw view", async ({ page }) => {
  for (const [path, title] of [
    ["无标题短笺", "无标题短笺"],
    ["只有标题", "只有标题"],
  ]) {
    await open(page, `06 阅读器体验/${path}.md`);
    await expect(page.locator("#document-title")).toHaveText(title);
    await expect(page.locator(".article-outline a")).toHaveCount(0);
    await expect(page.locator(".outline-empty")).toBeVisible();
    await page.getByRole("button", { name: "查看 Markdown 原文" }).click();
    await expect(page.locator(".raw-markdown code")).not.toBeEmpty();
  }
});
