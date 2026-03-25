import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import cookieParser from "cookie-parser";
import leadRoutes from "./modules/leads/lead.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import portfolioRoutes from "./modules/portfolio/portfolio.routes.js";
import careerRoutes from "./modules/career/career.routes.js";
import lifeRoutes from "./modules/life/life.routes.js";
import testimonialRoutes from "./modules/testimonials/testimonial.routes.js";
import caseStudiesRoutes from "./modules/case-studies/caseStudies.routes.js";

const app = express();

/**
 * ✅ Allowed Origins
 */
const allowedOrigins = [
  process.env.CLIENT_URL_ADMIN,
  process.env.CLIENT_URL_MAIN,
  "http://localhost:3000",
  "http://localhost:3001",
].filter(Boolean);

/**
 * ✅ CORS Configuration (FIXED)
 */
const corsOptions = {
  origin: function (origin, callback) {
    console.log("Incoming origin:", origin);

    // Allow requests with no origin (like Postman, curl, mobile apps)
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.endsWith(".amplifyapp.com") ||
      origin.includes("ngrok-free.dev");

    if (isAllowed) {
      return callback(null, true);
    }

    console.log("Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // ✅ Added OPTIONS
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

/**
 * ✅ CRITICAL FIXES
 */
app.use(cors(corsOptions));

// ✅ Handle preflight requests explicitly
app.options("*", cors(corsOptions));

// ✅ Required when behind proxies (Railway / Cloudflare)
app.set("trust proxy", 1);

/**
 * Body parsers
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/**
 * Routes
 */
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/career", careerRoutes);
app.use("/api/life", lifeRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/case-studies", caseStudiesRoutes);

/**
 * Static files
 */
app.use("/uploads", express.static("uploads"));

/**
 * Health check
 */
app.get("/health", async (req, res) => {
  res.json({ server: "running" });
});

export default app;
