import express  from "express";
import { loginAdmin } from "../auth/auth.controller.js";


const router = express.Router();

// Admin login route
router.post("/login", loginAdmin);


export default router;