import { isBlogDbReady } from "../config/blogDb.js";

/** Blog routes only — does not affect other modules. */
export const requireBlogDb = (req, res, next) => {
  if (!isBlogDbReady()) {
    return res.status(503).json({
      error: "Blog database unavailable",
      hint: "Configure BLOG_DB_* in .env and ensure the blog database is running",
    });
  }
  next();
};
