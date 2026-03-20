import express from "express";
import { CreatedLead , getLeads} from "../leads/lead.controller.js";
import { validateLead } from "../../middleware/validation.js";
import { verifyAdmin } from "../auth/auth.middleware.js";

const router = express.Router();

// Create a new lead
router.post("/",validateLead, CreatedLead);  

// Get all leads
router.get("/", verifyAdmin,getLeads);

  


export default router;