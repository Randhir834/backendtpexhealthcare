// app.js
 //
 // Creates and configures the Express application.
 //
 // Responsibilities:
 // - Register global middlewares (CORS, JSON body parsing, request logging)
 // - Mount the main API router
 // - Provide a basic health endpoint
 // - Handle 404s and errors
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/error.middleware.js";

const app = express();

// Global middlewares.
app.disable("x-powered-by");

if (process.env.TRUST_PROXY) {
  const n = Number.parseInt(String(process.env.TRUST_PROXY), 10);
  app.set("trust proxy", Number.isFinite(n) ? n : 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const corsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      const isProd = process.env.NODE_ENV === "production";
      if (!origin) return cb(null, true);
      if (!isProd && corsOrigins.length === 0) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(Object.assign(new Error("Not allowed by CORS"), { statusCode: 403 }));
    },
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number.parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || "30", 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/auth", authLimiter);

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "1mb",
    verify(req, res, buf) {
      req.rawBody = buf;
    },
  })
);

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Mount all API routes.
app.use(routes);

// Basic health check.
app.get("/", (req, res) => {
  res.send("TPEx Healthcare Backend Running ✅");
});

// Fallback handler for unknown routes.
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Centralized error handler.
app.use(errorMiddleware);

export default app;
