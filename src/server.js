import app from "./app.js";
import dotenv from "dotenv";
import { testDBConnection } from "./config/db.js";
import { testBlogDBConnection, isBlogDbReady } from "./config/blogDb.js";
import { ensureBlogTables } from "./modules/blog/blog.setup.js";
import { ensureBlogAgentTables } from "./modules/agents/blog/blogAgent.setup.js";
import { ensureAgentAutomationsTables } from "./modules/agents/automations/agentAutomations.setup.js";
import { ensureAiIntegrationsTable } from "./modules/agents/ai-integrations/aiIntegrations.model.js";
import { refreshConfiguredFlag } from "./modules/agents/lib/openai.js";
import { startPendingProcessor } from "./modules/elevenlabs/fallback/elevenlabs.fallback.service.js";
import { startLeadsReportScheduler } from "./modules/leads/reports/leadsReport.scheduler.js";
import { startAgentAutomationsScheduler } from "./modules/agents/automations/agentAutomations.scheduler.js";
import {
  ensureCareerApprovalReady,
  startCareerApprovalScheduler,
} from "./modules/agents/career/careerApproval.scheduler.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

testDBConnection().then(async () => {
  try {
    await ensureAiIntegrationsTable();
    await refreshConfiguredFlag();
    console.log("[ai-integrations] settings table ready");
  } catch (err) {
    console.error("[ai-integrations] setup failed:", err.message);
  }
  await ensureCareerApprovalReady();
});
testBlogDBConnection().then((ok) => {
  if (ok) {
    ensureBlogTables();
    ensureBlogAgentTables();
    ensureAgentAutomationsTables();
  }
});

app.get("/health", async (req, res) => {
  res.json({
    server: "running",
    mainDatabase: process.env.DB_NAME || "tech2globe",
    blogDatabase: process.env.BLOG_DB_NAME || "tech2globe_blog",
    blogConnected: isBlogDbReady(),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startPendingProcessor();
  startLeadsReportScheduler();
  startAgentAutomationsScheduler();
  startCareerApprovalScheduler();
});
