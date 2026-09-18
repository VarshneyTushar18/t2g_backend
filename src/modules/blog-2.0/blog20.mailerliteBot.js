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

async function waitForEnabledSubmit(page) {
  const submit = page
    .locator('#login-submit-button, [data-test-id="signin-button"], button[type="submit"]')
    .first();
  await submit.waitFor({ state: "visible", timeout: 30000 });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await submit.isEnabled().catch(() => false)) {
      await submit.click({ timeout: 5000 });
      return;
    }
    await page.waitForTimeout(500);
  }

  const passInput = page.locator('input[type="password"]').first();
  if (await passInput.isVisible().catch(() => false)) {
    logStep("Trying Enter key on password field");
    await passInput.press("Enter");
    await page.waitForTimeout(3000);
    if (!page.url().includes("login")) return;
  }

  await captureDebug(page, "login-submit-disabled");
  const emailLen = await page
    .locator('input[type="email"], input[data-test-id="email-input"]')
    .first()
    .inputValue()
    .catch(() => "");
  const passLen = await page
    .locator('input[type="password"]')
    .first()
    .inputValue()
    .catch(() => "");
  const err = new Error(
    `MailerLite login button stayed disabled (email chars: ${emailLen.length}, password chars: ${passLen.length}). Re-save bot email + password in Blog-2.0 → MailerLite. Use a real MailerLite login — 2FA off.`,
  );
  err.status = 400;
  throw err;
}

async function gotoPage(page, url, label) {
  logStep(`Navigating: ${label}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function ensureMailerLiteSession(page, creds) {
  if (fs.existsSync(SESSION_FILE)) {
    logStep("Trying saved MailerLite session");
    await gotoPage(
      page,
      `https://dashboard.mailerlite.com/sites/${creds.siteId}/blog`,
      "blog list (session)",
    );
    const onBlog =
      page.url().includes("dashboard.mailerlite.com") && !page.url().includes("login");
    if (onBlog) {
      logStep("Saved session is valid");
      return;
    }
  }
  await loginIfNeeded(page, creds);
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
  await fillReactInput(page, emailInput, email);
  await page.waitForTimeout(600);
  await passInput.click();
  await fillReactInput(page, passInput, password);
  await page.waitForTimeout(800);

  const submit = page
    .locator('#login-submit-button, [data-test-id="signin-button"], button[type="submit"]')
    .first();
  if (await submit.isEnabled().catch(() => false)) {
    await submit.click();
  } else {
    await waitForEnabledSubmit(page);
  }

  await page.waitForURL(/dashboard\.mailerlite\.com/i, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (page.url().includes("login") || page.url().includes("accounts.mailerlite.com/login")) {
    const err = new Error(
      "MailerLite login failed. Check bot email/password. Disable 2FA on the bot account or complete login manually once.",
    );
    err.status = 401;
    await captureDebug(page, "login-failed");
    throw err;
  }

  ensureDirs();
  await page.context().storageState({ path: SESSION_FILE });
}

async function openBlogList(page, siteId) {
  await gotoPage(
    page,
    `https://dashboard.mailerlite.com/sites/${siteId}/blog`,
    "blog list",
  );
  await dismissOverlays(page);
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

  const createBtn = page
    .getByRole("button", { name: /create a post/i })
    .or(page.getByRole("link", { name: /create a post/i }))
    .or(page.locator('button:has-text("Create a post"), a:has-text("Create a post")'))
    .first();
  await createBtn.waitFor({ state: "visible", timeout: 30000 });
  await createBtn.click();
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
        const context = await browser.newContext(
          fs.existsSync(SESSION_FILE) ? { storageState: SESSION_FILE } : {},
        );
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
        const context = await browser.newContext(
          fs.existsSync(SESSION_FILE) ? { storageState: SESSION_FILE } : {},
        );
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

export const BOT_RUNTIME_VERSION = "2026-09-18-d";
