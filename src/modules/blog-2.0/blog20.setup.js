import { ensureBlog20Tables } from "./blog20.model.js";
import { ensureBlog20DraftsTable } from "./blog20.drafts.model.js";

export async function ensureBlog20Ready() {
  await ensureBlog20Tables();
  await ensureBlog20DraftsTable();
  console.log("[blog-2.0] settings + drafts tables ready");
}
