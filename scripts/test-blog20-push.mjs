import "dotenv/config";
import { ensureBlog20Ready } from "../src/modules/blog-2.0/blog20.setup.js";
import {
  pushDraftToMailerLite,
  BOT_RUNTIME_VERSION,
} from "../src/modules/blog-2.0/blog20.mailerliteBot.js";

const draftId = Number(process.argv[2]);
if (!draftId) {
  console.error("Usage: npm run test:blog20-push -- <draftId>");
  process.exit(1);
}

async function main() {
  await ensureBlog20Ready();
  console.log(`[blog-2.0] Bot runtime: ${BOT_RUNTIME_VERSION}`);
  console.log(`[blog-2.0] Pushing draft #${draftId} to MailerLite…`);
  console.log("[blog-2.0] This takes 2-5 minutes. Do not press Ctrl+C.");
  const result = await pushDraftToMailerLite(draftId);
  if (typeof result === "function") {
    throw new Error(
      "Outdated bot code on server. Run: git pull origin authFix && pm2 restart t2g_backend",
    );
  }
  if (!result?.ok) {
    throw new Error("Push finished without ok:true result");
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[blog-2.0] Push failed:", err.message || err);
  process.exit(1);
});
