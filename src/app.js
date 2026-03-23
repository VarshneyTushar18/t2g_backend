import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import leadRoutes from "./modules/leads/lead.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import portfolioRoutes from "./modules/portfolio/portfolio.routes.js";
import cookieParser from "cookie-parser";
import careerRoutes from "./modules/career/career.routes.js";
import lifeRoutes from "./modules/life/life.routes.js";
import testimonialRoutes from "./modules/testimonials/testimonial.routes.js";
import caseStudiesRoutes from "./modules/case-studies/caseStudies.routes.js";

const app = express();

const allowedOrigins = [
  process.env.CLIENT_URL_ADMIN,
  process.env.CLIENT_URL_MAIN,
  "http://localhost:3000",
  "http://localhost:3001"
].filter(Boolean); 

app.use(cors({
  origin: function (origin, callback) {
    console.log("Incoming origin:", origin);

    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.includes("ngrok-free.dev") ||
      origin.includes("amplifyapp.com")
    ) {
      return callback(null, true);
    }

    console.log("Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));


app.use(express.json());        
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Use the portfolio routes
app.use("/api/portfolio", portfolioRoutes);


// Use the lead routes
app.use("/api/leads", leadRoutes);

// Use the auth routes (for admin login)
app.use("/api/auth", authRoutes);

// Use the career routes
app.use("/api/career", careerRoutes);

// Use the life routes
app.use("/api/life", lifeRoutes);

// Use the testimonial routes
app.use("/api/testimonials", testimonialRoutes);

// Use the case studies routes
app.use("/api/case-studies", caseStudiesRoutes);


// Serve uploaded resumes statically
app.use("/uploads", express.static("uploads"));



app.get("/health", async (req, res) => {
  res.json({
    server: "running"
  });
});

export default app;