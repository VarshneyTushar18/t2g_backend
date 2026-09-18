/**
 * One-time helper: save MailerLite session on the server when headless login fails.
 * Requires a display (or xvfb-run on Linux).
 *
 *   xvfb-run -a npm run blog20:save-session
 *
 * A browser window opens — log in manually, then press Enter in the terminal.
 */
import readline from "readline";
import { chromium } from "playwright";
import { ensureBlog20Ready } from "../src/modules/blog-2.0/blog20.setup.js";
import * as settingsModel from "../src/modules/blog-2.0/blog20.model.js";
import path from "path";

const SESSION_FILE = path.join(process.cwd(), "storage", "blog-2.0", "mailerlite-session.json");

function waitForEnter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("After you see MailerLite dashboard, press Enter here to save session… ", () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  await ensureBlog20Ready();
  const settings = await settingsModel.getSettingsWithSecrets();
  const siteId = settings.mailerlite_site_id || "196949098888169226";

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.goto(`https://dashboard.mailerlite.com/sites/${siteId}/blog/posts`, {
    waitUntil: "domcontentloaded",
  });

  console.log("\nLog into MailerLite in the browser window if prompted.");
  await waitForEnter();
  await context.storageState({ path: SESSION_FILE });
  await browser.close();
  console.log(`\nSaved session to ${SESSION_FILE}`);
  console.log("Now run: npm run test:blog20-push -- 16");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
