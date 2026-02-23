import express from "express";
import {
  getAllSessions,
  getActiveSessionCount,
  getSession,
} from "../services/session.js";
import { formatLeadReport, getLeadTier } from "../services/leadCapture.js";
import { getAllProperties } from "../data/properties.js";

const router = express.Router();

/**
 * GET /api/health — Health check
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeSessions: getActiveSessionCount(),
  });
});

/**
 * GET /api/stats — Dashboard stats
 */
router.get("/stats", (req, res) => {
  const sessions = getAllSessions();

  const leads = {
    total: sessions.length,
    hot: sessions.filter((s) => s.leadScore >= 80).length,
    warm: sessions.filter((s) => s.leadScore >= 50 && s.leadScore < 80).length,
    cold: sessions.filter((s) => s.leadScore < 50).length,
  };

  const totalMessages = sessions.reduce((acc, s) => acc + s.history.length, 0);
  const escalated = sessions.filter((s) => s.state === "ESCALATED").length;

  res.json({
    activeSessions: getActiveSessionCount(),
    leads,
    totalMessages,
    escalated,
    properties: getAllProperties().length,
  });
});

/**
 * GET /api/leads — List all captured leads
 */
router.get("/leads", (req, res) => {
  const sessions = getAllSessions();
  const leads = sessions
    .filter((s) => s.leadScore > 0)
    .map(formatLeadReport)
    .sort((a, b) => b.score - a.score);

  res.json({ count: leads.length, leads });
});

/**
 * GET /api/leads/:userId — Get a specific lead
 */
router.get("/leads/:userId", (req, res) => {
  const session = getSession(req.params.userId);
  if (!session || session.leadScore === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }
  res.json(formatLeadReport(session));
});

/**
 * GET /api/conversations/:userId — Get conversation history
 */
router.get("/conversations/:userId", (req, res) => {
  const session = getSession(req.params.userId);
  if (!session) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json({
    userId: session.userId,
    state: session.state,
    messageCount: session.history.length,
    history: session.history,
    leadScore: session.leadScore,
    leadTier: getLeadTier(session.leadScore),
  });
});

/**
 * GET /api/properties — List all properties
 */
router.get("/properties", (req, res) => {
  res.json({ properties: getAllProperties() });
});

export default router;
