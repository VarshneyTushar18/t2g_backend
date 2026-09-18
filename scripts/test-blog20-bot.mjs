import "dotenv/config";
import { ensureBlog20Ready } from "../src/modules/blog-2.0/blog20.setup.js";
import { testMailerLiteBotLogin } from "../src/modules/blog-2.0/blog20.mailerliteBot.js";

async function main() {
  console.log("[blog-2.0] Preparing tables…");
  await ensureBlog20Ready();
  console.log("[blog-2.0] Testing MailerLite bot login…");
  const result = await testMailerLiteBotLogin();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[blog-2.0] Bot test failed:", err.message || err);
  process.exit(1);
});
