import { spawn } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { chromium } from "playwright";
import * as settingsModel from "./blog20.model.js";
import * as draftsModel from "./blog20.drafts.model.js";

const SESSION_DIR = path.join(process.cwd(), "storage", "blog-2.0");
const SESSION_FILE = path.join(SESSION_DIR, "mailerlite-session.json");
const PROFILE_DIR = path.join(SESSION_DIR, "browser-profile");
const DEBUG_DIR = path.join(process.cwd(), "uploads", "blog20-bot-debug");
const BOT_TIMEOUT_MS = Number(process.env.BLOG_20_BOT_TIMEOUT_MS) || 5 * 60 * 1000;

let botBusy = false;

function logStep(message) {
  console.log(`[blog-2.0-bot] ${message}`);
}

async function withBotLock(fn) {
  if (botBusy) {
    const err = new Error(
      "MailerLite bot is already running. Wait for it to finish before starting another job.",
    );
    err.status = 409;
    throw err;
  }
  botBusy = true;
  try {
    return await fn();
  } finally {
    botBusy = false;
  }
}

async function withBotTimeout(fn, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `MailerLite bot timed out after ${Math.round(BOT_TIMEOUT_MS / 1000)}s (${label}).`,
      );
      err.status = 504;
      reject(err);
    }, BOT_TIMEOUT_MS);
  });
  try {
    const work = typeof fn === "function" ? fn() : fn;
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function useHeadedBrowser() {
  return (
    process.env.BLOG_20_BOT_HEADED === "1" ||
    Boolean(process.env.DISPLAY)
  );
}

const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

function hasBrowserProfile() {
  try {
    return fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0;
  } catch {
    return false;
  }
}

function hasSavedLogin() {
  if (process.platform === "linux") {
    return fs.existsSync(SESSION_FILE);
  }
  return hasBrowserProfile() || fs.existsSync(SESSION_FILE);
}

function sessionJsonMissingOnLinuxError() {
  const err = new Error(
    "Missing storage/blog-2.0/mailerlite-session.json on server. " +
      "Windows browser-profile does NOT work on Linux. From your PC run: " +
      'scp "d:\\important files\\Tech2globe\\tech2globe-backend\\storage\\blog-2.0\\mailerlite-session.json" ' +
      "root@103.174.102.70:/root/t2g_backend/storage/blog-2.0/",
  );
  err.status = 500;
  return err;
}

/** Windows Chrome profile cookies are OS-encrypted and fail on Linux — use Playwright JSON there. */
function shouldUseSessionJson() {
  if (process.env.BLOG20_USE_SESSION_JSON === "0") return false;
  if (!fs.existsSync(SESSION_FILE)) return false;
  if (process.env.BLOG20_USE_SESSION_JSON === "1") return true;
  return process.platform === "linux";
}

function shouldUseInstalledChrome({ headed, useChromeChannel } = {}) {
  if (process.env.BLOG20_USE_CHROME === "0") return false;
  return (
    useChromeChannel ||
    process.env.BLOG20_USE_CHROME === "1" ||
    (process.platform === "win32" && headed)
  );
}

function buildPersistentContextOptions({ headed, useChromeChannel } = {}) {
  const useChrome = shouldUseInstalledChrome({ headed, useChromeChannel });
  const options = {
    headless: !headed,
    timeout: 30000,
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  };

  if (useChrome) {
    options.channel = process.env.BLOG20_CHROME_CHANNEL || "chrome";
    if (process.platform === "win32" && headed) {
      // No Playwright flags (--no-sandbox etc.) — Cloudflare Turnstile rejects them.
      options.ignoreDefaultArgs = true;
      options.args = [];
    } else {
      options.ignoreDefaultArgs = ["--enable-automation"];
    }
  } else {
    options.args =
      headed && process.platform === "win32"
        ? ["--disable-dev-shm-usage"]
        : BROWSER_ARGS;
    options.userAgent = BOT_USER_AGENT;
  }

  return { options, useChrome };
}

/** Persistent browser profile — keeps MailerLite login across runs (more reliable than JSON cookies). */
async function launchBotContext({ headedOverride, useChromeChannel } = {}) {
  const headed =
    headedOverride !== undefined ? headedOverride : useHeadedBrowser();
  if (!headed && hasSavedLogin()) {
    logStep(
      "No DISPLAY — use xvfb-run for push/save-session: xvfb-run -a npm run test:blog20-push -- <id>",
    );
  }
  ensureDirs();
  if (process.platform === "linux") {
    logStep(
      `Session file ${SESSION_FILE} — ${fs.existsSync(SESSION_FILE) ? "found" : "MISSING"}`,
    );
    if (!fs.existsSync(SESSION_FILE)) {
      throw sessionJsonMissingOnLinuxError();
    }
  }
  const { options, useChrome } = buildPersistentContextOptions({
    headed,
    useChromeChannel,
  });
  if (shouldUseSessionJson()) {
    logStep("Using MailerLite session JSON (Linux — Windows browser profile cookies do not transfer)");
    const browser = await chromium.launch({
      headless: !headed,
      timeout: 30000,
      args: BROWSER_ARGS,
    });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent: BOT_USER_AGENT,
      locale: "en-US",
      timezoneId: "America/New_York",
      storageState: SESSION_FILE,
    });
    const page = await context.newPage();
    return {
      context,
      page,
      headed,
      close: async () => {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      },
    };
  }

  if (useChrome) {
    logStep(
      `Using installed ${options.channel} (better Cloudflare/Turnstile than bundled Chromium)`,
    );
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, options);
  const page = context.pages()[0] || await context.newPage();
  return {
    context,
    page,
    headed,
    close: async () => {
      await context.close().catch(() => {});
    },
  };
}

const SAVE_SESSION_CDP_PORT = Number(process.env.BLOG20_CDP_PORT) || 9333;

function findWindowsChrome() {
  const candidates = [
    process.env.BLOG20_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function waitForTcpPort(port, host = "127.0.0.1", timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for Chrome on port ${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

/** Windows: spawn real Chrome (no Playwright flags) and attach over CDP for Cloudflare-friendly login. */
async function launchWindowsChromeCdpContext() {
  const chromePath = findWindowsChrome();
  if (!chromePath) {
    const err = new Error(
      "Google Chrome not found. Install Chrome or set BLOG20_CHROME_PATH to chrome.exe",
    );
    err.status = 500;
    throw err;
  }

  ensureDirs();
  const port = SAVE_SESSION_CDP_PORT;
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ];

  logStep(`Opening Google Chrome for manual login (no automation flags, CDP ${port})`);
  const chromeProc = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  chromeProc.unref();

  await waitForTcpPort(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) {
    const err = new Error("Chrome started but Playwright could not attach a browser context");
    err.status = 500;
    throw err;
  }
  const page = context.pages()[0] || await context.newPage();

  return {
    context,
    page,
    headed: true,
    close: async () => {
      await browser.close().catch(() => {});
      if (chromeProc.pid) {
        spawn("taskkill", ["/PID", String(chromeProc.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      }
    },
  };
}

async function launchSaveSessionContext() {
  if (process.platform === "win32" && process.env.BLOG20_CDP_SAVE !== "0") {
    return await launchWindowsChromeCdpContext();
  }
  return await launchBotContext({
    headedOverride: true,
    useChromeChannel: true,
  });
}

export const BOT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function getBotContextOptions(extra = {}) {
  return {
    viewport: { width: 1366, height: 900 },
    userAgent: BOT_USER_AGENT,
    locale: "en-US",
    timezoneId: "America/New_York",
    ...extra,
  };
}

function ensureDirs() {
  for (const dir of [SESSION_DIR, PROFILE_DIR, DEBUG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

async function persistLoginBackup(context) {
  try {
    await context.storageState({ path: SESSION_FILE });
  } catch {
    /* profile is primary; JSON backup is optional */
  }
}

async function captureDebug(page, label) {
  ensureDirs();
  const stamp = `${Date.now()}-${label.replace(/\W+/g, "-")}`;
  const png = path.join(DEBUG_DIR, `${stamp}.png`);
  const html = path.join(DEBUG_DIR, `${stamp}.html`);
  try {
    await page.screenshot({ path: png, fullPage: true });
    const content = await page.content();
    fs.writeFileSync(html, content, "utf8");
    return { screenshot: png, html };
  } catch {
    return null;
  }
}

async function dismissOverlays(page) {
  for (const label of ["Accept all", "Accept", "Allow all", "Got it", "I agree"]) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function fillReactInput(page, locator, value) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
  await locator.click();
  await locator.evaluate((el, text) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await locator.blur();
}

async function typeIntoInput(page, locator, value) {
  await fillReactInput(page, locator, value);
  const current = await locator.inputValue().catch(() => "");
  if (current !== value) {
    await locator.click();
    await locator.pressSequentially(value, { delay: 40 });
    await locator.dispatchEvent("input");
    await locator.dispatchEvent("change");
  }
}

async function typeLikeHuman(page, locator, text) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
  await locator.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 55 });
  await locator.dispatchEvent("input");
  await locator.dispatchEvent("change");
  await locator.blur();
}

async function submitLoginForm(page) {
  const emailInput = page
    .locator('input[type="email"], input[data-test-id="email-input"]')
    .first();
  const passInput = page.locator('input[type="password"]').first();
  const submit = page
    .locator('#login-submit-button, [data-test-id="signin-button"], button[type="submit"]')
    .first();
  await submit.waitFor({ state: "visible", timeout: 30000 });

  await passInput.click().catch(() => {});
  await page.waitForTimeout(300);
  await emailInput.click().catch(() => {});
  await page.waitForTimeout(300);
  await passInput.click().catch(() => {});
  await page.keyboard.press("Tab");
  await page.waitForTimeout(800);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await submit.isEnabled().catch(() => false)) {
      logStep("Clicking MailerLite Log in button");
      await submit.click({ timeout: 10000 });
      return;
    }
    await page.waitForTimeout(500);
  }

  const emailVal = await emailInput.inputValue().catch(() => "");
  const passLen = (await passInput.inputValue().catch(() => "")).length;

  if (emailVal.length > 3 && passLen > 3) {
    logStep("Login button still disabled — trying programmatic submit");
    const clicked = await page
      .evaluate(() => {
        const btn = document.querySelector(
          '#login-submit-button, [data-test-id="signin-button"], button[type="submit"]',
        );
        if (!btn) return false;
        btn.removeAttribute("disabled");
        btn.disabled = false;
        btn.click();
        return true;
      })
      .catch(() => false);
    if (clicked) {
      await page.waitForTimeout(3000);
      return;
    }
  }

  await captureDebug(page, "login-submit-disabled");
  const err = new Error(
    `MailerLite login button stayed disabled (email chars: ${emailVal.length}, password chars: ${passLen}). Headless login may be blocked — run: xvfb-run -a npm run blog20:save-session`,
  );
  err.status = 400;
  throw err;
}

async function tryOpenDashboardFromAccounts(page) {
  const clicked = await page
    .evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="dashboard.mailerlite.com"]')];
      const preferred =
        links.find((a) => /dashboard|open app|go to/i.test(a.textContent || "")) || links[0];
      if (!preferred) return false;
      preferred.click();
      return true;
    })
    .catch(() => false);
  if (!clicked) return false;
  await page.waitForTimeout(3000);
  return isOnDashboard(page);
}

async function gotoPage(page, url, label) {
  logStep(`Navigating: ${label}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

function isOnDashboard(page) {
  const url = page.url();
  return url.includes("dashboard.mailerlite.com") && !url.includes("login");
}

async function waitForDashboard(page, timeoutMs = 90000) {
  let portalAttempts = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isOnDashboard(page)) {
      logStep(`Dashboard ready (${page.url()})`);
      return;
    }
    const url = page.url();
    if (url.includes("accounts.mailerlite.com") && !url.includes("login")) {
      portalAttempts += 1;
      if (portalAttempts > 2) break;
      logStep("On accounts portal — trying to open dashboard");
      if (await tryOpenDashboardFromAccounts(page)) continue;
      await gotoPage(page, "https://dashboard.mailerlite.com/", "dashboard");
      continue;
    }
    if (url.includes("login")) break;
    await page.waitForTimeout(1500);
  }

  await captureDebug(page, "dashboard-not-reached");
  const err = new Error(
    `MailerLite login did not reach dashboard (stuck at ${page.url()}). Wrong password, 2FA enabled, or captcha blocked headless login. Re-save bot credentials in admin or complete one manual login on the server.`,
  );
  err.status = 401;
  throw err;
}

async function ensureMailerLiteSession(page, creds) {
  if (hasSavedLogin()) {
    logStep(
      shouldUseSessionJson()
        ? "Trying saved MailerLite session (JSON)"
        : hasBrowserProfile()
          ? "Trying saved MailerLite login (browser profile)"
          : "Trying saved MailerLite session (JSON)",
    );
    const blogUrls = buildBlogUrls(creds.siteId);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        if (page.url().includes("accounts.mailerlite.com") || attempt > 1) {
          logStep(`Opening blog directly (attempt ${attempt})`);
          await gotoPage(page, blogUrls[0], "blog (session)");
          await page.waitForTimeout(2500);
        }
        await openBlogList(page, creds.siteId);
        logStep("Saved session is valid");
        return;
      } catch {
        if (attempt < 3) {
          logStep("Session not on blog yet — retrying dashboard navigation");
          await gotoPage(page, "https://dashboard.mailerlite.com/", "dashboard");
          await page.waitForTimeout(2000);
        }
      }
    }
    await captureDebug(page, "session-invalid");
    const refresh = "xvfb-run -a npm run blog20:save-session";
    const pushHint = "xvfb-run -a npm run test:blog20-push -- <draftId>";
    const err2 = new Error(
      `Saved MailerLite session could not open the blog (at ${page.url()}). ` +
        `Re-save session (wait until you see Create a post): ${refresh}. ` +
        `Then push: ${pushHint}`,
    );
    err2.status = 401;
    throw err2;
  }
  await loginIfNeeded(page, creds);
  await waitForDashboard(page);
}

async function getBotCredentials() {
  const full = await settingsModel.getSettingsWithSecrets();
  const email = full.mailerlite_login_email;
  const password = full.mailerlite_login_password;
  const siteId = full.mailerlite_site_id || "196949098888169226";
  if (!email || !password) {
    const err = new Error(
      "MailerLite bot login email and password are required in Blog-2.0 → MailerLite → Browser bot.",
    );
    err.status = 400;
    throw err;
  }
  if (email.includes("://") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error(
      "Bot login email in settings is invalid (must be a MailerLite account email, not a URL). Re-save in Blog-2.0 → MailerLite.",
    );
    err.status = 400;
    throw err;
  }
  return { email, password, siteId };
}

async function loginIfNeeded(page, { email, password }) {
  const url = page.url();
  if (!url.includes("login") && !url.includes("accounts.mailerlite")) {
    const onApp =
      url.includes("dashboard.mailerlite.com") && !url.includes("login");
    if (onApp) return;
  }

  await gotoPage(page, "https://accounts.mailerlite.com/login", "login page");
  await dismissOverlays(page);

  const emailInput = page
    .locator(
      'input[data-test-id="email-input"], input[type="email"], input[name="email"], input[autocomplete="email"]',
    )
    .first();
  const passInput = page
    .locator('input[data-test-id="password-input"], input[type="password"]')
    .first();

  logStep(`Filling MailerLite login for *@${email.split("@")[1] || "unknown"}`);
  await typeLikeHuman(page, emailInput, email);
  await page.waitForTimeout(700);
  await passInput.click();
  await typeLikeHuman(page, passInput, password);
  await page.waitForTimeout(1000);
  await submitLoginForm(page);
  await page.waitForTimeout(3000);
  await waitForDashboard(page);

  ensureDirs();
  await page.context().storageState({ path: SESSION_FILE });
}

function buildBlogUrls(siteId) {
  return [
    `https://dashboard.mailerlite.com/sites/${siteId}/blog`,
    `https://dashboard.mailerlite.com/sites/${siteId}/blog/posts`,
    `https://dashboard.mailerlite.com/sites/${siteId}`,
  ];
}

async function isMailerLite404Page(page) {
  if (!page.url().includes("dashboard.mailerlite.com")) return false;
  return (
    page
      .locator("text=404 Error")
      .first()
      .isVisible({ timeout: 600 })
      .catch(() => false) ||
    page
      .locator("h1:has-text('Looks like you got lost')")
      .first()
      .isVisible({ timeout: 600 })
      .catch(() => false)
  );
}

async function navigateToBlogViaSitesUi(page) {
  logStep("Opening Sites list — pick your website, then Blog");
  await gotoPage(page, "https://dashboard.mailerlite.com/sites", "sites list");
  await dismissOverlays(page);

  const siteLink = page.locator('a[href*="/sites/"]').first();
  if (await siteLink.isVisible({ timeout: 8000 }).catch(() => false)) {
    await siteLink.click({ timeout: 10000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  const blogNav = page
    .locator('a[href*="/blog"], [role="tab"]:has-text("Blog"), nav a:has-text("Blog")')
    .first();
  if (await blogNav.isVisible({ timeout: 8000 }).catch(() => false)) {
    logStep("Opening Blog section from site navigation");
    await blogNav.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
}

async function findCreatePostButton(page, { timeout = 60000, click = true } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const candidates = [
      page.getByRole("button", { name: /create a post/i }),
      page.getByRole("link", { name: /create a post/i }),
      page.locator('button:has-text("Create a post")'),
      page.locator('a:has-text("Create a post")'),
      page.locator('button:has-text("Create post")'),
      page.locator('[data-test-id*="create-post"], [data-test-id*="create_post"]'),
    ];
    for (const candidate of candidates) {
      const btn = candidate.first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        if (click) {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ timeout: 10000 });
        }
        return btn;
      }
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function ensureBlogPostsPage(page, siteId) {
  const urls = buildBlogUrls(siteId);

  for (const url of urls) {
    await gotoPage(page, url, "blog posts");
    if (await isMailerLite404Page(page)) {
      logStep(`MailerLite 404 at ${url}`);
      continue;
    }
    await dismissOverlays(page);

    const blogTab = page
      .locator(
        'a[href*="/blog"]:has-text("Blog"), [role="tab"]:has-text("Blog"), nav a:has-text("Blog")',
      )
      .first();
    if (await blogTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      logStep("Opening Blog tab");
      await blogTab.click().catch(() => {});
      await page.waitForTimeout(2500);
    }

    const createBtn = await findCreatePostButton(page, { timeout: 12000, click: false });
    if (createBtn) {
      logStep(`Blog posts page ready (${page.url()})`);
      return;
    }
  }

  await navigateToBlogViaSitesUi(page);
  const viaUi = await findCreatePostButton(page, { timeout: 12000, click: false });
  if (viaUi) {
    logStep(`Blog posts page ready via Sites UI (${page.url()})`);
    return;
  }

  await captureDebug(page, "blog-posts-page-missing");
  const err = new Error(
    `Could not open MailerLite blog posts page (current URL: ${page.url()}). ` +
      `Site ID ${siteId} may be wrong, or this account has no website/blog yet. ` +
      `In MailerLite go to Sites, open the client website, then Blog — copy the site ID from the URL.`,
  );
  err.status = 500;
  throw err;
}

async function openBlogList(page, siteId) {
  if (
    isOnDashboard(page) &&
    page.url().includes("/blog") &&
    (await findCreatePostButton(page, { timeout: 5000, click: false }))
  ) {
    logStep("Already on MailerLite blog posts page");
    return;
  }
  await ensureBlogPostsPage(page, siteId);
}

async function findPostOnBlogList(page, title) {
  const snippet = String(title || "").trim().slice(0, 48);
  if (!snippet) return false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const match = page.getByText(snippet, { exact: false }).first();
    if (await match.isVisible({ timeout: 2500 }).catch(() => false)) {
      return true;
    }
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(600);
  }
  return false;
}

async function clickEnabledButton(page, labels) {
  for (const label of labels) {
    const loose = page.locator(`button:not([disabled]):has-text("${label}")`).first();
    if (await loose.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loose.click({ timeout: 10000 });
      return true;
    }
  }
  return false;
}

function isMailerLiteContentUrl(url = "") {
  return /\/sites\/\d+\/content\/[^/?#]+/i.test(url);
}

function isMailerLitePostUrl(url = "") {
  return (
    /\/blog\/posts\/[^/?#]+/i.test(url) &&
    !/\/blog\/posts\/(new|create)/i.test(url)
  );
}

function isPostCreateSuccessUrl(url = "") {
  const normalized = String(url || "").trim();
  return isMailerLiteContentUrl(normalized) || isMailerLitePostUrl(normalized);
}

async function waitForPostCreateNavigation(page, timeoutMs = 28000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (isPostCreateSuccessUrl(url)) return url;
    await page.waitForTimeout(450);
  }
  return page.url();
}

async function isBlogEditorOpen(page) {
  const url = page.url();
  if (/\/posts\/[^/]+\/(edit|content|write)/i.test(url)) return true;
  if (isMailerLiteContentUrl(url)) {
    const editor = page.locator(
      '[contenteditable="true"], .ProseMirror, [data-test-id*="editor"], textarea[class*="editor"], iframe[title*="editor" i]',
    );
    if (await editor.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      return true;
    }
    return false;
  }
  if (await page
    .locator(
      '[contenteditable="true"], .ProseMirror, [data-test-id*="editor"], [class*="editor"] [contenteditable]',
    )
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false)) {
    return true;
  }
  return false;
}

async function logVisibleButtons(page, label = "debug") {
  const sample = await page
    .evaluate(() =>
      [...document.querySelectorAll("button, a")]
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t && t.length < 80)
        .slice(0, 20),
    )
    .catch(() => []);
  if (sample.length) {
    logStep(`${label} buttons: ${sample.join(" | ")}`);
  }
}

async function clickPostInBlogList(page, title) {
  const snippet = String(title || "").trim().slice(0, 48);
  if (!snippet) return false;

  const postLink = page
    .locator(`a[href*="/blog/posts/"]`)
    .filter({ hasText: snippet })
    .first();
  if (await postLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    logStep(`Opening post link: ${snippet.slice(0, 40)}`);
    await postLink.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    return page.url().includes("/posts/");
  }

  const row = page
    .locator(
      `tr:has-text("${snippet}"), [role="row"]:has-text("${snippet}"), [class*="post"]:has-text("${snippet}")`,
    )
    .first();
  if (await row.isVisible({ timeout: 4000 }).catch(() => false)) {
    logStep(`Opening existing post row: ${snippet.slice(0, 40)}`);
    await row.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (page.url().includes("/posts/")) return true;
  }

  const titleHit = page.getByText(snippet, { exact: false }).first();
  if (await titleHit.isVisible({ timeout: 4000 }).catch(() => false)) {
    await titleHit.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const nearbyLink = page.locator(`a[href*="/blog/posts/"]`).first();
    if (await nearbyLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nearbyLink.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      return page.url().includes("/posts/");
    }
  }

  const editBtn = page
    .locator(
      `button:has-text("Edit"), a:has-text("Edit"), [aria-label*="Edit" i]`,
    )
    .first();
  if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await editBtn.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    return page.url().includes("/posts/");
  }

  return false;
}

async function clickSetupContinueButton(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(600);

  const labels = [
    "Save and edit content",
    "Save & edit content",
    "Save and edit",
    "Save & edit",
    "Save and continue",
    "Edit content",
    "Start writing",
    "Write content",
    "Go to editor",
    "Open editor",
    "Continue",
    "Next",
    "Edit post",
  ];
  if (await clickEnabledButton(page, labels)) {
    return true;
  }

  const roleBtn = page.getByRole("button", { name: /save.*edit/i }).first();
  if (await roleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await roleBtn.click({ timeout: 10000 }).catch(() => {});
    return true;
  }

  const loose = page.locator("button, a").filter({ hasText: /save.*edit|edit content|start writing/i }).first();
  if (await loose.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loose.click({ timeout: 10000 }).catch(() => {});
    return true;
  }

  const clicked = await page
    .evaluate(() => {
      const candidates = [...document.querySelectorAll("button, a")];
      const patterns = [
        /save.*edit/i,
        /edit content/i,
        /start writing/i,
        /write content/i,
        /^continue$/i,
        /^next$/i,
      ];
      for (const el of candidates) {
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length > 80) continue;
        if (patterns.some((re) => re.test(text))) {
          el.click();
          return text;
        }
      }
      return null;
    })
    .catch(() => null);

  if (clicked) {
    logStep(`Opened editor via "${clicked}"`);
    return true;
  }

  return false;
}

async function openBlogContentEditor(page, draftTitle = "") {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (await isBlogEditorOpen(page)) {
      logStep("MailerLite content editor already open — skipping setup button");
      return true;
    }

    logStep(`Opening content editor (attempt ${attempt}, URL: ${page.url()})`);
    if (isMailerLiteContentUrl(page.url()) && attempt === 1) {
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
      await dismissOverlays(page);
    }

    if (draftTitle && page.url().includes("/blog") && !page.url().includes("/posts/")) {
      await clickPostInBlogList(page, draftTitle);
    }

    if (await clickSetupContinueButton(page)) {
      await page.waitForTimeout(3000);
      if (await isBlogEditorOpen(page)) return true;
    }

    await page.waitForTimeout(2000);
  }

  await logVisibleButtons(page, "Post-setup");
  return false;
}

async function findNewPostTitleInput(page) {
  const selectors = [
    '[role="dialog"] input[type="text"]',
    '[class*="modal"] input[type="text"]',
    '[class*="Modal"] input[type="text"]',
    'input[placeholder*="post title" i]',
    'input[placeholder*="title" i]',
    'input[name*="title" i]',
    "form input[type=\"text\"]",
    'main input[type="text"]',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if (await input.isVisible({ timeout: 1500 }).catch(() => false)) {
      return input;
    }
  }
  return null;
}

async function waitForNewPostTitleInput(page, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const input = await findNewPostTitleInput(page);
    if (input) return input;
    await page.waitForTimeout(500);
  }
  return null;
}

async function openNewPostForm(page, siteId) {
  for (const suffix of ["new", "create"]) {
    const path = `/sites/${siteId}/blog/posts/${suffix}`;
    await gotoPage(page, `https://dashboard.mailerlite.com${path}`, "new post page");
    await page.waitForTimeout(2000);
    if (await isMailerLite404Page(page)) continue;
    if (await findNewPostTitleInput(page)) return true;
  }
  return false;
}

async function submitNewPostForm(page, title) {
  const titleInput =
    (await findNewPostTitleInput(page)) || page.locator('input[type="text"]').first();
  if (!(await titleInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { ok: false, reason: "title-input-missing", url: page.url() };
  }

  await titleInput.click({ timeout: 10000 });
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await titleInput.pressSequentially(title, { delay: 35 });
  await titleInput.dispatchEvent("input");
  await titleInput.dispatchEvent("change");
  await page.waitForTimeout(1200);

  const entered = await titleInput.inputValue().catch(() => "");
  if (!entered || entered.length < 3) {
    return { ok: false, reason: `title-not-filled (${entered.length} chars)` };
  }

  const scopes = [
    page.locator('[role="dialog"]'),
    page.locator('[class*="modal"]'),
    page.locator("main"),
    page,
  ];
  let createBtn = null;
  for (const scope of scopes) {
    if (scope !== page && !(await scope.isVisible({ timeout: 400 }).catch(() => false))) {
      continue;
    }
    const candidate = scope
      .locator("button")
      .filter({
        hasText: /^(create($|\s)|save and edit|save & edit|continue|next)/i,
      })
      .last();
    if (!(await candidate.isVisible({ timeout: 2000 }).catch(() => false))) continue;

    for (let i = 0; i < 30; i += 1) {
      if (await candidate.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(300);
    }
    if (!(await candidate.isEnabled().catch(() => false))) continue;
    createBtn = candidate;
    break;
  }

  if (!createBtn) {
    return { ok: false, reason: "create-button-missing", url: page.url() };
  }

  logStep("Clicking create/save on new post form");
  await createBtn.click({ timeout: 10000 });
  const url = await waitForPostCreateNavigation(page, 28000);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  if (isPostCreateSuccessUrl(url)) {
    logStep(`Post shell ready at ${url}`);
    return { ok: true, mode: isMailerLiteContentUrl(url) ? "content-url" : "url" };
  }
  if (await findPostOnBlogList(page, title)) return { ok: true, mode: "list" };
  if (await isBlogEditorOpen(page)) return { ok: true, mode: "editor" };
  if (await clickSetupContinueButton(page)) {
    await page.waitForTimeout(2000);
    if (await isBlogEditorOpen(page)) return { ok: true, mode: "editor-after-save" };
  }

  const finalUrl = page.url();
  if (isPostCreateSuccessUrl(finalUrl)) {
    logStep(`Post shell ready (late) at ${finalUrl}`);
    return { ok: true, mode: isMailerLiteContentUrl(finalUrl) ? "content-url-late" : "url-late" };
  }

  return { ok: false, reason: "no-post-created", url: finalUrl };
}

async function extractBlogPostId(page) {
  const match = page.url().match(/\/blog\/posts\/([^/?#]+)/i);
  const id = match?.[1];
  if (!id || id === "new" || id === "create") return null;
  return id;
}

async function tryOpenPostEditorByUrl(page, siteId) {
  const contentMatch = page.url().match(/\/content\/([^/?#]+)/i);
  if (contentMatch?.[1]) {
    logStep(`On MailerLite content page (${contentMatch[1]}) — opening editor`);
    if (await isBlogEditorOpen(page)) return true;
    if (await clickSetupContinueButton(page)) {
      await page.waitForTimeout(2500);
      if (await isBlogEditorOpen(page)) return true;
    }
    for (const suffix of ["edit", "write", ""]) {
      const path = suffix
        ? `/sites/${siteId}/content/${contentMatch[1]}/${suffix}`
        : `/sites/${siteId}/content/${contentMatch[1]}`;
      await gotoPage(page, `https://dashboard.mailerlite.com${path}`, "content editor URL");
      if (await isBlogEditorOpen(page)) return true;
      if (await clickSetupContinueButton(page)) {
        await page.waitForTimeout(2500);
        if (await isBlogEditorOpen(page)) return true;
      }
    }
  }

  let postId = await extractBlogPostId(page);
  if (!postId) {
    postId = await page
      .evaluate(() => {
        const link = document.querySelector('a[href*="/blog/posts/"]');
        const href = link?.getAttribute("href") || "";
        const m = href.match(/\/blog\/posts\/([^/?#]+)/i);
        const id = m?.[1];
        return id && id !== "new" && id !== "create" ? id : null;
      })
      .catch(() => null);
  }
  if (!postId) return false;

  const suffixes = ["edit", "content", "write", ""];
  for (const suffix of suffixes) {
    const path = suffix
      ? `/sites/${siteId}/blog/posts/${postId}/${suffix}`
      : `/sites/${siteId}/blog/posts/${postId}`;
    await gotoPage(page, `https://dashboard.mailerlite.com${path}`, "post editor URL");
    if (await isBlogEditorOpen(page)) return true;
    if (await clickSetupContinueButton(page)) {
      await page.waitForTimeout(2500);
      if (await isBlogEditorOpen(page)) return true;
    }
  }
  return false;
}

async function createBlogDraft(page, draft, siteId) {
  logStep(`Creating MailerLite post: ${draft.title.slice(0, 80)}`);
  await dismissOverlays(page);
  await openBlogList(page, siteId);

  logStep("Clicking Create a post on MailerLite blog");
  const createBtn = await findCreatePostButton(page, { timeout: 25000, click: true });
  if (!createBtn) {
    await captureDebug(page, "create-post-button-missing");
    const err = new Error(
      `Create a post button not found (${page.url()}). Check uploads/blog20-bot-debug/.`,
    );
    err.status = 500;
    throw err;
  }
  await page.waitForTimeout(1500);
  logStep(`After Create a post click: ${page.url()}`);

  const titleInput = await waitForNewPostTitleInput(page, 25000);
  if (!titleInput) {
    await captureDebug(page, "create-title-input-missing");
    await logVisibleButtons(page, "After-Create-a-post");
    const err = new Error(
      `Title input did not appear after Create a post (${page.url()}). Check uploads/blog20-bot-debug/.`,
    );
    err.status = 500;
    throw err;
  }

  logStep("Filling new post title in MailerLite");
  const createResult = await submitNewPostForm(page, draft.title);
  if (!createResult.ok) {
    await captureDebug(page, "create-title-stuck");
    const err = new Error(
      `MailerLite did not create the post (${createResult.reason || "unknown"} at ${createResult.url || page.url()}).`,
    );
    err.status = 500;
    throw err;
  }
  logStep(`Post created (${createResult.mode || "ok"})`);
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page
    .waitForURL(
      (u) => isPostCreateSuccessUrl(u.toString()) || u.toString().includes("/blog"),
      { timeout: 20000 },
    )
    .catch(() => {});
  logStep(`Post-create URL: ${page.url()}`);
  await page.waitForTimeout(2500);

  const onContentSetup = isMailerLiteContentUrl(page.url());

  const excerptArea = page
    .locator(
      'textarea[name*="excerpt" i], textarea[placeholder*="excerpt" i], label:has-text("Excerpt") + textarea, textarea:visible',
    )
    .first();
  if (await excerptArea.isVisible({ timeout: 5000 }).catch(() => false)) {
    await typeIntoInput(page, excerptArea, draft.excerpt || draft.title.slice(0, 160));
    await page.waitForTimeout(800);
  }

  if (!page.url().includes("/posts/") && !onContentSetup) {
    await clickPostInBlogList(page, draft.title);
    logStep(`After opening post from list: ${page.url()}`);
  }

  await tryOpenPostEditorByUrl(page, siteId);

  logStep("Opening MailerLite content editor");
  const openedEditor = await openBlogContentEditor(page, draft.title);
  if (!openedEditor) {
    await captureDebug(page, "save-edit-missing");
    const buttons = await page
      .evaluate(() =>
        [...document.querySelectorAll("button, a")]
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter((t) => t && t.length < 80)
          .slice(0, 12),
      )
      .catch(() => []);
    const err = new Error(
      `Could not open MailerLite content editor at ${page.url()}. ` +
        `Buttons seen: ${buttons.join(" | ") || "none"}. ` +
        "Check uploads/blog20-bot-debug/.",
    );
    err.status = 500;
    throw err;
  }
  await page.waitForTimeout(4000);

  const html = String(draft.content || "").trim();
  const plainBody = html.replace(/<h1[^>]*>.*?<\/h1>/i, "").trim();
  const codeBtn = page.locator('button:has-text("HTML"), button:has-text("Code")').first();
  if (await codeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await codeBtn.click();
    await page.waitForTimeout(800);
  }

  const editable = page.locator('[contenteditable="true"]').first();
  const bodyTextarea = page.locator("textarea").first();
  if (await editable.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editable.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText(plainBody);
  } else if (await bodyTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bodyTextarea.fill(plainBody);
  } else {
    await captureDebug(page, "editor-missing");
    const err = new Error("MailerLite content editor not found after opening post.");
    err.status = 500;
    throw err;
  }

  await page.waitForTimeout(1200);

  logStep("Saving post as draft in MailerLite editor");
  let saved = await clickEnabledButton(page, ["Save as draft", "Save draft"]);
  if (!saved) {
    saved = await clickEnabledButton(page, ["Save"]);
    if (saved) {
      await page.waitForTimeout(500);
      saved = await clickEnabledButton(page, ["Save as draft", "Save draft"]);
    }
  }

  if (!saved) {
    await captureDebug(page, "save-draft-missing");
    const err = new Error(
      "Could not find Save as draft in MailerLite editor. Check uploads/blog20-bot-debug/.",
    );
    err.status = 500;
    throw err;
  }

  await page.waitForTimeout(4000);

  const settings = await settingsModel.getSettings();
  const blogBase =
    settings.client_blog_url ||
    `https://dashboard.mailerlite.com/sites/${siteId}/blog`;

  await openBlogList(page, siteId);
  const foundOnList = await findPostOnBlogList(page, draft.title);
  if (!foundOnList) {
    await captureDebug(page, "post-not-on-list");
    const err = new Error(
      `Post may be saved but "${draft.title.slice(0, 60)}" was not found on the MailerLite blog list. Try filter "Drafts" or "All posts".`,
    );
    err.status = 500;
    throw err;
  }

  await captureDebug(page, "push-ok");

  return {
    ok: true,
    title: draft.title,
    slug: draft.slug,
    mailerlite_dashboard_url: blogBase,
    note: `Draft "${draft.title}" created on MailerLite. It may show as unpublished/draft in Posts.`,
  };
}

export async function testMailerLiteBotLogin() {
  return withBotLock(async () =>
    withBotTimeout(async () => {
      const creds = await getBotCredentials();
      const { context, page } = await launchBotContext();
      try {
        context.setDefaultTimeout(60000);
        await ensureMailerLiteSession(page, creds);
        if (!page.url().includes("/blog")) {
          await openBlogList(page, creds.siteId);
        }
        await captureDebug(page, "bot-test-ok");
        await persistLoginBackup(context);
        return {
          ok: true,
          message: "Bot logged in and opened MailerLite blog list.",
          url: page.url(),
        };
      } finally {
        await context.close().catch(() => {});
      }
    }, "login test"),
  );
}

export async function pushDraftToMailerLite(draftId) {
  return withBotLock(async () =>
    withBotTimeout(async () => {
      logStep(`Push started for draft #${draftId}`);
      const draft = await draftsModel.getDraftById(draftId);
      if (!draft) {
        const err = new Error(`Draft ${draftId} not found`);
        err.status = 404;
        throw err;
      }

      const settings = await settingsModel.getSettings();
      if (!settings.mailerlite_bot_enabled) {
        const err = new Error(
          "MailerLite browser bot is disabled. Enable it in Blog-2.0 → MailerLite.",
        );
        err.status = 400;
        throw err;
      }

      const creds = await getBotCredentials();
      ensureDirs();

      await draftsModel.updateDraftPushStatus(draftId, {
        mailerlite_push_status: "processing",
        mailerlite_push_error: null,
      });

      const { context, page } = await launchBotContext();

      try {
        context.setDefaultTimeout(60000);
        logStep("Ensuring MailerLite session");
        await ensureMailerLiteSession(page, creds);
        if (!page.url().includes("/blog")) {
          logStep("Opening MailerLite blog list");
          await openBlogList(page, creds.siteId);
        }
        const result = await createBlogDraft(page, draft, creds.siteId);
        logStep(`Push completed for draft #${draftId}`);
        await persistLoginBackup(context);

        await draftsModel.updateDraftPushStatus(draftId, {
          mailerlite_push_status: "pushed",
          mailerlite_pushed_at: new Date(),
          mailerlite_push_error: null,
        });

        return { draftId, ...result };
      } catch (err) {
        await draftsModel.updateDraftPushStatus(draftId, {
          mailerlite_push_status: "failed",
          mailerlite_push_error: err.message,
        });
        throw err;
      } finally {
        await context.close().catch(() => {});
      }
    }, `push draft ${draftId}`),
  );
}

const SETUP_STEPS = [
  { id: 1, key: "started", label: "Script started — opening MailerLite" },
  { id: 2, key: "login", label: "Login page — enter your MailerLite email & password" },
  { id: 3, key: "accounts", label: "Accounts portal — completing sign-in" },
  { id: 4, key: "dashboard", label: "Dashboard reached" },
  { id: 5, key: "blog", label: "Blog section opened (Tech2globe site)" },
  { id: 6, key: "ready", label: 'Blog posts page ready — "Create a post" visible' },
  { id: 7, key: "saved", label: "Session saved successfully" },
];

function logSetupStep(step, extra = "") {
  const suffix = extra ? ` — ${extra}` : "";
  console.log(`[blog-2.0-setup] Step ${step.id}/7: ${step.label}${suffix}`);
}

async function hasVisibleLoginForm(page) {
  return page
    .locator('input[type="password"], input[data-test-id="password-input"]')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

async function isMailerLiteVerificationPage(page) {
  const url = page.url();
  if (/\/verify-email|\/verify\b|\/mfa|two-factor/i.test(url)) return true;
  if (
    await page
      .locator('text=Login verification')
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false)
  ) {
    return true;
  }
  return page
    .locator('button:has-text("Send email code")')
    .first()
    .isVisible({ timeout: 400 })
    .catch(() => false);
}

async function detectSetupStep(page, siteId) {
  const url = page.url();
  if (await isMailerLite404Page(page)) return "lost";
  if (url.includes("/login")) return "login";
  if (await isMailerLiteVerificationPage(page)) return "verify";
  if (url.includes("accounts.mailerlite.com")) {
    if (await hasVisibleLoginForm(page)) return "login";
    return "accounts";
  }
  if (url.includes("dashboard.mailerlite.com") && url.includes("/blog")) {
    const hasCreate = await findCreatePostButton(page, { timeout: 1500, click: false });
    if (hasCreate) return "ready";
    return "blog";
  }
  if (url.includes("dashboard.mailerlite.com")) return "dashboard";
  return null;
}

async function autoOpenBlogFromAccounts(page, siteId) {
  if (await isMailerLite404Page(page)) return;
  logStep("Auto-opening blog URL (accounts portal does not redirect automatically)");
  for (const blogUrl of buildBlogUrls(siteId)) {
    await gotoPage(page, blogUrl, "auto-open blog");
    if (!(await isMailerLite404Page(page))) return;
    logStep(`Blog URL 404: ${blogUrl}`);
  }
  await tryOpenDashboardFromAccounts(page).catch(() => {});
}

/**
 * Watch the browser while the user logs in manually. Logs each milestone once.
 * Resolves when blog posts page is ready (Create a post visible).
 */
export async function watchMailerLiteSetupProgress(page, siteId, { timeoutMs = 15 * 60 * 1000 } = {}) {
  const seen = new Set(["started"]);
  logSetupStep(SETUP_STEPS[0], page.url());

  let lastHintAt = 0;
  let lastAutoNavAt = 0;
  let lastScreenshotAt = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    const current = await detectSetupStep(page, siteId);
    const onVerification = current === "verify";
    const onLost = current === "lost";

    // Stuck on accounts after login — MailerLite often does not auto-redirect
    if (
      url.includes("accounts.mailerlite.com") &&
      !(await hasVisibleLoginForm(page)) &&
      !onVerification &&
      !onLost &&
      Date.now() - lastAutoNavAt > 8000
    ) {
      lastAutoNavAt = Date.now();
      await autoOpenBlogFromAccounts(page, siteId);
    }

    if (current && !seen.has(current)) {
      seen.add(current);
      const step = SETUP_STEPS.find((s) => s.key === current);
      if (step) logSetupStep(step, page.url());
      if (current === "login") {
        console.log(
          "[blog-2.0-setup] Login form visible — enter email & password in THIS browser window.",
        );
      }
      if (current === "verify") {
        console.log(
          "[blog-2.0-setup] Email OTP required — click Send email code, check inbox/spam, enter code.\n" +
            "[blog-2.0-setup] Script will NOT redirect while you are on this page.",
        );
      }
      if (current === "lost") {
        console.log(
          `[blog-2.0-setup] 404 — site ID ${siteId} not found in this MailerLite account.\n` +
            "[blog-2.0-setup] Click Back to Dashboard → Sites → open the CLIENT website → Blog.\n" +
            "[blog-2.0-setup] When you see Create a post, the script will continue (no auto-redirect).",
        );
      }
      if (current === "ready") return { ok: true, steps: [...seen] };
    } else if (Date.now() - lastHintAt > 30000 && !seen.has("ready")) {
      lastHintAt = Date.now();
      const onLogin = await hasVisibleLoginForm(page);
      if (onLogin) {
        console.log(
          "[blog-2.0-setup] Still on LOGIN page — enter credentials in THIS browser window.",
        );
      } else if (onVerification) {
        console.log(
          "[blog-2.0-setup] Still on email verification — finish OTP here (check spam folder).",
        );
      } else if (onLost) {
        console.log(
          "[blog-2.0-setup] Still on 404 — navigate manually: Sites → your website → Blog.",
        );
      } else {
        console.log(
          `[blog-2.0-setup] Still waiting… ${page.url()} — auto-opening blog URL…`,
        );
        await autoOpenBlogFromAccounts(page, siteId);
      }
    }

    if (Date.now() - lastScreenshotAt > 60000) {
      lastScreenshotAt = Date.now();
      const shot = await captureDebug(page, "setup-progress");
      if (shot?.screenshot) {
        console.log(`[blog-2.0-setup] Debug screenshot: ${shot.screenshot}`);
      }
    }

    await page.waitForTimeout(1200);
  }

  const err = new Error(
    "Timed out waiting for MailerLite blog page. Open Sites → Tech2globe → Blog → Posts, then re-run save-session.",
  );
  err.status = 408;
  throw err;
}

/**
 * Manual session save (xvfb-run). Tracks each step while you log in, then auto-saves.
 */
export async function interactiveSaveMailerLiteSession({ waitForUser, autoWatch = true } = {}) {
  let siteId = process.env.BLOG20_SITE_ID || "196949098888169226";
  try {
    const settings = await settingsModel.getSettingsWithSecrets();
    siteId = settings.mailerlite_site_id || siteId;
  } catch {
    logStep(`Using default site ID ${siteId} (DB settings unavailable)`);
  }
  ensureDirs();

  const canHeaded = process.platform === "win32" || Boolean(process.env.DISPLAY);
  if (!canHeaded) {
    const err = new Error(
      "No display available. On server run: npm run blog20:save-session (auto xvfb) " +
        "OR run on Windows PC and copy storage/blog-2.0/browser-profile to server.",
    );
    err.status = 500;
    throw err;
  }

  const session = await launchSaveSessionContext();
  const { context, page } = session;

  try {
    console.log("\n[blog-2.0-setup] Follow along in the browser. Steps will print below:\n");
    console.log(`[blog-2.0-setup] Browser profile: ${PROFILE_DIR}`);
    console.log(`[blog-2.0-setup] Configured site ID: ${siteId}\n`);
    if (process.platform === "win32") {
      console.log(
        "[blog-2.0-setup] Opening real Google Chrome (no --no-sandbox / automation flags).\n" +
          "[blog-2.0-setup] Close any Chrome window from a previous save-session attempt first.\n" +
          "[blog-2.0-setup] If Cloudflare still fails: click Troubleshoot, refresh, or try another network.\n",
      );
    }

    if (process.platform === "linux" && Boolean(process.env.DISPLAY)) {
      console.log(
        "╔══════════════════════════════════════════════════════════════════╗\n" +
          "║  SSH + xvfb: the browser is INVISIBLE — not on your PC screen!   ║\n" +
          "║  Logging into MailerLite on your laptop does NOT help.           ║\n" +
          "║                                                                  ║\n" +
          "║  EASIER: run save-session on your Windows PC instead:            ║\n" +
          "║    cd t2g_backend && npm run blog20:save-session                 ║\n" +
          "║  Then copy folder to server:                                     ║\n" +
          "║    storage/blog-2.0/browser-profile                              ║\n" +
          "╚══════════════════════════════════════════════════════════════════╝\n",
      );
    } else {
      console.log("[blog-2.0-setup] A browser window should open on this PC — log in there.\n");
    }

    await gotoPage(page, "https://dashboard.mailerlite.com/dashboard", "MailerLite dashboard");

    console.log(
      "[blog-2.0-setup] After login: Sites → open the website → Blog → wait for Create a post.\n" +
        "[blog-2.0-setup] If you see 404, the site ID is wrong — use the site that has the blog.\n" +
        "[blog-2.0-setup] Do NOT press Ctrl+C until Step 6/7 auto-save.\n",
    );

    if (autoWatch) {
      await watchMailerLiteSetupProgress(page, siteId);
    } else if (typeof waitForUser === "function") {
      await waitForUser("\nWhen you see Create a post, press Enter…\n");
    }

    logStep("Verifying blog access before saving login");
    const alreadyReady = await findCreatePostButton(page, { timeout: 4000, click: false });
    if (!alreadyReady) {
      await openBlogList(page, siteId);
    }
    await persistLoginBackup(context);
    logSetupStep(SETUP_STEPS[6], PROFILE_DIR);
    logStep(`Login saved to browser profile: ${PROFILE_DIR}`);
    return { ok: true, profileDir: PROFILE_DIR, sessionFile: SESSION_FILE, url: page.url() };
  } finally {
    await session.close().catch(() => {});
  }
}

export const BOT_RUNTIME_VERSION = "2026-09-29-u";
