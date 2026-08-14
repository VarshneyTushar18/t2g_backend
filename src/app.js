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
import blogRoutes from "./modules/blog/blog.routes.js";
import connectRoutes from "./modules/connect/connect.routes.js";
import elevenLabsRoutes from "./modules/elevenlabs/elevenlabs.routes.js";
import elevenLabsFallbackRoutes from "./modules/elevenlabs/fallback/elevenlabs.fallback.routes.js";
import { handleTranscriptWebhook } from "./modules/elevenlabs/elevenlabs.controller.js";

const app = express();

/**
 * ✅ Allowed Origins
 */
const allowedOrigins = [
  process.env.CLIENT_URL_ADMIN,
  process.env.CLIENT_URL_MAIN,
  process.env.CLIENT_URL_STAGE,
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_S4A,
  process.env.SERVICES4AMAZON_URL,
  "https://tech2globe.com",
  "https://www.tech2globe.com",
  "https://www.services4amazon.com",
  "https://services4amazon.com",
  "http://localhost:3000",
  "http://localhost:3001",
].filter(Boolean);

const hostWithoutWww = (hostname) =>
  String(hostname || "")
    .replace(/^www\./i, "")
    .toLowerCase();

const isServices4AmazonHost = (hostname) =>
  hostWithoutWww(hostname) === "services4amazon.com";

/** Allow exact match, or same site with/without www (e.g. tech2globe.com vs www.tech2globe.com). */
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith(".amplifyapp.com")) return true;
  if (origin.includes("ngrok-free.dev")) return true;

  try {
    const originUrl = new URL(origin);
    const originHost = hostWithoutWww(originUrl.hostname);

    if (isServices4AmazonHost(originUrl.hostname)) return true;

    return allowedOrigins.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        const allowedHost = hostWithoutWww(allowedUrl.hostname);
        return (
          allowedHost === originHost &&
          allowedUrl.protocol === originUrl.protocol
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * ✅ CORS Configuration (FIXED)
 */
const corsOptions = {
  origin: function (origin, callback) {
    console.log("Incoming origin:", origin);

    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    console.log("Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
};

app.use(cors(corsOptions));

// ✅ Universal preflight handler (no path parsing issues)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;

    const isAllowed = isOriginAllowed(origin);

    if (isAllowed) {
      if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
      }

      res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-api-key"
      );
      res.header("Access-Control-Allow-Credentials", "true");

      return res.sendStatus(200);
    }

    return res.sendStatus(403);
  }

  next();
});

// ✅ Required when behind proxies (Railway / Cloudflare)
app.set("trust proxy", 1);

/**
 * ElevenLabs transcript webhook (raw body required for HMAC)
 */
app.use("/api/elevenlabs", elevenLabsRoutes);
app.post(
  "/transcript_webhook",
  express.raw({ type: "application/json" }),
  handleTranscriptWebhook,
);

/**
 * Body parsers
 */
app.use(express.json({ limit: "50mb" }));
app.use("/api/elevenlabs/fallback", elevenLabsFallbackRoutes);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
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
app.use("/api/blog", blogRoutes);
app.use("/api/connect", connectRoutes);

/**
 * Static files
 */
app.use("/uploads", express.static("uploads"));

export default app;
