import express from "express";
import blogAgentRoutes from "./blog/blogAgent.routes.js";
import blogImageRoutes from "./blog-image/blogImage.routes.js";

const router = express.Router();
router.use("/blog", blogAgentRoutes);
router.use("/blog-image", blogImageRoutes);

export default router;
