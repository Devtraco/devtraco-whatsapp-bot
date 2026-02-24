import express from "express";
import {
  getAllSessions,
  getActiveSessionCount,
  getSession,
} from "../services/session.js";
import { formatLeadReport, getLeadTier } from "../services/leadCapture.js";
import {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
} from "../data/properties.js";
import { getAllViewings, getPendingViewingCount, updateViewingStatus } from "../services/viewingScheduler.js";
import { getCRMSyncStats, getCRMSyncLog, syncLeadToCRM } from "../services/crmSync.js";

const router = express.Router();

/**
 * GET /api/health — Health check
 */
router.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeSessions: await getActiveSessionCount(),
  });
});

/**
 * GET /api/stats — Dashboard stats
 */
router.get("/stats", async (req, res) => {
  const sessions = await getAllSessions();
  const properties = await getAllProperties();

  const leads = {
    total: sessions.length,
    hot: sessions.filter((s) => s.leadScore >= 80).length,
    warm: sessions.filter((s) => s.leadScore >= 50 && s.leadScore < 80).length,
    cold: sessions.filter((s) => s.leadScore < 50).length,
  };

  const totalMessages = sessions.reduce((acc, s) => acc + (s.history?.length || 0), 0);
  const escalated = sessions.filter((s) => s.state === "ESCALATED").length;

  res.json({
    activeSessions: await getActiveSessionCount(),
    leads,
    totalMessages,
    escalated,
    properties: properties.length,
    pendingViewings: await getPendingViewingCount(),
  });
});

/**
 * GET /api/leads — List all captured leads
 */
router.get("/leads", async (req, res) => {
  const sessions = await getAllSessions();
  const leads = sessions
    .filter((s) => s.leadScore > 0)
    .map(formatLeadReport)
    .sort((a, b) => b.score - a.score);

  res.json({ count: leads.length, leads });
});

/**
 * GET /api/leads/:userId — Get a specific lead
 */
router.get("/leads/:userId", async (req, res) => {
  const session = await getSession(req.params.userId);
  if (!session || session.leadScore === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }
  res.json(formatLeadReport(session));
});

/**
 * GET /api/conversations — List all conversations (summary)
 */
router.get("/conversations", async (req, res) => {
  const sessions = await getAllSessions();
  const convos = sessions.map((s) => ({
    userId: s.userId,
    state: s.state,
    messageCount: s.history?.length || 0,
    leadScore: s.leadScore,
    leadTier: getLeadTier(s.leadScore),
    lastMessage: s.history?.length > 0 ? s.history[s.history.length - 1].content?.substring(0, 80) : null,
    lastActivity: s.lastActivity,
  }));
  res.json({ count: convos.length, conversations: convos });
});

/**
 * GET /api/conversations/:userId — Get conversation history
 */
router.get("/conversations/:userId", async (req, res) => {
  const session = await getSession(req.params.userId);
  if (!session) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json({
    userId: session.userId,
    state: session.state,
    messageCount: session.history?.length || 0,
    history: session.history || [],
    leadScore: session.leadScore,
    leadTier: getLeadTier(session.leadScore),
  });
});

/**
 * GET /api/properties — List all properties
 */
router.get("/properties", async (req, res) => {
  const properties = await getAllProperties();
  res.json({ properties });
});

/**
 * GET /api/properties/:id — Get a single property
 */
router.get("/properties/:id", async (req, res) => {
  const property = await getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ error: "Property not found" });
  }
  res.json(property);
});

/**
 * POST /api/properties — Create a new property
 */
router.post("/properties", async (req, res) => {
  try {
    const property = await createProperty(req.body);
    res.status(201).json(property);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/properties/:id — Update an existing property
 */
router.put("/properties/:id", async (req, res) => {
  try {
    const property = await updateProperty(req.params.id, req.body);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    res.json(property);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/properties/:id — Delete a property
 */
router.delete("/properties/:id", async (req, res) => {
  try {
    const result = await deleteProperty(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Property not found" });
    }
    res.json({ success: true, message: "Property deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/viewings — List all viewing appointments
 */
router.get("/viewings", async (req, res) => {
  const viewings = await getAllViewings();
  res.json({
    total: viewings.length,
    pending: viewings.filter(v => v.status === "PENDING").length,
    confirmed: viewings.filter(v => v.status === "CONFIRMED").length,
    viewings,
  });
});

/**
 * PATCH /api/viewings/:id — Update viewing status (confirm/cancel)
 */
router.patch("/viewings/:id", async (req, res) => {
  const { status } = req.body;
  if (!["CONFIRMED", "CANCELLED", "COMPLETED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Use: CONFIRMED, CANCELLED, or COMPLETED" });
  }
  const viewing = await updateViewingStatus(req.params.id, status);
  if (!viewing) {
    return res.status(404).json({ error: "Viewing not found" });
  }
  res.json(viewing);
});

/**
 * GET /api/crm/stats — CRM sync status & stats
 */
router.get("/crm/stats", (req, res) => {
  res.json(getCRMSyncStats());
});

/**
 * GET /api/crm/log — Full CRM sync audit log
 */
router.get("/crm/log", (req, res) => {
  res.json({ log: getCRMSyncLog() });
});

/**
 * POST /api/crm/sync/:userId — Manually trigger CRM sync for a lead
 */
router.post("/crm/sync/:userId", async (req, res) => {
  const session = await getSession(req.params.userId);
  if (!session || session.leadScore === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }
  try {
    const report = formatLeadReport(session);
    const result = await syncLeadToCRM(report);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
