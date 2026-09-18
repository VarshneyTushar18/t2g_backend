import { ensureBlog20Tables } from "./blog20.model.js";

export async function ensureBlog20Ready() {
  await ensureBlog20Tables();
  console.log("[blog-2.0] settings table ready");
}
