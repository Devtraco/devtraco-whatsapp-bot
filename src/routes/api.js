import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import config from "../config/index.js";
import {
  getAllSessions,
  getActiveSessionCount,
  getSession,
  getSessionReadOnly,
  deleteSession,
  deleteAllSessions,
} from "../services/session.js";
import { formatLeadReport, getLeadTier } from "../services/leadCapture.js";
import {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
} from "../data/properties.js";
import { getAllViewings, getPendingViewingCount, updateViewingStatus, formatViewingConfirmed, formatViewingCancelled, deleteViewing, deleteAllViewings, getAvailableSlots, formatDateNice, formatTimeNice, getViewingById } from "../services/viewingScheduler.js";
import { sendTextMessage } from "../services/whatsapp.js";
import { broadcastMessage, parsePhoneNumbers, saveDraft, getAllDrafts, getDraft, updateDraft, deleteDraft, saveBroadcastResult, getBroadcastResults, getBroadcastResult, exportBroadcastResultAsCSV, exportBroadcastSummaryAsCSV } from "../services/broadcast.js";
import { getCRMSyncStats, getCRMSyncLog, syncLeadToCRM } from "../services/crmSync.js";
import {
  exportConversationTranscriptCSV,
  exportConversationJSON,
  exportConversationsSummaryCSV,
} from "../services/conversationExport.js";
import { sendViewingConfirmationEmail, sendTestEmail } from "../services/email.js";
import { invalidatePromptCache } from "../services/ai.js";
import Image from "../db/models/Image.js";
import Video from "../db/models/Video.js";
import { isDBConnected } from "../db/connection.js";

const router = express.Router();

// Multer config — store in memory (then save to MongoDB)
// Multer config for images (5 MB max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Multer config for broadcast files (CSV, JSON, XLSX — 10 MB max)
const broadcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype.includes("csv") ||
      file.mimetype.includes("json") ||
      file.mimetype.includes("spreadsheet") ||
      file.originalname.endsWith(".csv") ||
      file.originalname.endsWith(".json") ||
      file.originalname.endsWith(".xlsx");
    if (ok) cb(null, true);
    else cb(new Error("Only CSV, JSON, or XLSX files are allowed"), false);
  },
});

// Multer config for videos (50 MB max)
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"), false);
    }
  },
});

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
  const awaitingAgent = sessions.filter((s) => s.state === "ESCALATED" && s.metadata?.escalation?.status === "awaiting_agent").length;
  const agentResponded = sessions.filter((s) => s.metadata?.escalation?.status === "responded").length;

  res.json({
    activeSessions: await getActiveSessionCount(),
    leads,
    totalMessages,
    escalated,
    awaitingAgent,
    agentResponded,
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
  const session = await getSessionReadOnly(req.params.userId);
  if (!session || session.leadScore === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }
  res.json(formatLeadReport(session));
});

/**
 * GET /api/escalations — List all conversations escalated to a human agent.
 * Includes every ESCALATED session regardless of lead score (so agent requests
 * from brand-new contacts show up too).
 */
router.get("/escalations", async (req, res) => {
  const sessions = await getAllSessions();
  const escalations = sessions
    .filter((s) => s.state === "ESCALATED")
    .map((s) => ({
      userId: s.userId,
      name: s.leadData?.name || null,
      email: s.leadData?.email || null,
      country: s.leadData?.country || null,
      budget: s.leadData?.budget || null,
      propertyInterest: s.leadData?.propertyInterest || null,
      score: s.leadScore,
      tier: getLeadTier(s.leadScore),
      state: s.state,
      escalationStatus: s.metadata?.escalation?.status || "awaiting_agent",
      escalationReason: s.metadata?.escalation?.reason || null,
      escalatedAt: s.metadata?.escalation?.timestamp || null,
      lastActivity: s.lastActivity,
      lastMessage: s.history?.length > 0 ? s.history[s.history.length - 1].content?.substring(0, 80) : null,
    }))
    .sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0));

  res.json({ count: escalations.length, escalations });
});

/**
 * DELETE /api/conversations — Delete ALL conversations/sessions
 */
router.delete("/conversations", async (req, res) => {
  await deleteAllSessions();
  res.json({ success: true, message: "All conversations cleared" });
});

/**
 * DELETE /api/conversations/:userId — Delete a specific conversation
 */
router.delete("/conversations/:userId", async (req, res) => {
  await deleteSession(req.params.userId);
  res.json({ success: true, message: `Conversation ${req.params.userId} deleted` });
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
    escalationStatus: s.metadata?.escalation?.status || null,
    lastMessage: s.history?.length > 0 ? s.history[s.history.length - 1].content?.substring(0, 80) : null,
    lastActivity: s.lastActivity,
    firstContact: s.firstContact || s.lastActivity,
    name: s.leadData?.name || null,
    email: s.leadData?.email || null,
    propertyInterest: s.leadData?.propertyInterest || null,
    budget: s.leadData?.budget || null,
    consentGiven: s.consentGiven || false,
    offTopicCount: s.metadata?.offTopicCount || 0,
  }));
  res.json({ count: convos.length, conversations: convos });
});

/**
 * GET /api/conversations/export-csv — Export a summary of ALL conversations as CSV
 * Optional query: ?from=<ISO date>&to=<ISO date> to filter by last activity
 * Must be registered before /conversations/:userId so "export-csv" isn't parsed as a userId.
 */
router.get("/conversations/export-csv", async (req, res) => {
  let sessions = await getAllSessions();
  const { from, to } = req.query;
  if (from) {
    const f = new Date(from).getTime();
    if (!Number.isNaN(f)) sessions = sessions.filter((s) => (s.lastActivity || 0) >= f);
  }
  if (to) {
    const t = new Date(to).getTime();
    if (!Number.isNaN(t)) sessions = sessions.filter((s) => (s.lastActivity || 0) <= t);
  }
  const csv = exportConversationsSummaryCSV(sessions);
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="conversations-summary-${new Date().toISOString().split("T")[0]}.csv"`);
  res.send(csv);
});

/**
 * GET /api/conversations/:userId — Get conversation history
 */
router.get("/conversations/:userId", async (req, res) => {
  const session = await getSessionReadOnly(req.params.userId);
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
    name: session.leadData?.name || null,
    email: session.leadData?.email || null,
    propertyInterest: session.leadData?.propertyInterest || null,
    budget: session.leadData?.budget || null,
    consentGiven: session.consentGiven || false,
    firstContact: session.firstContact || session.lastActivity,
    lastActivity: session.lastActivity,
  });
});

/**
 * GET /api/conversations/:userId/export-csv — Export one conversation's full transcript as CSV
 */
router.get("/conversations/:userId/export-csv", async (req, res) => {
  const session = await getSessionReadOnly(req.params.userId);
  if (!session) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  const csv = exportConversationTranscriptCSV(session);
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="conversation-${req.params.userId}.csv"`);
  res.send(csv);
});

/**
 * GET /api/conversations/:userId/export-json — Export one conversation (transcript + lead data) as JSON
 */
router.get("/conversations/:userId/export-json", async (req, res) => {
  const session = await getSessionReadOnly(req.params.userId);
  if (!session) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  const json = exportConversationJSON(session);
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="conversation-${req.params.userId}.json"`);
  res.send(JSON.stringify(json, null, 2));
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
    invalidatePromptCache();
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
    invalidatePromptCache();
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
    invalidatePromptCache();
    // Also remove all associated images and videos from DB
    const deletedImages = await Image.deleteMany({ propertyId: req.params.id });
    const deletedVideos = await Video.deleteMany({ propertyId: req.params.id });
    console.log(`[API] Deleted property ${req.params.id} + ${deletedImages.deletedCount} images + ${deletedVideos.deletedCount} videos`);
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
 * DELETE /api/viewings — Delete ALL viewings
 */
router.delete("/viewings", async (req, res) => {
  await deleteAllViewings();
  res.json({ success: true, message: "All viewings cleared" });
});

/**
 * DELETE /api/viewings/:id — Delete a specific viewing
 */
router.delete("/viewings/:id", async (req, res) => {
  await deleteViewing(req.params.id);
  res.json({ success: true, message: `Viewing ${req.params.id} deleted` });
});

/**
 * GET /api/viewings/slots/:date — Get available viewing slots for a date
 */
router.get("/viewings/slots/:date", async (req, res) => {
  const propertyId = req.query.propertyId || null;
  const slots = await getAvailableSlots(req.params.date, propertyId);
  res.json({ date: req.params.date, propertyId, availableSlots: slots });
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

  // Notify client
  try {
    const phone = viewing.phone || viewing.userId;
    if (phone) {
      if (status === "CONFIRMED") {
        await sendTextMessage(phone, formatViewingConfirmed(viewing));
        console.log(`[Viewing] Sent confirmation to ${phone} for ${viewing.viewingId}`);
      } else if (status === "CANCELLED") {
        await sendTextMessage(phone, formatViewingCancelled(viewing));
        console.log(`[Viewing] Sent cancellation to ${phone} for ${viewing.viewingId}`);
      }
    }
  } catch (err) {
    console.error(`[Viewing] Failed to notify client:`, err.message);
  }

  // Notify the correct agent when confirmed from dashboard
  // Land properties go to the land sales agent, residential to escalation agent
  if (status === "CONFIRMED") {
    try {
      const viewingProperty = viewing.propertyId ? await getPropertyById(viewing.propertyId) : null;
      const isLand = viewingProperty?.category === "land_investment" || viewingProperty?.type === "Land";
      const agentNumber = isLand
        ? config.company.landSalesWhatsApp.replace("+", "")
        : config.company.escalationWhatsApp.replace("+", "");
      const clientPhone = viewing.phone || viewing.userId || "N/A";
      const agentMsg =
        `📅 *New Viewing Confirmed (Dashboard)*\n\n` +
        `👤 *Client:* ${viewing.name || "Not provided"}\n` +
        `📱 *Phone:* ${clientPhone}\n` +
        `📧 *Email:* ${viewing.email || "Not provided"}\n` +
        `🏠 *Property:* ${viewing.propertyName || "Not specified"}\n` +
        `📆 *Date:* ${formatDateNice(viewing.preferredDate)}\n` +
        `⏰ *Time:* ${formatTimeNice(viewing.preferredTime)}\n` +
        `📋 *Reference:* ${viewing.viewingId}\n\n` +
        `Reply to client: wa.me/${clientPhone.replace(/\D/g, "")}`;
      await sendTextMessage(agentNumber, agentMsg);
    } catch (agentErr) {
      console.error(`[Viewing] Failed to notify agent:`, agentErr.message);
    }
  }

  res.json(viewing);
});

/**
 * POST /api/viewings/:id/notify-agent — Manually send viewing details to agent WhatsApp
 */
router.post("/viewings/:id/notify-agent", async (req, res) => {
  const viewing = await getViewingById(req.params.id);
  if (!viewing) return res.status(404).json({ error: "Viewing not found" });

  try {
    const agentNumber = config.company.escalationWhatsApp.replace("+", "");
    const clientPhone = viewing.phone || viewing.userId || "N/A";
    const agentMsg =
      `📅 *Viewing Details (Manual Send)*\n\n` +
      `👤 *Client:* ${viewing.name || "Not provided"}\n` +
      `📱 *Phone:* ${clientPhone}\n` +
      `📧 *Email:* ${viewing.email || "Not provided"}\n` +
      `🏠 *Property:* ${viewing.propertyName || "Not specified"}\n` +
      `📆 *Date:* ${formatDateNice(viewing.preferredDate)}\n` +
      `⏰ *Time:* ${formatTimeNice(viewing.preferredTime)}\n` +
      `📋 *Reference:* ${viewing.viewingId}\n` +
      `📌 *Status:* ${viewing.status}\n\n` +
      `Reply to client: wa.me/${clientPhone.replace(/\D/g, "")}`;
    await sendTextMessage(agentNumber, agentMsg);
    res.json({ success: true, message: "Agent notified via WhatsApp" });
  } catch (err) {
    console.error(`[Viewing] Failed to notify agent:`, err.message);
    res.status(502).json({ error: "Failed to send WhatsApp to agent: " + err.message });
  }
});

/**
 * GET /api/crm/stats — CRM sync status & stats
 */
router.get("/crm/stats", (req, res) => {
  res.json(getCRMSyncStats());
});

/**
 * POST /api/email/test — Send a test email to verify SMTP config
 * Body: { "to": "recipient@example.com" }
 */
router.post("/email/test", async (req, res) => {
  const to = req.body?.to;
  if (!to || !/^[\w.+\-]+@[\w\-]+\.[\w.\-]+$/.test(to)) {
    return res.status(400).json({ error: "Provide a valid 'to' email address" });
  }
  const result = await sendTestEmail(to);
  res.status(result.sent ? 200 : 502).json(result);
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

// ========== IMAGE UPLOAD & SERVING ==========

/**
 * POST /api/properties/:id/images — Upload images for a property (max 5 at once)
 */
router.post("/properties/:id/images", upload.array("images", 5), async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ error: "Database not connected" });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No image files provided" });
  }

  try {
    const propertyId = req.params.id;
    // Verify property exists
    const property = await getPropertyById(propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Count existing images for ordering
    const existingCount = await Image.countDocuments({ propertyId });

    const savedImages = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const imageId = uuidv4();
      const image = new Image({
        imageId,
        propertyId,
        filename: file.originalname,
        contentType: file.mimetype,
        data: file.buffer,
        size: file.size,
        caption: req.body.caption || "",
        order: existingCount + i,
      });
      await image.save();
      savedImages.push({
        imageId,
        filename: file.originalname,
        size: file.size,
        url: `/api/images/${imageId}`,
      });
    }

    // Update property's images array with the serve URLs.
    // Preserve any existing external (web) image URLs so uploading doesn't wipe them.
    const existingExternal = (property.images || []).filter((u) => !u.includes("/api/images/"));
    const allImages = await Image.find({ propertyId }).sort({ order: 1 }).select("imageId");
    const uploadedUrls = allImages.map((img) => `/api/images/${img.imageId}`);
    const imageUrls = [...existingExternal, ...uploadedUrls];
    const updated = await updateProperty(propertyId, { images: imageUrls });
    console.log(`[API] Updated property ${propertyId} images: ${imageUrls.length} URLs (${existingExternal.length} external + ${uploadedUrls.length} uploaded), saved=${!!updated}`);

    res.status(201).json({ uploaded: savedImages.length, images: savedImages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/images/:imageId — Serve an image (publicly accessible for WhatsApp)
 */
router.get("/images/:imageId", async (req, res) => {
  try {
    const image = await Image.findOne({ imageId: req.params.imageId });
    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }
    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "public, max-age=86400"); // cache 24h
    res.send(image.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/properties/:id/images — List images for a property
 */
router.get("/properties/:id/images", async (req, res) => {
  try {
    const images = await Image.find({ propertyId: req.params.id })
      .sort({ order: 1 })
      .select("imageId filename contentType size caption order createdAt");
    res.json({
      propertyId: req.params.id,
      count: images.length,
      images: images.map((img) => ({
        imageId: img.imageId,
        filename: img.filename,
        size: img.size,
        caption: img.caption,
        url: `/api/images/${img.imageId}`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/images/:imageId — Delete a single image
 */
router.delete("/images/:imageId", async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ error: "Database not connected" });
  }
  try {
    const image = await Image.findOneAndDelete({ imageId: req.params.imageId });
    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }
    // Update property's images array — preserve external (web) URLs
    const prop = await getPropertyById(image.propertyId);
    const existingExternal = (prop?.images || []).filter((u) => !u.includes("/api/images/"));
    const remaining = await Image.find({ propertyId: image.propertyId }).sort({ order: 1 }).select("imageId");
    const imageUrls = [...existingExternal, ...remaining.map((img) => `/api/images/${img.imageId}`)];
    await updateProperty(image.propertyId, { images: imageUrls });

    res.json({ success: true, message: "Image deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== VIDEO UPLOAD & SERVING ==========

/**
 * POST /api/properties/:id/videos — Upload videos for a property (max 3 at once)
 */
router.post("/properties/:id/videos", videoUpload.array("videos", 3), async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ error: "Database not connected" });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No video files provided" });
  }

  try {
    const propertyId = req.params.id;
    const property = await getPropertyById(propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    const existingCount = await Video.countDocuments({ propertyId });
    const savedVideos = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const videoId = uuidv4();
      const video = new Video({
        videoId,
        propertyId,
        filename: file.originalname,
        contentType: file.mimetype,
        data: file.buffer,
        size: file.size,
        caption: req.body.caption || "",
        order: existingCount + i,
      });
      await video.save();
      savedVideos.push({
        videoId,
        filename: file.originalname,
        size: file.size,
        url: `/api/videos/${videoId}`,
      });
    }

    // Update property's videos array
    const allVideos = await Video.find({ propertyId }).sort({ order: 1 }).select("videoId");
    const videoUrls = allVideos.map((v) => `/api/videos/${v.videoId}`);
    await updateProperty(propertyId, { videos: videoUrls });
    console.log(`[API] Updated property ${propertyId} videos: ${videoUrls.length} URLs`);

    res.status(201).json({ uploaded: savedVideos.length, videos: savedVideos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/videos/:videoId — Serve a video (streaming support)
 */
router.get("/videos/:videoId", async (req, res) => {
  try {
    const video = await Video.findOne({ videoId: req.params.videoId });
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.set("Content-Type", video.contentType);
    res.set("Content-Length", video.size);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Accept-Ranges", "bytes");
    res.send(video.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/properties/:id/videos — List videos for a property
 */
router.get("/properties/:id/videos", async (req, res) => {
  try {
    const videos = await Video.find({ propertyId: req.params.id })
      .sort({ order: 1 })
      .select("videoId filename contentType size caption order createdAt");
    res.json({
      propertyId: req.params.id,
      count: videos.length,
      videos: videos.map((v) => ({
        videoId: v.videoId,
        filename: v.filename,
        size: v.size,
        caption: v.caption,
        url: `/api/videos/${v.videoId}`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/videos/:videoId — Delete a single video
 */
router.delete("/videos/:videoId", async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ error: "Database not connected" });
  }
  try {
    const video = await Video.findOneAndDelete({ videoId: req.params.videoId });
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }
    // Update property's videos array
    const remaining = await Video.find({ propertyId: video.propertyId }).sort({ order: 1 }).select("videoId");
    const videoUrls = remaining.map((v) => `/api/videos/${v.videoId}`);
    await updateProperty(video.propertyId, { videos: videoUrls });

    res.json({ success: true, message: "Video deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== BROADCAST MESSAGES ==========

/**
 * POST /api/broadcast/send — Send broadcast message to multiple agents
 * Body: {
 *   "phoneNumbers": ["+233123456789", "+233987654321"],
 *   "message": "Join our Agent Mixer on April 30th!",
 *   "options": { "batchSize": 20, "delayMs": 2000 }
 * }
 */
router.post("/broadcast/send", async (req, res) => {
  try {
    const { phoneNumbers, message } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: "Provide phoneNumbers array with at least one number" });
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Provide a non-empty message" });
    }

    const { templateName, templateLanguage } = req.body;
    const options = templateName ? { templateName, templateLanguage: templateLanguage || "en_US" } : {};

    console.log(`[API] Starting broadcast to ${phoneNumbers.length} agents${templateName ? ` (template: ${templateName})` : ""}`);

    const results = await broadcastMessage(phoneNumbers, message, options);
    const durationSeconds = (results.endTime - results.startTime) / 1000;

    try {
      await saveBroadcastResult({
        title: `Broadcast - ${new Date().toLocaleString()}`,
        message: templateName ? `[Template: ${templateName}]` : message,
        phoneNumbers,
        ...results,
        durationSeconds,
      });
    } catch (saveErr) {
      console.error("[API] Failed to save broadcast result:", saveErr.message);
    }

    res.status(202).json({
      status: "broadcast_completed",
      ...results,
      durationSeconds,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/leads-audience — Preview how many captured leads a broadcast would reach
 * Optional query: ?tier=hot|warm|cold
 */
router.get("/broadcast/leads-audience", async (req, res) => {
  try {
    const recipients = await getLeadRecipients(req.query.tier);
    res.json({ count: recipients.length, recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/broadcast/send-leads — Send a broadcast to captured lead contacts.
 * Body: { message, title?, tier?, phones? }
 *   - tier   : optional audience filter (hot|warm|cold) — sends to all matching leads
 *   - phones : optional array of specific phone numbers to send to (overrides tier).
 *              Names are pulled from captured leads when available for {name} personalisation.
 *   message supports {name} / {first_name} placeholders.
 */
router.post("/broadcast/send-leads", async (req, res) => {
  try {
    const { message, title, tier, phones } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Provide a non-empty message" });
    }

    let recipients;
    if (Array.isArray(phones) && phones.length > 0) {
      // Specific contacts — look up names from captured leads for personalisation
      const leadMap = new Map((await getLeadRecipients()).map((r) => [r.phone, r.name]));
      const seen = new Set();
      recipients = [];
      for (const p of phones) {
        const phone = normalizePhone(p);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        recipients.push({ phone, name: leadMap.get(phone) || "" });
      }
    } else {
      recipients = await getLeadRecipients(tier);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No valid recipients to send to" });
    }

    console.log(`[API] Broadcasting to ${recipients.length} captured leads${tier ? ` (tier: ${tier})` : ""}`);

    const results = await broadcastMessage(recipients, message);
    const durationSeconds = (results.endTime - results.startTime) / 1000;

    const phoneNumbers = recipients.map((r) => r.phone);
    try {
      await saveBroadcastResult({
        title: title || `Leads Broadcast - ${new Date().toLocaleString()}`,
        message,
        phoneNumbers,
        ...results,
        durationSeconds,
        notes: tier ? `Audience: ${tier} leads` : "Audience: all captured leads",
      });
    } catch (saveErr) {
      console.error("[API] Failed to save leads broadcast result:", saveErr.message);
    }

    res.status(202).json({ status: "broadcast_completed", audience: recipients.length, ...results, durationSeconds });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Normalise a raw phone/WhatsApp id to "+<international digits>", or null if invalid.
 */
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8) return null; // clearly invalid
  return `+${digits}`;
}

/**
 * Build the list of broadcast recipients from captured leads.
 * Each recipient is { phone: "+<international>", name }.
 */
async function getLeadRecipients(tier = null) {
  const sessions = await getAllSessions();
  const wanted = tier ? String(tier).toLowerCase() : null;
  const seen = new Set();
  const recipients = [];

  for (const s of sessions) {
    // A "lead" is any contact we've captured (has some lead score / name)
    if (!(s.leadScore > 0 || s.leadData?.name)) continue;
    if (wanted && getLeadTier(s.leadScore).toLowerCase() !== wanted) continue;

    const phone = normalizePhone(s.leadData?.phone || s.userId);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    recipients.push({ phone, name: s.leadData?.name || "" });
  }

  return recipients;
}

/**
 * POST /api/broadcast/upload-excel — Upload Excel file and send broadcast
 * Expects multipart form data with "file" and "message" fields
 * File must be .xlsx or .csv with phone numbers
 */
router.post("/broadcast/upload-excel", broadcastUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { message, phoneField } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Provide a non-empty message in body" });
    }

    // Parse file based on type
    let phoneNumbers = [];

    if (req.file.mimetype.includes("json")) {
      // JSON file
      const jsonData = JSON.parse(req.file.buffer.toString());
      phoneNumbers = parsePhoneNumbers(jsonData, phoneField);
    } else if (req.file.originalname.endsWith(".csv")) {
      // CSV file — simple parser
      const csvText = req.file.buffer.toString();
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const phoneColumnIndex = headers.findIndex(
        (h) => h.includes("phone") || h.includes("whatsapp") || h.includes("mobile")
      );

      if (phoneColumnIndex === -1) {
        return res.status(400).json({ error: "Could not find phone column in CSV" });
      }

      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(",").map((c) => c.trim());
        if (cells[phoneColumnIndex]) {
          let phone = cells[phoneColumnIndex];
          if (!phone.startsWith("+")) {
            phone = "+233" + phone.replace(/^0/, "");
          }
          phoneNumbers.push(phone);
        }
      }
    } else if (req.file.mimetype.includes("spreadsheet") || req.file.originalname.endsWith(".xlsx")) {
      // XLSX file — use simple approach
      // For production, use 'xlsx' package
      return res.status(400).json({
        error: "XLSX parsing not set up yet. Please convert to CSV or use JSON format.",
        hint: "Or install 'xlsx' package and implement parsing",
      });
    } else {
      return res.status(400).json({ error: "Unsupported file format. Use CSV, JSON, or XLSX" });
    }

    if (phoneNumbers.length === 0) {
      return res.status(400).json({ error: "No valid phone numbers found in file" });
    }

    console.log(`[API] Parsed ${phoneNumbers.length} phone numbers from uploaded file`);

    const { templateName, templateLanguage } = req.body;
    const options = templateName ? { templateName, templateLanguage: templateLanguage || "en_US" } : {};

    const results = await broadcastMessage(phoneNumbers, message, options);

    // Save results to database
    try {
      await saveBroadcastResult({
        title: `Broadcast - ${new Date().toLocaleString()}`,
        message: templateName ? `[Template: ${templateName}]` : message,
        phoneNumbers,
        ...results,
        filename: req.file.originalname,
        durationSeconds: (results.endTime - results.startTime) / 1000,
      });
    } catch (err) {
      console.error("[API] Failed to save broadcast result:", err.message);
      // Don't fail the broadcast if result saving fails
    }

    res.status(202).json({
      status: "broadcast_completed",
      filename: req.file.originalname,
      parsedNumbers: phoneNumbers.length,
      ...results,
      durationSeconds: (results.endTime - results.startTime) / 1000,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/status — Check broadcast status (for async tracking)
 */
router.get("/broadcast/status", (req, res) => {
  res.json({
    info: "Broadcasts execute synchronously. Check response from /api/broadcast/send or /api/broadcast/upload-excel",
    endpoints: {
      send: "POST /api/broadcast/send",
      uploadExcel: "POST /api/broadcast/upload-excel",
    },
  });
});

// ========== DRAFT MANAGEMENT ==========

/**
 * POST /api/broadcast/drafts — Create a new draft
 * Body: { "title": "Event Reminder", "message": "You're invited..." }
 */
router.post("/broadcast/drafts", async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required" });
    }
    const draft = await saveDraft(title, message);
    res.status(201).json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/drafts — Get all saved drafts
 */
router.get("/broadcast/drafts", async (req, res) => {
  try {
    const drafts = await getAllDrafts();
    res.json({ count: drafts.length, drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/drafts/:draftId — Get a specific draft
 */
router.get("/broadcast/drafts/:draftId", async (req, res) => {
  try {
    const draft = await getDraft(req.params.draftId);
    res.json(draft);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * PUT /api/broadcast/drafts/:draftId — Update a draft
 * Body: { "title": "...", "message": "..." }
 */
router.put("/broadcast/drafts/:draftId", async (req, res) => {
  try {
    const { title, message } = req.body;
    const updates = {};
    if (title) updates.title = title;
    if (message) updates.message = message;
    const draft = await updateDraft(req.params.draftId, updates);
    res.json(draft);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * DELETE /api/broadcast/drafts/:draftId — Delete a draft
 */
router.delete("/broadcast/drafts/:draftId", async (req, res) => {
  try {
    await deleteDraft(req.params.draftId);
    res.json({ success: true, message: "Draft deleted" });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ========== BROADCAST RESULTS & EXPORT ==========

/**
 * GET /api/broadcast/results — Get all broadcast results (sent broadcasts)
 */
router.get("/broadcast/results", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const skip = parseInt(req.query.skip || "0", 10);
    const { results, total } = await getBroadcastResults({ limit, skip });
    res.json({ count: results.length, total, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/results/:broadcastId — Get a specific broadcast result
 */
router.get("/broadcast/results/:broadcastId", async (req, res) => {
  try {
    const result = await getBroadcastResult(req.params.broadcastId);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/results/:broadcastId/export-csv — Export specific broadcast as CSV
 */
router.get("/broadcast/results/:broadcastId/export-csv", async (req, res) => {
  try {
    const broadcast = await getBroadcastResult(req.params.broadcastId);
    const csv = exportBroadcastResultAsCSV(broadcast);
    res.set("Content-Type", "text/csv");
    res.set("Content-Disposition", `attachment; filename="broadcast-results-${broadcast.broadcastId}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/export-summary-csv — Export all broadcast results as summary CSV
 */
router.get("/broadcast/export-summary-csv", async (req, res) => {
  try {
    const { results } = await getBroadcastResults({ limit: 1000 });
    const csv = exportBroadcastSummaryAsCSV(results);
    res.set("Content-Type", "text/csv");
    res.set("Content-Disposition", `attachment; filename="broadcast-summary-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
