import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, test as base, expect, type Page } from "@playwright/test";
import manifest from "../../package.json" with { type: "json" };
import type { Repository, Scenario } from "../../src/models/contracts";

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

test("home navigation preserves shell nodes, collapsed state and browser history", async ({
  page,
}) => {
  await open(page, longRead);
  const noteUrl = page.url();
  const noteTitle = (await page.locator("#document-title").textContent()) ?? "";
  await page.getByRole("button", { name: "收起知识库导航", exact: true }).click();
  const toggle = page.getByRole("button", { name: "展开知识库导航", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const shellNode = await page.locator(".ocelot-shell").elementHandle();
  const headerNode = await page.locator(".reader-toolbar").elementHandle();
  const sidebarNode = await page.locator(".ocelot-sidebar").elementHandle();
  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.getByRole("link", { name: /Ocelot 首页/u }).click();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  expect(new URL(page.url()).searchParams.get("note")).toBe("README.md");
  expect(documents).toEqual([]);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    await shellNode?.evaluate((node) => node === document.querySelector(".ocelot-shell")),
  ).toBe(true);
  expect(
    await headerNode?.evaluate((node) => node === document.querySelector(".reader-toolbar")),
  ).toBe(true);
  expect(
    await sidebarNode?.evaluate((node) => node === document.querySelector(".ocelot-sidebar")),
  ).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(noteUrl);
  await expect(page.locator("#document-title")).toHaveText(noteTitle);
  await page.goForward();
  await expect(page.locator("#document-title")).toHaveText(welcome);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(documents).toEqual([]);
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
  await page.getByRole("button", { name: "收起知识库导航", exact: true }).click();
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
});

test("renders math, diagrams, pinned images, note embeds and safe semantic HTML", async ({
  page,
}) => {
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
});

test("light desktop has accessible contrast, keyboard dialogs and persistent preferences", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page);
  await expect(page.locator('[data-slot="sidebar-brand-version"]')).toHaveText(`v${version}`);
  await expect(
    page.locator(".reader-toolbar").getByRole("button", { name: "本地体验场景" }),
  ).toBeVisible();
  const github = page.locator(".reader-toolbar").getByRole("link", { name: "Ocelot GitHub 仓库" });
  await expect(github).toHaveAttribute("href", "https://github.com/nocoo/ocelot");
  await expect(github).toHaveAttribute("target", "_blank");
  await expect(page.locator(".ocelot-sidebar")).toHaveCSS("background-color", "rgb(243, 245, 247)");
  await settleMotion(page);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await expectReadableText(page);
  const preferences = page.getByRole("button", { name: "阅读偏好", exact: true });
  await preferences.click();
  await page.getByRole("button", { name: "Aa 舒展", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(preferences).toBeFocused();
  await page.reload();
  await expect(page.locator(".article")).toHaveCSS("--reading-scale", "1.15");
  const themeToggle = page.getByRole("button", { name: "切换主题", exact: true });
  await themeToggle.click();
  await settleMotion(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ocelot-theme"))).toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
});

test("full width persists and Raw shows the exact Markdown without another content request", async ({
  page,
}) => {
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
  await fullWidth.click();
  await expect(fullWidth).toHaveAttribute("aria-pressed", "true");
  expect((await article.boundingBox())?.width).toBeGreaterThan(limited + 150);
  await page.reload();
  await expect(page.locator(".reading-grid")).toHaveClass(/is-full-width/);
  const before = documents;
  await page.getByRole("button", { name: "查看 Markdown 原文" }).click();
  await expect(page.locator(".raw-markdown code")).toHaveText(raw, { useInnerText: false });
  await expect(page.locator(".prose")).toHaveCount(0);
  expect(documents).toBe(before);
  await page.getByRole("button", { name: "返回文章阅读" }).click();
  await expect(page.locator(".prose img").first()).toBeVisible();
  expect(documents).toBe(before);
});
