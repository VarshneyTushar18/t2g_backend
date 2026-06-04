import express from "express";
import {
    createLead,
    getLeads,
    getLeadById,
    deleteLead,
    exportLeads,
} from "../leads/lead.controller.js";

import { validateLead } from "../../middleware/validation.js";
import { verifyAdmin } from "../auth/auth.middleware.js";

const router = express.Router();

// CREATE
router.post("/", validateLead, createLead);

// READ ALL
router.get("/", verifyAdmin, getLeads);

// EXPORT CSV (must be before /:id)
router.get("/export", verifyAdmin, exportLeads);

// READ SINGLE
router.get("/:id", verifyAdmin, getLeadById);

// DELETE
router.delete("/:id", verifyAdmin, deleteLead);

export default router;