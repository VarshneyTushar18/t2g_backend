/**
 * Save MailerLite session — tracks each step while you log in manually.
 *
 *   xvfb-run -a npm run blog20:save-session
 */
import readline from "readline";
import { ensureBlog20Ready } from "../src/modules/blog-2.0/blog20.setup.js";
import { interactiveSaveMailerLiteSession } from "../src/modules/blog-2.0/blog20.mailerliteBot.js";

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  await ensureBlog20Ready();
  console.log("[blog-2.0] MailerLite session save — step tracker enabled\n");

  const result = await interactiveSaveMailerLiteSession({
    autoWatch: true,
    waitForUser: (prompt) => waitForEnter(prompt),
  });

  console.log(JSON.stringify(result, null, 2));
  console.log("\nNow run: xvfb-run -a npm run test:blog20-push -- 16");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
