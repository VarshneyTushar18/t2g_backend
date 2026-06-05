import app from "./app.js";
import dotenv from "dotenv";
import { testDBConnection } from "./config/db.js";
import { testBlogDBConnection } from "./config/blogDb.js";
import { ensureBlogTables } from "./modules/blog/blog.setup.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

testDBConnection();
testBlogDBConnection();
ensureBlogTables();

app.get("/health", async (req, res) => {
  res.json({
    server: "running",
    mainDatabase: process.env.DB_NAME || "tech2globe",
    blogDatabase: process.env.BLOG_DB_NAME || "tech2globe_blog",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
