import express from "express";
import rateLimit from "express-rate-limit";
import config from "./src/config/index.js";
import webhookRoutes from "./src/routes/webhook.js";
import apiRoutes from "./src/routes/api.js";

const app = express();

// ---------- Middleware ----------
app.use(express.json({ limit: "1mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/webhook", limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path !== "/api/health") {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ---------- Routes ----------
app.use(webhookRoutes);
app.use("/api", apiRoutes);

// Root
app.get("/", (req, res) => {
  res.json({
    service: "Devtraco WhatsApp AI Chatbot",
    status: "running",
    version: "1.0.0",
    endpoints: {
      webhook: "/webhook",
      health: "/api/health",
      stats: "/api/stats",
      leads: "/api/leads",
      properties: "/api/properties",
    },
  });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ---------- Start ----------
app.listen(config.port, () => {
  console.log(`\n🤖 Devtraco WhatsApp AI Chatbot`);
  console.log(`   Server running on port ${config.port}`);
  console.log(`   Webhook: http://localhost:${config.port}/webhook`);
  console.log(`   API:     http://localhost:${config.port}/api/health`);
  console.log(`   Model:   ${config.openai.model}\n`);
});