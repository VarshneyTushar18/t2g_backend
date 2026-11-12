import { ensureBlog20Tables } from "./blog20.model.js";
import { ensureBlog20DraftsTable } from "./blog20.drafts.model.js";
import { ensureBlog20ApprovalTables } from "./blog20.approval.model.js";
import { ensureBlog20AutomationTopicsTable } from "./blog20.automation.topics.model.js";

export async function ensureBlog20Ready() {
  await ensureBlog20Tables();
  await ensureBlog20DraftsTable();
  await ensureBlog20ApprovalTables();
  await ensureBlog20AutomationTopicsTable();
  console.log("[blog-2.0] settings + drafts + approvals + automation topics ready");
}
