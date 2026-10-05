import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_PATH || "playwright");
} catch (error) {
  if (process.env.PLAYWRIGHT_PATH) throw error;
  playwright = require(path.join(homedir(), ".cache", "codex-runtimes",
    "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright"));
}

const root = fileURLToPath(new URL("../", import.meta.url));
const qa = path.join(root, ".qa");
const mime = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".woff2": "font/woff2", ".pdf": "application/pdf", ".csv": "text/csv",
};
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const filename = path.join(root, pathname === "/" ? "index.html" : pathname);
  try {
    const content = await readFile(filename);
    response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const launch = { headless: true };
if (process.env.BROWSER_EXECUTABLE_PATH) launch.executablePath = process.env.BROWSER_EXECUTABLE_PATH;
else if (process.platform === "win32") launch.channel = "msedge";

let browser;
let checks = 0;
const errors = [];
const viewports = [1440, 1024, 768, 700, 640, 601, 390, 320];
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

try {
  await mkdir(qa, { recursive: true });
  browser = await playwright.chromium.launch(launch);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    for (const image of document.images) image.loading = "eager";
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => image.hasAttribute("src")).map((image) => image.decode()));
  });

  const motivation = page.locator('[data-figure="assets/oversight-motivation.webp"]');
  check(await motivation.count() === 1, "Paper Figure 1 is available at the beginning");
  check(await motivation.evaluate((button) => button.closest(".hero") !== null), "Motivation figure is in the hero");
  await motivation.click();
  await page.locator("#expanded-figure").evaluate((image) => image.decode());
  check(await page.locator("#figure-dialog").evaluate((dialog) => dialog.open), "Motivation figure expands");
  check(await page.locator("#expanded-figure").getAttribute("src") === "assets/oversight-motivation.webp", "Expanded figure uses the motivation asset");
  check((await page.locator("#figure-dialog-title").textContent()).includes("oversight"), "Motivation dialog has its own title");
  await page.keyboard.press("Escape");
  check(!(await page.locator("#figure-dialog").evaluate((dialog) => dialog.open)), "Escape closes the figure");
  check(await motivation.evaluate((button) => button === document.activeElement), "Closing the figure restores focus");

  const dimensions = page.locator(".oversight-dimensions .dimension-card");
  check(await dimensions.count() === 2, "Benchmark presents two oversight dimensions");
  const alignment = await dimensions.nth(0).innerText();
  const decisions = await dimensions.nth(1).innerText();
  check(alignment.includes("Alignment between requirements and behavior") && alignment.includes("SpecGAP") && alignment.includes("SilentSwap"), "Alignment dimension covers both repository benchmarks");
  check(decisions.includes("Awareness and verification of consequential decisions") && decisions.includes("FeedbackTrace"), "Decision-verification dimension covers FeedbackTrace");
  check(alignment.includes("Input-side") && alignment.includes("Output-side"), "Requirement gaps and behavior deviations show input and output coverage");
  check(await page.locator("main section").last().getAttribute("id") === "resources", "Resources is the final section");
  check(await page.locator("#resources").evaluate((section) => section.previousElementSibling?.id === "harness"), "Harness installation and usage immediately precede Resources");
  check(await page.locator("#harness pre").count() > 0, "Harness section includes runnable commands");
  await page.locator(".harness-custom summary").click();
  check(await page.locator(".harness-custom").evaluate((details) => details.open), "Custom harness setup can be expanded");
  await page.locator(".harness-custom summary").click();

  const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
  for (const href of new Set(links)) {
    const url = new URL(href);
    if (url.origin !== origin) continue;
    if (url.pathname === "/" && url.hash) {
      check(await page.evaluate((id) => document.getElementById(id) !== null, decodeURIComponent(url.hash.slice(1))), `Anchor exists: ${url.hash}`);
    } else {
      url.hash = "";
      check((await page.request.get(url.href)).status() === 200, `Local resource loads: ${url.pathname}`);
    }
  }

  for (const task of ["specgap", "silentswap", "feedbacktrace"]) {
    await page.locator(`[data-task="${task}"]`).click();
    check(await page.locator("#benchmark-panel").getAttribute("data-active-task") === task, `Benchmark explorer selects ${task}`);
    check(await page.locator(`[data-task="${task}"]`).getAttribute("aria-selected") === "true", `${task} selection is accessible`);
  }
  await page.locator('[data-task="specgap"]').focus();
  await page.keyboard.press("ArrowRight");
  check(await page.locator('[data-task="silentswap"]').getAttribute("aria-selected") === "true", "Benchmark tabs support arrow keys");
  await page.keyboard.press("End");
  check((await page.locator("#task-description").textContent()).includes("preceding interaction history"), "FeedbackTrace keeps later feedback outside monitor input");

  check(await page.locator("#leaderboard-body tr").count() === 24, "Leaderboard initially includes 24 configurations");
  const scores = () => page.locator("#leaderboard-body td.primary-metric").evaluateAll((cells) => cells.map((cell) => Number(cell.dataset.score)));
  let ordered = await scores();
  check(ordered.every((score, index) => !index || score <= ordered[index - 1]), "Leaderboard initially sorts descending");
  await page.getByRole("button", { name: "Sort by Localization F1", exact: true }).click();
  ordered = await scores();
  check(ordered.every((score, index) => !index || score >= ordered[index - 1]), "Metric sorting reverses order");
  await page.locator("#method-filter").selectOption("EBG");
  check(await page.locator("#leaderboard-body tr").count() === 8, "EBG filter includes eight models");
  await page.locator("#method-filter").selectOption("RepoGraph");
  await page.locator('[data-benchmark="FeedbackTrace"]').click();
  check(await page.locator("#method-filter").inputValue() === "all", "Switching to FeedbackTrace resets inapplicable RepoGraph selection");
  check(await page.locator("#leaderboard-body tr").count() === 16, "FeedbackTrace includes its 16 applicable configurations");
  check(await page.locator('#method-filter option[value="RepoGraph"]').evaluate((option) => option.disabled), "RepoGraph is disabled for FeedbackTrace");
  await page.locator('[data-task="specgap"]').click();
  await page.locator('[data-benchmark="SpecGap"]').click();

  for (const width of viewports) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1100 });
    await page.evaluate(async () => {
      scrollTo(0, 0);
      await new Promise(requestAnimationFrame);
      await Promise.all([...document.images].filter((image) => image.hasAttribute("src")).map((image) => image.decode()));
    });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`);
    check(await page.locator("img[src]").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), `All images load at ${width}px`);
    if (width > 600) {
      check(await page.locator(".nav-links a").evaluateAll((links) =>
        links.every((link) => link.getBoundingClientRect().height <= parseFloat(getComputedStyle(link).lineHeight) + 1)),
      `Desktop navigation stays on one line at ${width}px`);
    }
    if (width === 1440 || width === 390) {
      const name = width === 1440 ? "desktop" : "mobile";
      for (const [section, selector] of [["hero", ".hero"], ["dimensions", ".oversight-dimensions"], ["stats", ".stats-strip"], ["case-study", "#case-study"], ["harness", "#harness"]]) {
        await page.locator(selector).screenshot({
          path: path.join(qa, `${name}-${section}.png`),
          style: ".skip-link { visibility: hidden; }",
        });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator(".menu-toggle").click();
  check(await page.locator(".menu-toggle").getAttribute("aria-expanded") === "true", "Mobile navigation opens");
  await page.locator('.nav-links a[href="#harness"]').click();
  check(await page.locator(".menu-toggle").getAttribute("aria-expanded") === "false", "Mobile navigation closes after selecting the harness");
  check(new URL(page.url()).hash === "#harness", "Navigation reaches the harness tutorial");
  check(errors.length === 0, `No runtime or resource errors: ${errors.join(", ")}`);
  console.log(JSON.stringify({ passed: checks, viewports, errors, screenshots: qa }, null, 2));
} finally {
  await browser?.close();
  server.close();
}
