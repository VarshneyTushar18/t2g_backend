/**
 * Save MailerLite login to browser-profile.
 *
 * Windows PC:  npm run blog20:save-session
 * Linux server: npm run blog20:save-session  (auto-uses xvfb-run if needed)
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

if (
  process.platform === "linux" &&
  !process.env.DISPLAY &&
  !process.env.BLOG20_XVFB_WRAPPED
) {
  console.log("[blog-2.0] No DISPLAY detected — re-running with xvfb-run -a …\n");
  const result = spawnSync(
    "xvfb-run",
    ["-a", process.execPath, path.join(__dirname, "blog20-bot-save-session.mjs")],
    {
      stdio: "inherit",
      env: { ...process.env, BLOG20_XVFB_WRAPPED: "1" },
      cwd: ROOT,
    },
  );
  process.exit(result.status ?? 1);
}

import { ensureBlog20Ready } from "../src/modules/blog-2.0/blog20.setup.js";
import { interactiveSaveMailerLiteSession } from "../src/modules/blog-2.0/blog20.mailerliteBot.js";

async function main() {
  try {
    await ensureBlog20Ready();
  } catch (err) {
    console.warn(
      "[blog-2.0] DB not available (ok for session save):",
      err.message || err,
    );
  }

  console.log("[blog-2.0] MailerLite session save — step tracker enabled\n");

  if (process.platform === "win32") {
    console.log("[blog-2.0] Windows: a browser window will open on THIS PC.\n");
  } else if (process.env.DISPLAY) {
    console.log(
      "[blog-2.0] Linux + xvfb: browser is invisible over SSH.\n" +
        "         Prefer running on Windows PC, then copy storage/blog-2.0/browser-profile to server.\n",
    );
  }

  const result = await interactiveSaveMailerLiteSession({ autoWatch: true });

  console.log(JSON.stringify(result, null, 2));
  console.log("\nNext:");
  if (process.platform === "win32") {
    console.log(
      '  scp -r storage/blog-2.0/browser-profile root@YOUR_SERVER:/root/t2g_backend/storage/blog-2.0/',
    );
  }
  console.log("  xvfb-run -a npm run test:blog20-push -- 16");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
