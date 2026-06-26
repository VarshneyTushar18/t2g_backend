import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
    deleteLead,
    exportLeads,
} from "../leads/lead.controller.js";
import shopifyIntakeRoutes from "./shopify-intake/shopifyIntake.routes.js";
import amazonOnboardingRoutes from "./amazon-onboarding/amazonOnboarding.routes.js";

import { validateLead } from "../../middleware/validation.js";
import { guardModule } from "../auth/auth.middleware.js";

const router = express.Router();
const adminLeads = guardModule("leads");

router.use("/shopify-intake", shopifyIntakeRoutes);
router.use("/amazon-onboarding", amazonOnboardingRoutes);

// CREATE
router.post("/", validateLead, createLead);

// READ ALL
router.get("/", ...adminLeads, getLeads);

// EXPORT CSV (must be before /:id)
router.get("/export", ...adminLeads, exportLeads);

// READ SINGLE
router.get("/:id", ...adminLeads, getLeadById);

// DELETE
router.delete("/:id", ...adminLeads, deleteLead);

export default router;
