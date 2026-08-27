import express from "express";
import blogAgentRoutes from "./blog/blogAgent.routes.js";
import blogImageRoutes from "./blog-image/blogImage.routes.js";
import careerAgentRoutes from "./career/careerAgent.routes.js";
import automationsRoutes from "./automations/agentAutomations.routes.js";
import aiIntegrationsRoutes from "./ai-integrations/aiIntegrations.routes.js";

const router = express.Router();
router.use("/blog", blogAgentRoutes);
router.use("/blog-image", blogImageRoutes);
router.use("/career", careerAgentRoutes);
router.use("/automations", automationsRoutes);
router.use("/ai-integrations", aiIntegrationsRoutes);

export default router;
