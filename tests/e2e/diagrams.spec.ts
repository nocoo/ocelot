import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, test } from "@playwright/test";

const note = "06 阅读器体验/阅读室图示.md";
const headers = { Origin: "http://127.0.0.1:27049", "X-Ocelot-Request": "1" };

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

async function diagram(image: Locator) {
  await image.scrollIntoViewIfNeeded();
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const svg = new DOMParser().parseFromString(
      decodeURIComponent(element.src.split(",")[1]),
      "image/svg+xml",
    );
    const box = svg.documentElement.getAttribute("viewBox")?.split(/\s+/u).map(Number) ?? [];
    return {
      errors: svg.querySelectorAll("parsererror").length,
      html: svg.querySelectorAll("foreignObject, script, image, iframe").length,
      width: element.naturalWidth,
      height: element.naturalHeight,
      layout: box.slice(2),
      labels: [...svg.querySelectorAll("text")].map((label) => label.textContent).join(" "),
      lines: [...svg.querySelectorAll("tspan")].map((line) => line.textContent),
    };
  });
}

test("Mermaid keeps labels, line breaks and intrinsic size across diagrams and themes", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`/?repo=101&note=${encodeURIComponent(note)}`);
  await expect(page.locator("#document-title")).toHaveText("阅读室图示");
  const images = page.locator(".diagram img");
  for (const theme of ["light", "dark"] as const) {
    await expect(images).toHaveCount(5);
    for (const image of await images.all()) {
      const data = await diagram(image);
      expect(data.errors).toBe(0);
      expect(data.html).toBe(0);
      expect(Math.abs(data.width - data.layout[0])).toBeLessThan(1);
      expect(Math.abs(data.height - data.layout[1])).toBeLessThan(1);
    }
    const state = await diagram(images.first());
    for (const text of [
      "planned|current",
      "|current",
      "planned == current",
      "planned != current",
      "openLocal=1",
      "isCurrent = true",
      "isCurrent = false",
    ])
      expect(state.labels).toContain(text);
    expect(state.lines).toEqual(expect.arrayContaining(["本地草稿", "稍后整理"]));
    expect(state.width).toBeGreaterThan(400);
    expect(state.height).toBeGreaterThan(500);
    const flow = await diagram(images.nth(1));
    expect(flow.lines).toEqual(expect.arrayContaining(["第一行", "第二行"]));
    expect(flow.labels).toContain("已读 & 未读");
    await expect(page.locator(".diagram-error, .diagram-placeholder")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      page.viewportSize()?.width,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator(".reading-scroll").evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`diagrams-${theme}.png`) });
    if (theme === "light") {
      const before = await images.first().getAttribute("src");
      await page.getByRole("button", { name: "切换到深色", exact: true }).click();
      await expect(images.first()).not.toHaveAttribute("src", before ?? "");
    }
  }

  const trigger = page.getByRole("button", { name: "放大图片：笔记中的 Mermaid 图示" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await dialog.getByRole("button", { name: "查看原图尺寸", exact: true }).click();
  expect(
    await dialog.getByRole("img").evaluate((image) => image.getBoundingClientRect().width),
  ).toBeGreaterThan(400);
  expect(
    await dialog.getByRole("img").evaluate((image) => image.getBoundingClientRect().height),
  ).toBeGreaterThan(500);
  await page.screenshot({ path: info.outputPath("diagram-lightbox.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("invalid syntax and image decode failures show source and recover on rerender", async ({
  page,
}) => {
  const source = "not-a-diagram <script>window.ocelotInjected=true</script>";
  await page.route("**/api/repositories/101/document?*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        content: `# 图示回退\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n A[有效图示] --> B[继续阅读]\n\`\`\``,
      },
    });
  });
  await page.goto(`/?repo=101&note=${encodeURIComponent(note)}`);
  await expect(page.locator(".diagram-error pre")).toHaveText(source);
  await expect(page.locator(".diagram-error script")).toHaveCount(0);
  expect(await page.evaluate(() => "ocelotInjected" in window)).toBe(false);
  const image = page.locator(".diagram img");
  expect((await diagram(image)).errors).toBe(0);
  await image.evaluate((element: HTMLImageElement) => {
    element.src = "data:image/svg+xml;charset=utf-8,%3Csvg%3E";
  });
  await expect(page.locator(".diagram-error")).toHaveCount(2);
  await expect(page.locator(".diagram-error").last()).toContainText("flowchart LR");
  await page.getByRole("button", { name: /切换到[深浅]色/u }).click();
  await expect(page.locator(".diagram-error")).toHaveCount(1);
  expect((await diagram(image)).errors).toBe(0);
  await expect(page.locator(".diagram-placeholder")).toHaveCount(0);
});
