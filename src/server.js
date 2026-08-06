import app from "./app.js";
import dotenv from "dotenv";
import { testDBConnection } from "./config/db.js";
import { testBlogDBConnection, isBlogDbReady } from "./config/blogDb.js";
import { ensureBlogTables } from "./modules/blog/blog.setup.js";
import { startPendingProcessor } from "./modules/elevenlabs/fallback/elevenlabs.fallback.service.js";
import { startLeadsReportScheduler } from "./modules/leads/reports/leadsReport.scheduler.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

testDBConnection();
testBlogDBConnection().then((ok) => {
  if (ok) {
    ensureBlogTables();
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
});
