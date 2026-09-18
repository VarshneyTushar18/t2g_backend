import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import * as settingsModel from "./blog20.model.js";
import * as draftsModel from "./blog20.drafts.model.js";

const SESSION_DIR = path.join(process.cwd(), "storage", "blog-2.0");
const SESSION_FILE = path.join(SESSION_DIR, "mailerlite-session.json");
const DEBUG_DIR = path.join(process.cwd(), "uploads", "blog20-bot-debug");
const BOT_TIMEOUT_MS = Number(process.env.BLOG_20_BOT_TIMEOUT_MS) || 3 * 60 * 1000;

let botBusy = false;

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

async function withBotTimeout(promise, label) {
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
    return await Promise.race([promise, timeout]);
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

async function typeIntoInput(locator, value) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 35 });
  await locator.dispatchEvent("input");
  await locator.dispatchEvent("change");
  await locator.blur();
}

async function waitForEnabledSubmit(page) {
  const submit = page
    .locator('#login-submit-button, [data-test-id="signin-button"], button[type="submit"]')
    .first();
  await submit.waitFor({ state: "visible", timeout: 30000 });

  const enabled = await page
    .waitForFunction(
      () => {
        const btn = document.querySelector(
          '#login-submit-button, [data-test-id="signin-button"], button[type="submit"]',
        );
        return Boolean(btn && !btn.disabled);
      },
      { timeout: 20000 },
    )
    .catch(() => null);

  if (!enabled) {
    await captureDebug(page, "login-submit-disabled");
    const err = new Error(
      "MailerLite login button stayed disabled. Re-save bot email and password in Blog-2.0 → MailerLite (valid MailerLite account, 2FA off).",
    );
    err.status = 400;
    throw err;
  }

  return submit;
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
  return { email, password, siteId };
}

async function loginIfNeeded(page, { email, password }) {
  const url = page.url();
  if (!url.includes("login") && !url.includes("accounts.mailerlite")) {
    const onApp =
      url.includes("dashboard.mailerlite.com") && !url.includes("login");
    if (onApp) return;
  }

  await page.goto("https://accounts.mailerlite.com/login", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await dismissOverlays(page);

  const emailInput = page
    .locator(
      'input[data-test-id="email-input"], input[type="email"], input[name="email"], input[autocomplete="email"]',
    )
    .first();
  const passInput = page
    .locator('input[data-test-id="password-input"], input[type="password"]')
    .first();

  await typeIntoInput(emailInput, email);
  await page.waitForTimeout(400);
  await typeIntoInput(passInput, password);
  await page.waitForTimeout(400);

  const submit = await waitForEnabledSubmit(page);
  await submit.click();

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
  await page.goto(`https://dashboard.mailerlite.com/sites/${siteId}/blog`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
}

async function createBlogDraft(page, draft) {
  const createBtn = page
    .locator('button:has-text("Create a post"), a:has-text("Create a post")')
    .first();
  await createBtn.waitFor({ state: "visible", timeout: 30000 });
  await createBtn.click();

  const titleInput = page
    .locator(
      'input[placeholder*="post title" i], input[placeholder*="Enter post title" i], dialog input[type="text"]',
    )
    .first();
  await titleInput.waitFor({ state: "visible", timeout: 15000 });
  await titleInput.fill(draft.title);

  const confirmCreate = page
    .locator('button:has-text("Create"):not(:has-text("Create a post"))')
    .last();
  await confirmCreate.click();
  await page.waitForTimeout(2500);

  const excerptArea = page
    .locator(
      'textarea[name*="excerpt" i], textarea[placeholder*="excerpt" i], label:has-text("Excerpt") + textarea, textarea',
    )
    .first();
  if (await excerptArea.isVisible().catch(() => false)) {
    await excerptArea.fill(draft.excerpt || draft.title.slice(0, 160));
  }

  const saveEdit = page
    .locator(
      'button:has-text("Save and edit content"), button:has-text("Save & edit content"), a:has-text("Save and edit content")',
    )
    .first();
  await saveEdit.waitFor({ state: "visible", timeout: 30000 });
  await saveEdit.click();
  await page.waitForTimeout(3000);

  const html = String(draft.content || "").trim();
  const editable = page.locator('[contenteditable="true"]').first();
  const codeBtn = page.locator('button:has-text("HTML"), button:has-text("Code")').first();

  if (await codeBtn.isVisible().catch(() => false)) {
    await codeBtn.click();
    await page.waitForTimeout(500);
  }

  if (await editable.isVisible().catch(() => false)) {
    await editable.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText(html.replace(/<h1[^>]*>.*?<\/h1>/i, "").trim());
  } else {
    const bodyTextarea = page.locator("textarea").first();
    if (await bodyTextarea.isVisible().catch(() => false)) {
      await bodyTextarea.fill(html);
    }
  }

  await page.waitForTimeout(1000);

  const saveDraft = page
    .locator(
      'button:has-text("Save as draft"), button:has-text("Save draft"), [data-testid*="draft"]',
    )
    .first();
  if (await saveDraft.isVisible().catch(() => false)) {
    await saveDraft.click();
  } else {
    const saveMenu = page.locator('button:has-text("Save")').first();
    await saveMenu.click();
    const draftOpt = page.locator('text=Save as draft').first();
    if (await draftOpt.isVisible().catch(() => false)) {
      await draftOpt.click();
    }
  }

  await page.waitForTimeout(2000);

  const settings = await settingsModel.getSettings();
  const blogBase =
    settings.client_blog_url ||
    `https://dashboard.mailerlite.com/sites/${settings.mailerlite_site_id || "196949098888169226"}/blog`;

  return {
    ok: true,
    title: draft.title,
    slug: draft.slug,
    mailerlite_dashboard_url: blogBase,
    note: "Draft created via browser bot. Verify in MailerLite Sites → Blog.",
  };
}

export async function testMailerLiteBotLogin() {
  return withBotLock(() =>
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
        await loginIfNeeded(page, creds);
        await openBlogList(page, creds.siteId);
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
  return withBotLock(() =>
    withBotTimeout(async () => {
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
        await loginIfNeeded(page, creds);
        await openBlogList(page, creds.siteId);
        const result = await createBlogDraft(page, draft);
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
