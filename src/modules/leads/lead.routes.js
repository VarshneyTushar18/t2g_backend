import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
    deleteLead,
    exportLeads,
} from "../leads/lead.controller.js";

import { validateLead } from "../../middleware/validation.js";
import { guardModule } from "../auth/auth.middleware.js";

const router = express.Router();
const adminLeads = guardModule("leads");

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
