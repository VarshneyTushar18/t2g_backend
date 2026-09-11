import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
    deleteLead,
    exportLeads,
    getLeadStats,
} from "../leads/lead.controller.js";
import shopifyIntakeRoutes from "./shopify-intake/shopifyIntake.routes.js";
import amazonOnboardingRoutes from "./amazon-onboarding/amazonOnboarding.routes.js";
import amazonLeadsRoutes from "./amazon-leads/amazonLeads.routes.js";

import { validateLead } from "../../middleware/validation.js";
import { guardModuleOrApiKey } from "../auth/auth.middleware.js";

const router = express.Router();
const adminLeads = guardModuleOrApiKey("leads");

router.use("/shopify-intake", shopifyIntakeRoutes);
router.use("/amazon-onboarding", amazonOnboardingRoutes);
router.use("/amazon-leads", amazonLeadsRoutes);

// CREATE
router.post("/", validateLead, createLead);

// READ ALL
router.get("/", ...adminLeads, getLeads);

// EXPORT CSV (must be before /:id)
router.get("/export", ...adminLeads, exportLeads);

// DASHBOARD STATS (must be before /:id)
router.get("/stats", ...adminLeads, getLeadStats);

// READ SINGLE
router.get("/:id", ...adminLeads, getLeadById);

// DELETE
router.delete("/:id", ...adminLeads, deleteLead);

export default router;
