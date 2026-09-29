/**
 * Save MailerLite session — tracks each step, auto-saves at Step 6.
 *
 *   xvfb-run -a npm run blog20:save-session
 *
 * Do NOT press Enter — wait until Step 6/7 prints automatically.
 */
import { ensureBlog20Ready } from "../src/modules/blog-2.0/blog20.setup.js";
import { interactiveSaveMailerLiteSession } from "../src/modules/blog-2.0/blog20.mailerliteBot.js";

async function main() {
  await ensureBlog20Ready();
  console.log("[blog-2.0] MailerLite session save — step tracker enabled\n");

  const result = await interactiveSaveMailerLiteSession({ autoWatch: true });

  console.log(JSON.stringify(result, null, 2));
  console.log("\nNow run: xvfb-run -a npm run test:blog20-push -- 16");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
