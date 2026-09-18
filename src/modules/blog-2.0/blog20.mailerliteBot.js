import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import * as settingsModel from "./blog20.model.js";
import * as draftsModel from "./blog20.drafts.model.js";

const SESSION_DIR = path.join(process.cwd(), "storage", "blog-2.0");
const SESSION_FILE = path.join(SESSION_DIR, "mailerlite-session.json");
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

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    timeout: 30000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

function newBotContext(browser) {
  const useSession = fs.existsSync(SESSION_FILE) ? { storageState: SESSION_FILE } : {};
  return browser.newContext({
    ...useSession,
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
}

function ensureDirs() {
  for (const dir of [SESSION_DIR, DEBUG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  if (fs.existsSync(SESSION_FILE)) {
    logStep("Trying saved MailerLite session");
    await gotoPage(
      page,
      `https://dashboard.mailerlite.com/sites/${creds.siteId}/blog/posts`,
      "blog (session)",
    );
    if (
      isOnDashboard(page) &&
      (await findCreatePostButton(page, { timeout: 10000, click: false }))
    ) {
      logStep("Saved session is valid");
      return;
    }
    logStep("Saved session expired — logging in again");
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

  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
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
        if (click) await btn.click({ timeout: 10000 });
        return btn;
      }
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function ensureBlogPostsPage(page, siteId) {
  const urls = [
    `https://dashboard.mailerlite.com/sites/${siteId}/blog/posts`,
    `https://dashboard.mailerlite.com/sites/${siteId}/blog`,
  ];

  for (const url of urls) {
    await gotoPage(page, url, "blog posts");
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

  await captureDebug(page, "blog-posts-page-missing");
  const err = new Error(
    `Could not open MailerLite blog posts page (current URL: ${page.url()}). Confirm site ID ${siteId} and bot account access.`,
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

async function clickDialogCreate(page) {
  const clicked = await page
    .evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const btn = buttons.find((el) => {
        const text = (el.textContent || "").trim();
        return /^create$/i.test(text) && !/create a post/i.test(text) && !el.disabled;
      });
      if (!btn) return false;
      btn.click();
      return true;
    })
    .catch(() => false);

  if (clicked) return true;

  const titleInput = page
    .locator('[role="dialog"] input[type="text"], input[placeholder*="title" i]')
    .first();
  if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await titleInput.press("Enter");
    await page.waitForTimeout(1500);
    return !(await titleInput.isVisible().catch(() => false));
  }
  return false;
}

async function createBlogDraft(page, draft) {
  logStep(`Creating MailerLite post: ${draft.title.slice(0, 80)}`);
  await dismissOverlays(page);

  const createBtn = await findCreatePostButton(page, { timeout: 60000, click: true });
  if (!createBtn) {
    await captureDebug(page, "create-post-button-missing");
    const err = new Error(
      `Create a post button not found on MailerLite blog page (${page.url()}). Check uploads/blog20-bot-debug/.`,
    );
    err.status = 500;
    throw err;
  }
  await page.waitForTimeout(1200);

  const titleInput = page
    .locator(
      '[role="dialog"] input[type="text"], input[placeholder*="post title" i], input[placeholder*="title" i]',
    )
    .first();
  await typeIntoInput(page, titleInput, draft.title);
  await page.waitForTimeout(800);

  logStep("Confirming new post title in MailerLite dialog");
  const created = await clickDialogCreate(page);
  if (!created) {
    await captureDebug(page, "create-title-stuck");
    const err = new Error(
      "MailerLite did not accept the post title (Create button stayed disabled).",
    );
    err.status = 500;
    throw err;
  }
  await page.waitForTimeout(3000);

  const excerptArea = page
    .locator(
      'textarea[name*="excerpt" i], textarea[placeholder*="excerpt" i], label:has-text("Excerpt") + textarea',
    )
    .first();
  if (await excerptArea.isVisible({ timeout: 5000 }).catch(() => false)) {
    await typeIntoInput(page, excerptArea, draft.excerpt || draft.title.slice(0, 160));
  }

  const openedEditor = await clickEnabledButton(page, [
    "Save and edit content",
    "Save & edit content",
  ]);
  if (!openedEditor) {
    await captureDebug(page, "save-edit-missing");
    const err = new Error(
      'Could not find "Save and edit content" on MailerLite post setup page.',
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
  const siteId = settings.mailerlite_site_id || "196949098888169226";
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
      ensureDirs();
      const browser = await launchBrowser();
      try {
        const context = await newBotContext(browser);
        context.setDefaultTimeout(60000);
        const page = await context.newPage();
        await ensureMailerLiteSession(page, creds);
        if (!page.url().includes("/blog")) {
          await openBlogList(page, creds.siteId);
        }
        await captureDebug(page, "bot-test-ok");
        await context.storageState({ path: SESSION_FILE });
        return {
          ok: true,
          message: "Bot logged in and opened MailerLite blog list.",
          url: page.url(),
        };
      } finally {
        await browser.close().catch(() => {});
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

      const browser = await launchBrowser();

      try {
        const context = await newBotContext(browser);
        context.setDefaultTimeout(60000);
        const page = await context.newPage();
        logStep("Ensuring MailerLite session");
        await ensureMailerLiteSession(page, creds);
        if (!page.url().includes("/blog")) {
          logStep("Opening MailerLite blog list");
          await openBlogList(page, creds.siteId);
        }
        const result = await createBlogDraft(page, draft);
        logStep(`Push completed for draft #${draftId}`);
        await context.storageState({ path: SESSION_FILE });

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
        await browser.close().catch(() => {});
      }
    }, `push draft ${draftId}`),
  );
}

export const BOT_RUNTIME_VERSION = "2026-09-18-h";
