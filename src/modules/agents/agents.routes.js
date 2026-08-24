import express from "express";
import blogAgentRoutes from "./blog/blogAgent.routes.js";

const router = express.Router();
router.use("/blog", blogAgentRoutes);

export default router;
