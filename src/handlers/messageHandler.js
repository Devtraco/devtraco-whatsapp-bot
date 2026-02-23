import { generateResponse } from "../services/ai.js";
import { getSession, addMessage, updateState, setConsent } from "../services/session.js";
import { captureLead, shouldAutoEscalate } from "../services/leadCapture.js";
import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  markAsRead,
} from "../services/whatsapp.js";
import { getAllProperties, formatPropertyCard } from "../data/properties.js";
import config from "../config/index.js";

/**
 * Main conversation handler — routes every incoming message through the AI pipeline.
 */
export async function handleIncomingMessage(messagePayload) {
  const { from, messageId, type, text, interactive } = normalizePayload(messagePayload);

  if (!from || !messageId) return;

  // Mark as read immediately for good UX
  markAsRead(messageId);

  const session = getSession(from);
  const userText = extractUserText(type, text, interactive);

  if (!userText) return; // unsupported message type

  // --- Command shortcuts ---
  const command = userText.trim().toLowerCase();

  if (command === "/reset" || command === "start over") {
    updateState(from, "GREETING");
    session.history = [];
    await sendTextMessage(from, "🔄 Conversation reset! How can I help you today?");
    return;
  }

  if (command === "/menu" || command === "menu") {
    await sendMainMenu(from);
    return;
  }

  if (command === "/properties" || command === "view properties") {
    await sendPropertyList(from);
    return;
  }

  if (command === "/agent" || command === "speak to agent" || command === "human agent") {
    await handleEscalation(from, "Customer requested human agent");
    return;
  }

  // --- GDPR Consent check (first interaction) ---
  if (!session.consentGiven && session.history.length === 0) {
    setConsent(from, true); // implicit consent by messaging the business
    addMessage(from, "user", userText);
    const greeting = await generateAIResponse(from, session);
    await sendTextMessage(from, greeting);

    // Send welcome menu after first greeting
    setTimeout(() => sendMainMenu(from), 1500);
    return;
  }

  // --- AI conversation pipeline ---
  addMessage(from, "user", userText);
  const aiResult = await generateAIResponseFull(from, session);

  // Handle lead data capture
  if (aiResult.leadData) {
    captureLead(from, aiResult.leadData);
  }

  // Send the response
  await sendTextMessage(from, aiResult.text);

  // Auto-escalate hot leads
  const updatedSession = getSession(from);
  if (shouldAutoEscalate(updatedSession) && updatedSession.state !== "ESCALATED") {
    updateState(from, "ESCALATED");
    setTimeout(async () => {
      await sendTextMessage(
        from,
        "🌟 Great news! Based on our conversation, I'd love to connect you with one of our property consultants who can give you more personalized assistance. A team member will reach out to you shortly!"
      );
    }, 2000);
    console.log(`[Escalation] Auto-escalating HOT lead: ${from}`);
  }

  // Handle explicit escalation from AI
  if (aiResult.escalate) {
    await handleEscalation(from, aiResult.escalate);
  }
}

/**
 * Generate AI response and record it
 */
async function generateAIResponse(from, session) {
  const result = await generateAIResponseFull(from, session);
  if (result.leadData) {
    captureLead(from, result.leadData);
  }
  return result.text;
}

/**
 * Full AI response with structured data
 */
async function generateAIResponseFull(from, session) {
  const result = await generateResponse(session.history);
  addMessage(from, "assistant", result.text);
  return result;
}

/**
 * Send main menu with quick action buttons
 */
async function sendMainMenu(to) {
  await sendButtonMessage(
    to,
    "What would you like to do? Choose an option below or just type your question! 😊",
    [
      { id: "view_properties", title: "🏠 View Properties" },
      { id: "schedule_viewing", title: "📅 Schedule Visit" },
      { id: "speak_agent", title: "👤 Speak to Agent" },
    ],
    "Devtraco Assistant",
    "Type 'menu' anytime to see this again"
  );
}

/**
 * Send the property listing
 */
async function sendPropertyList(to) {
  const properties = getAllProperties();
  const sections = [
    {
      title: "Available Properties",
      rows: properties.map((p) => ({
        id: `property_${p.id}`,
        title: p.name,
        description: `${p.location} — From $${p.priceFrom.toLocaleString()}`,
      })),
    },
  ];

  await sendListMessage(
    to,
    "Here are our available properties. Tap below to explore! 🏡",
    "Browse Properties",
    sections,
    "Devtraco Properties"
  );
}

/**
 * Handle escalation to human agent
 */
async function handleEscalation(to, reason) {
  updateState(to, "ESCALATED");
  await sendTextMessage(
    to,
    `👤 *Connecting you with a team member*\n\nI'm transferring you to one of our property consultants who'll be able to help you further.\n\n📞 You can also reach us directly:\n• Office: ${config.company.phone}\n• Cell: ${config.company.cellPhone}\n• Email: ${config.company.email}\n\nA team member will respond shortly. Thank you for your patience! 🙏`
  );
  console.log(`[Escalation] ${to} — Reason: ${reason}`);
}

/**
 * Normalize the incoming WhatsApp payload
 */
function normalizePayload(messagePayload) {
  return {
    from: messagePayload.from,
    messageId: messagePayload.id,
    type: messagePayload.type,
    text: messagePayload.text?.body || "",
    interactive: messagePayload.interactive || null,
  };
}

/**
 * Extract readable user text from different message types
 */
function extractUserText(type, text, interactive) {
  switch (type) {
    case "text":
      return text;
    case "interactive":
      if (interactive?.type === "button_reply") {
        return interactive.button_reply?.title || interactive.button_reply?.id;
      }
      if (interactive?.type === "list_reply") {
        return interactive.list_reply?.title || interactive.list_reply?.id;
      }
      return null;
    case "image":
    case "video":
    case "document":
      return "I sent a media file";
    case "location":
      return "I shared my location";
    default:
      return null;
  }
}
