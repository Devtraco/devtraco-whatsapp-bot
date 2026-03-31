import { generateResponse } from "../services/ai.js";
import { getSession, addMessage, updateState, setConsent, updateLeadData } from "../services/session.js";
import { captureLead, shouldAutoEscalate } from "../services/leadCapture.js";
import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendImageMessage,
  sendVideoMessage,
  sendTemplateMessage,
  markAsRead,
  getMediaUrl,
  downloadMediaAsBase64,
} from "../services/whatsapp.js";
import { getAllProperties, getPropertyById, formatPropertyCard, getPropertiesByCategory } from "../data/properties.js";
import { createViewing, formatViewingPending, formatViewingConfirmed, getUserViewings, updateViewingStatus, resolveDate, resolveTime, formatDateNice, formatTimeNice, getAvailableSlots, validateBusinessHours, getNextBusinessDay, getViewingById } from "../services/viewingScheduler.js";
import { sendViewingConfirmationEmail } from "../services/email.js";
import config from "../config/index.js";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// Base URL for serving uploaded images (needed for WhatsApp absolute URLs)
const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${config.port}`;

// --- Agent session keep-alive ---
// WhatsApp only allows interactive/button messages within 24h of last agent message.
// Every 22h we send the agent an activation request. When they reply, the 24h window reopens.
// This continues for up to 7 days after their initial "hi".
const AGENT_SESSION_DAYS = 7;
const KEEP_ALIVE_INTERVAL_MS = 22 * 60 * 60 * 1000; // 22 hours

let agentKeepAliveTimer = null;
let agentSessionExpiry = 0; // epoch ms — 0 means inactive

function startAgentKeepAlive() {
  if (agentKeepAliveTimer) clearInterval(agentKeepAliveTimer);
  agentSessionExpiry = Date.now() + AGENT_SESSION_DAYS * 24 * 60 * 60 * 1000;

  agentKeepAliveTimer = setInterval(async () => {
    if (Date.now() >= agentSessionExpiry) {
      clearInterval(agentKeepAliveTimer);
      agentKeepAliveTimer = null;
      console.log("[Agent] 7-day keep-alive session expired");
      return;
    }
    const agentNumber = config.company.escalationWhatsApp.replace("+", "");
    const daysLeft = Math.ceil((agentSessionExpiry - Date.now()) / (24 * 60 * 60 * 1000));
    try {
      // Try interactive button first (works if agent replied within last 24h)
      await sendButtonMessage(
        agentNumber,
        `🔔 *Devtraco Bot — Session Activation*\n\nTap the button below to keep your client escalation alerts active.\n\n⏳ Session expires in *${daysLeft} day${daysLeft !== 1 ? "s" : ""}*.`,
        [{ id: "agent_keepalive_ack", title: "✅ Keep Active" }],
        "Stay Active"
      );
    } catch {
      // 24h window closed — send plain text asking agent to reply
      await sendTextMessage(
        agentNumber,
        `🔔 *Devtraco Bot — Session Activation Required*\n\nReply to this message to keep your client escalation alerts active with action buttons.\n\n⏳ Session expires in *${daysLeft} day${daysLeft !== 1 ? "s" : ""}*.\n\nIf you don't reply, you'll still receive client alerts as plain text messages.`
      );
    }
    console.log(`[Agent] Sent 22h activation request — ${daysLeft} day(s) remaining`);
  }, KEEP_ALIVE_INTERVAL_MS);

  console.log(`[Agent] Keep-alive started — activation requests every 22h for ${AGENT_SESSION_DAYS} days`);
}

// --- Message deduplication (prevents duplicate processing from webhook retries) ---
const recentMessageIds = new Set();
const DEDUP_TTL = 60_000; // 60 seconds

function isDuplicate(messageId) {
  if (recentMessageIds.has(messageId)) return true;
  recentMessageIds.add(messageId);
  setTimeout(() => recentMessageIds.delete(messageId), DEDUP_TTL);
  return false;
}

/**
 * Main conversation handler — routes every incoming message through the AI pipeline.
 */
export async function handleIncomingMessage(messagePayload) {
  const { from, messageId, type, text, interactive, media } = normalizePayload(messagePayload);

  if (!from || !messageId) return;

  // Deduplicate webhook retries
  if (isDuplicate(messageId)) {
    console.log(`[Dedup] Skipping duplicate message ${messageId}`);
    return;
  }

  // Mark as read immediately for good UX
  markAsRead(messageId);

  // --- Agent message handling ---
  const agentNumber = config.company.escalationWhatsApp.replace("+", "");
  if (from === agentNumber) {
    // Any message from agent refreshes/starts the 7-day keep-alive session
    startAgentKeepAlive();

    // Handle interactive button replies from the agent
    if (type === "interactive") {
      const interactiveId = interactive?.button_reply?.id || "";
      if (interactiveId.startsWith("escalation_respond_")) {
        const clientNumber = interactiveId.replace("escalation_respond_", "");
        await handleAgentResponse(clientNumber, "responded", agentNumber);
        return;
      }
      if (interactiveId.startsWith("escalation_later_")) {
        const clientNumber = interactiveId.replace("escalation_later_", "");
        await handleAgentResponse(clientNumber, "later", agentNumber);
        return;
      }
      if (interactiveId === "agent_keepalive_ack") {
        await sendTextMessage(agentNumber, `✅ Session activated! You'll receive client escalation alerts with action buttons for the next 24 hours. I'll send another activation request before it expires.`);
        return;
      }
    }

    // Respond to greetings with session confirmation
    const agentGreeting = /^(hi|hello|hey|good\s*(?:morning|afternoon|evening)|yo|sup|howdy)[\s!.]*$/i;
    if (agentGreeting.test(text.trim())) {
      const expiryDate = new Date(agentSessionExpiry);
      const expiryStr = expiryDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      await sendTextMessage(
        agentNumber,
        `👋 Hello! I'm your Devtraco property bot assistant.\n\n✅ *Notification session activated for 7 days!*\nYou'll receive client escalation alerts with interactive buttons until *${expiryStr}*.\n\nI'll send you a daily ping to keep the session alive. Reply *hi* anytime to reset the 7-day window.\n\n📲 You're all set — I'll alert you when clients need assistance!`
      );
      return;
    }

    console.log(`[Agent] Message from agent — keep-alive refreshed`);
    return;
  }

  const session = await getSession(from);
  const userText = extractUserText(type, text, interactive, media);

  if (!userText) return; // unsupported message type

  // --- Command shortcuts ---
  const command = userText.trim().toLowerCase();

  if (command === "/reset" || command === "start over") {
    await updateState(from, "GREETING");
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

  const speakToAgentCmd = /^(?:\/agent|speak\s+to\s+(?:an?\s+)?agent|human\s+agent|talk\s+to\s+(?:an?\s+)?agent|connect\s+(?:me\s+)?to\s+(?:an?\s+)?agent|can\s+i\s+speak\s+to\s+(?:an?\s+)?agent|i\s+(?:want|need)\s+(?:to\s+speak\s+to\s+)?(?:an?\s+)?(?:agent|human|person)|get\s+(?:a\s+)?human|real\s+(?:agent|person))$/i;
  if (speakToAgentCmd.test(command)) {
    await handleEscalation(from, "Customer requested human agent");
    return;
  }

  if (command === "/viewings" || command === "my viewings") {
    await sendUserViewings(from);
    return;
  }

  // --- Handle interactive button/list replies ---
  if (type === "interactive") {
    const interactiveId = interactive?.button_reply?.id || interactive?.list_reply?.id || "";

    // GDPR consent responses
    if (interactiveId === "consent_accept") {
      await setConsent(from, true);
      session.metadata = session.metadata || {};
      session.metadata.consentDeclined = false;

      // Check if the user was trying to schedule a viewing before consent
      const pendingProperty = session.metadata.pendingViewingProperty;
      delete session.metadata.pendingViewingProperty;

      // If name already collected (user was in limited mode), go straight to ACTIVE
      if (session.leadData?.name) {
        await updateState(from, "ACTIVE");

        // Resume pending viewing flow instead of generic welcome
        if (pendingProperty && pendingProperty !== "general") {
          const property = await getPropertyById(pendingProperty);
          const propertyName = property?.name || "the property";
          await sendTextMessage(from, `Thank you for your consent, *${session.leadData.name}*! 🙏\n\nLet's continue with scheduling your visit to *${propertyName}*.`);
          session.metadata.scheduling = pendingProperty;
          await addMessage(from, "user", `I'd like to schedule a viewing for ${propertyName}`);
          const aiResult = await generateAIResponseFull(from, session);
          if (aiResult.leadData) await captureLead(from, aiResult.leadData);
          await sendTextMessage(from, aiResult.text);
          if (aiResult.scheduleViewing) {
            await handleViewingSchedule(from, aiResult.scheduleViewing);
          }
        } else if (pendingProperty === "general") {
          await sendTextMessage(from, `Thank you for your consent, *${session.leadData.name}*! 🙏\n\nLet's schedule your property viewing. Which property are you interested in visiting?`);
          await sendPropertyList(from);
        } else {
          const pendingIntent = session.metadata.pendingIntent;
          delete session.metadata.pendingIntent;
          if (pendingIntent) {
            const title = getNameTitle(session.leadData.name);
            const addressed = title ? `${title} ${session.leadData.name}` : session.leadData.name;
            await addMessage(from, "user", pendingIntent);
            const aiResult = await generateAIResponseFull(from, session);
            if (aiResult.leadData) await captureLead(from, aiResult.leadData);
            await sendTextMessage(from, `Thank you, *${addressed}*! 🙏\n\n${aiResult.text}`);
            await sendButtonMessage(
              from,
              "Or would you like to browse our available properties?",
              [{ id: "view_properties", title: "🏠 Browse Properties" }],
              "Devtraco Plus",
              ""
            );
            if (aiResult.scheduleViewing) {
              await handleViewingSchedule(from, aiResult.scheduleViewing);
            }
          } else {
            const title = getNameTitle(session.leadData.name);
            const addressed = title ? `${title} ${session.leadData.name}` : session.leadData.name;
            await sendTextMessage(from, `Thank you for your consent, *${addressed}*! 🙏\n\nYou now have full access. How may I assist you today?`);
            setTimeout(() => sendMainMenu(from), 1500);
          }
        }
      } else {
        await updateState(from, "AWAITING_NAME");
        await sendTextMessage(from, "Thank you for your consent! 🙏\n\nBefore we proceed, may I have your name, please?");
      }
      return;
    }
    if (interactiveId === "consent_decline") {
      session.metadata = session.metadata || {};
      session.metadata.consentDeclined = true;
      const pendingIntent = session.metadata.pendingIntent;
      delete session.metadata.pendingIntent;

      if (session.leadData?.name) {
        await updateState(from, "ACTIVE");
        if (pendingIntent) {
          await sendTextMessage(from, `No problem, *${session.leadData.name}*! 🔒 Your privacy is fully respected.\n\nYou can still browse our properties and get information. Scheduling viewings will require your consent when the time comes.\n\nLet me help you with that.`);
          setTimeout(async () => {
            try {
              const syntheticId = `intent_decline_${from}_${Date.now()}`;
              await handleIncomingMessage({ from, id: syntheticId, text: { body: pendingIntent }, type: "text" });
            } catch (err) {
              console.error("[PendingIntent Decline] Error:", err.message);
            }
          }, 1500);
        } else {
          await sendTextMessage(from, `No problem, *${session.leadData.name}*! 🔒 Your privacy is fully respected.\n\nYou can still browse our properties and get information. Scheduling viewings will require your consent when needed.\n\nHow may I assist you today?`);
          setTimeout(() => sendMainMenu(from), 1500);
        }
      } else {
        await updateState(from, "AWAITING_NAME");
        await sendTextMessage(from, `No problem at all! Your privacy is important to us. 🔒\n\nYou can still browse our properties and learn about what we offer. However, please note that scheduling viewings and personalised services will require your consent.\n\nBefore we begin, may I have your name so I can address you properly?`);
      }
      return;
    }

    // Property detail view from list selection
    if (interactiveId.startsWith("property_")) {
      const propertyId = interactiveId.replace("property_", "");
      const property = await getPropertyById(propertyId);
      if (!property) return;

      // 1. Send property card (emoji-formatted details)
      const card = formatPropertyCard(property);
      await sendTextMessage(from, card);

      // 2. Send ALL images
      await sendPropertyImages(from, propertyId);

      // 3. Generate and send AI description
      await addMessage(from, "user", `Tell me about ${interactive?.list_reply?.title || propertyId}`);
      const aiResult = await generateAIResponseFull(from, session);
      if (aiResult.leadData) await captureLead(from, aiResult.leadData);
      await sendTextMessage(from, aiResult.text);

      // 4. Track cooldown to prevent re-display in the next 5 minutes
      session.metadata = session.metadata || {};
      session.metadata.lastPropertyButtons = { propertyId, time: Date.now() };

      // 5. Send "What would you like to do?" action buttons
      const propertyButtons = property.status === "Sold Out"
        ? [
            { id: "view_properties", title: "More Properties" },
            { id: "speak_agent", title: "Speak to Agent" },
          ]
        : [
            { id: `schedule_${property.id}`, title: "Schedule Visit" },
            { id: "view_properties", title: "More Properties" },
            { id: "speak_agent", title: "Speak to Agent" },
          ];
      await sendButtonMessage(
        from,
        property.status === "Sold Out"
          ? `This property is currently *sold out*. Would you like to explore other options?`
          : `What would you like to do?`,
        propertyButtons,
        property.name
      );
      return;
    }

    // Schedule viewing button from property detail
    if (interactiveId.startsWith("schedule_")) {
      // Check consent before allowing viewing
      if (!session.consentGiven) {
        session.metadata = session.metadata || {};
        session.metadata.pendingViewingProperty = interactiveId.replace("schedule_", "");
        await sendConsentForViewing(from);
        return;
      }
      const propertyId = interactiveId.replace("schedule_", "");
      const property = await getPropertyById(propertyId);
      const propertyName = property?.name || "a property";
      // Set scheduling flag to suppress duplicate property buttons
      session.metadata = session.metadata || {};
      session.metadata.scheduling = propertyId;
      session.metadata.schedulingPropertyName = propertyName;
      await addMessage(from, "user", `I'd like to schedule a viewing for ${propertyName}`);
      const aiResult = await generateAIResponseFull(from, session);
      if (aiResult.leadData) await captureLead(from, aiResult.leadData);
      await sendTextMessage(from, aiResult.text);
      if (aiResult.scheduleViewing) {
        await handleViewingSchedule(from, aiResult.scheduleViewing);
      }
      return;
    }

    // "View Properties" button
    if (interactiveId === "view_properties") {
      await sendPropertyList(from);
      return;
    }

    // "Schedule Visit" button
    if (interactiveId === "schedule_viewing") {
      // Check consent before allowing viewing
      if (!session.consentGiven) {
        session.metadata = session.metadata || {};
        session.metadata.pendingViewingProperty = "general";
        await sendConsentForViewing(from);
        return;
      }
      await addMessage(from, "user", "I'd like to schedule a property viewing");
      const aiResult = await generateAIResponseFull(from, session);
      if (aiResult.leadData) await captureLead(from, aiResult.leadData);
      await sendTextMessage(from, aiResult.text);
      return;
    }

    // "Speak to Agent" button
    if (interactiveId === "speak_agent") {
      await handleEscalation(from, "Customer requested human agent via menu");
      return;
    }

    if (interactiveId === "product_buying_home") {
      session.metadata = session.metadata || {};
      session.metadata.productIntent = "buying_home";
      await updateLeadData(from, {});
      await addMessage(from, "user", "Buying a Home");
      await sendPropertyList(from, "residential");
      return;
    }

    if (interactiveId === "product_land_investment") {
      session.metadata = session.metadata || {};
      session.metadata.productIntent = "land_investment";
      await updateLeadData(from, {});
      await addMessage(from, "user", "Investing in Land");
      await sendPropertyList(from, "land_investment");
      return;
    }

    if (interactiveId === "product_catalogue") {
      session.metadata = session.metadata || {};
      session.metadata.productIntent = "catalogue";
      await updateLeadData(from, {});
      await addMessage(from, "user", "Browse our catalogue");
      const catalogueUrl = config.company.catalogueUrl;
      await sendTextMessage(
        from,
        `📄 *Browse Our Complete Catalogue*\n\nAccess our full catalogue of properties:\n🔗 ${catalogueUrl}\n\nOr would you like to speak with one of our specialists to discuss your specific needs?`
      );
      await sendButtonMessage(
        from,
        "What would you like to do?",
        [
          { id: "back_to_product_intent", title: "< Back" },
          { id: "speak_agent", title: "📞 Speak to Agent" },
        ],
        "Navigation"
      );
      return;
    }

    if (interactiveId === "back_to_product_intent") {
      await updateState(from, "AWAITING_PRODUCT_INTENT");
      await sendTextMessage(from, `\nWhat are you interested in?`);
      await sendButtonMessage(
        from,
        "Choose one of the options below:",
        [
          { id: "product_buying_home", title: "🏠 Buy Home" },
          { id: "product_land_investment", title: "📍 Land Investment" },
          { id: "product_catalogue", title: "📄 Catalogue" },
        ],
        "Product Selection",
        "Devtraco Plus"
      );
      return;
    }
  }

  // --- First message — show welcome, ask name + intent (GDPR shown after intent is known) ---
  if (session.history.length === 0) {
    await addMessage(from, "user", userText); // persist so history.length > 0 on next message
    await updateState(from, "AWAITING_NAME");

    // If first message already contains an inquiry ("Can I get more info on this?", etc.),
    // store it as pendingIntent so it gets processed after the user provides their name.
    const isInquiry = /\?/.test(userText) ||
      /\b(?:more\s+info|information|details|about|tell\s+me|show\s+me|interested\s+in|looking\s+for|do\s+you\s+have|i\s+need|i\s+want|can\s+i|could\s+i)\b/i.test(userText);
    if (isInquiry && userText.trim().length > 10) {
      session.metadata = session.metadata || {};
      session.metadata.pendingIntent = userText;
      await updateLeadData(from, {}); // persist metadata
    }

    const welcomeMsg = `Hello 👋 Welcome to Devtraco Plus\n\nLet's get you the right real estate investment option best for your needs.\n\nBefore we proceed, can you share:\n• Full Name\n• Country you are in?\n• Email Address\n\nLet's start with your full name:`;
    await addMessage(from, "assistant", welcomeMsg);
    await sendTextMessage(from, welcomeMsg);
    return;
  }

  // --- Name collection ---
  if (session.state === "AWAITING_NAME") {
    // Guard: user sent media (image/video/doc) instead of their name.
    // Save the intent and re-ask — do NOT treat the image description as a name.
    if (["image", "video", "document"].includes(type)) {
      session.metadata = session.metadata || {};
      session.metadata.pendingIntent = userText; // e.g. "[Image: I need info on this]"
      await updateLeadData(from, {}); // persist
      await sendTextMessage(
        from,
        `I'd be very glad to help you with that! 😊\n\nBefore I do, could I please know your full name? It helps me personalise your experience.\n\nWhat should I call you?`
      );
      return;
    }

    let name = userText.trim();
    let intent = null;

    // Step 1: If message clearly contains a name intro phrase, don't treat as question
    const hasNameIntro = /(?:my name is|i(?:'m|\s+am)|\bam\b|it's|call me)\s+\w+/i.test(userText);

    // Step 2: Detect questions and greetings with no name — answer via AI and re-ask
    const looksLikeQuestion = !hasNameIntro && (
      /\?/.test(userText) ||
      /^(?:what|where|when|why|who|how|do|does|can|could|is|are|will|would|please|hello+|hi+|hey+|greetings?|good\s*(?:morning|afternoon|evening|night)|sannu|ok(?:ay)?|yes|no)\b/i.test(userText.trim())
    );

    if (looksLikeQuestion) {
      await addMessage(from, "user", userText);
      const aiResult = await generateAIResponseFull(from, session);
      if (aiResult.leadData) await captureLead(from, aiResult.leadData);
      await sendTextMessage(from, `${aiResult.text}\n\n_May I also know your name? 😊_`);
      return;
    }

    // Step 3: Extract name from intro phrases ("My name is John", "I'm John", "Am John")
    const nameMatch = name.match(/(?:my name is|i(?:'m|\s+am)|\bam\b|it's|call me)\s+(.+)/i);
    if (nameMatch) name = nameMatch[1].trim();

    // Step 4: Strip occupation/description suffix (e.g. "Kingsley am a Mason" → "Kingsley")
    name = name.replace(/\s+(?:and\s+)?(?:i'?m|i\s+am|\bam\b)\s+(?:a(?:n)?\s+)?.+$/i, '').trim();

    // Step 5: Separate name from intent — "Name, I need..." or "Name and I want..."
    const separatorMatch = name.match(/^([^,]+?)\s*[,.]?\s*\b(i\s+(?:need|want|would|am|like|'m)|and\s+i|but\s+i|can\s+you|could|do\s+you|what|how|show|tell|looking|interested).+$/i);
    if (separatorMatch) {
      name = separatorMatch[1].trim();
      intent = userText;
    }

    // Step 6: Handle "Name, free-text intent" split at first comma
    if (!separatorMatch && !nameMatch) {
      const commaIdx = name.indexOf(',');
      if (commaIdx > 0) {
        const beforeComma = name.substring(0, commaIdx).trim();
        const afterComma = name.substring(commaIdx + 1).trim();
        if (beforeComma.split(/\s+/).length <= 3 && afterComma.length > 5) {
          name = beforeComma;
          intent = userText;
        }
      }
    }

    name = name.replace(/[.!,]+$/, '').trim();

    // Step 7: Plausibility check — extracted result must look like an actual name
    const nameWords = name.split(/\s+/);
    const looksLikeName = nameWords.length >= 1 && nameWords.length <= 5 &&
      name.length >= 2 && !name.includes('?') &&
      !/^(?:ok|okay|yes|no|maybe|sure|fine|you|they|we|hello|hi|hey|sannu|please|greetings?)\b/i.test(name);

    if (!looksLikeName) {
      await addMessage(from, "user", userText);
      const aiResult = await generateAIResponseFull(from, session);
      if (aiResult.leadData) await captureLead(from, aiResult.leadData);
      await sendTextMessage(from, `${aiResult.text}\n\n_May I also know your name? 😊_`);
      return;
    }

    await updateLeadData(from, { name });
    await addMessage(from, "user", userText);

    if (intent) {
      // Name + intent given — store intent, move to country collection
      session.metadata = session.metadata || {};
      session.metadata.pendingIntent = intent;
      session.metadata.inWelcomeFlow = true;
      await updateLeadData(from, {});
      await updateState(from, "AWAITING_COUNTRY");
      await sendTextMessage(from, `Thank you, *${name}*! 😊\n\nWhich country are you in?`);
    } else if (session.metadata?.pendingIntent) {
      // Name only, but first message already had an inquiry stored
      session.metadata.inWelcomeFlow = true;
      await updateLeadData(from, {});
      await updateState(from, "AWAITING_COUNTRY");
      await sendTextMessage(from, `Nice to meet you, *${name}*! 😊\n\nWhich country are you in?`);
    } else {
      // Name only — move to country collection
      session.metadata = session.metadata || {};
      session.metadata.inWelcomeFlow = true;
      await updateLeadData(from, {});
      await updateState(from, "AWAITING_COUNTRY");
      await addMessage(from, "assistant", `Nice to meet you, ${name}! Which country are you in?`);
      await sendTextMessage(from, `Nice to meet you, *${name}*! 😊\n\nWhich country are you in?`);
    }
    return;
  }

  // --- Country collection (after name) ---
  if (session.state === "AWAITING_COUNTRY") {
    const country = userText.trim();

    // Basic validation — accept any country-like input (at least 2 chars, no excessive symbols)
    const looksLikeCountry = country.length >= 2 && country.length <= 100 &&
      !country.includes('?') &&
      !/^(?:ok|okay|yes|no|maybe|sure|fine|please|what|where|when|why|how)\b/i.test(country);

    if (!looksLikeCountry) {
      await addMessage(from, "user", userText);
      await sendTextMessage(from, `Please provide a valid country name or location. For example: "Ghana", "United States", "United Kingdom", etc.`);
      return;
    }

    await updateLeadData(from, { country });
    await addMessage(from, "user", userText);
    await updateState(from, "AWAITING_EMAIL");
    await sendTextMessage(from, `Thank you! Now, could you please share your email address?\n\nYou can also type *skip* if you prefer to provide it later.`);
    return;
  }

  // --- Email collection (early in welcome flow or after viewing confirmation) ---
  if (session.state === "AWAITING_EMAIL") {
    const emailMatch = userText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const skipEmail = userText.trim().toLowerCase() === "skip";

    if (emailMatch || skipEmail) {
      const email = emailMatch ? emailMatch[0] : "Not provided";
      if (emailMatch) {
        await updateLeadData(from, { email });
      }
      await addMessage(from, "user", userText);

      // Check if we're in the welcome flow or post-viewing
      const inWelcomeFlow = session.metadata?.inWelcomeFlow;

      if (inWelcomeFlow) {
        // Welcome flow: transition to product intent selection
        await updateState(from, "AWAITING_PRODUCT_INTENT");
        delete session.metadata.inWelcomeFlow; // Clear flag
        await updateLeadData(from, {});

        if (emailMatch) {
          await sendTextMessage(from, `📧 Thank you! We've noted your email: *${email}*`);
        } else {
          await sendTextMessage(from, `No problem! You can provide your email later if needed.`);
        }

        await sendTextMessage(from, `\nWhat are you interested in?`);
        await sendButtonMessage(
          from,
          "Choose one of the options below:",
          [
            { id: "product_buying_home", title: "🏠 Buy Home" },
            { id: "product_land_investment", title: "📍 Land Investment" },
            { id: "product_catalogue", title: "📄 Catalogue" },
          ],
          "Product Selection",
          "Devtraco Plus"
        );
      } else {
        // Post-viewing: acknowledge email and transition to ACTIVE
        await updateState(from, "ACTIVE");
        await sendTextMessage(from, `📧 Thank you! We've noted your email: *${email}*. A confirmation email is on its way.`);
        await addMessage(from, "assistant", `Thank you, email noted: ${email}`);
        await sendTextMessage(from, `Is there anything else I can help you with? 😊`);
      }
      return;
    }

    // Didn't look like an email — prompt again
    if (!skipEmail) {
      await sendTextMessage(from, `Please provide a valid email address, or type *skip* if you'd prefer not to.`);
    }
    return;
  }

  // --- Product intent selection (after country and email) ---
  if (session.state === "AWAITING_PRODUCT_INTENT") {
    // This state is primarily handled by interactive button replies (see below)
    // If the user types text instead, ask them to use the buttons
    await sendTextMessage(from, `Please use the buttons above to select your interest. 😊`);
    return;
  }

  // --- Intent collection (kept for backward compatibility) ---
  if (session.state === "AWAITING_INTENT") {
    session.metadata = session.metadata || {};
    session.metadata.pendingIntent = userText;
    await addMessage(from, "user", userText);
    await updateLeadData(from, {});
    await sendConsentRequest(from, session.leadData?.name, userText);
    return;
  }

  // --- Email collection after viewing (legacy path for direct email requests) ---
  // NOTE: This section is now handled in the earlier AWAITING_EMAIL handler above
  // It is no longer reachable since state checks email early in welcome flow

  // (Viewing confirmation step removed — viewings are now booked immediately)

  // --- Suggested-date interception ---
  // When a viewing was rejected and the system suggested an alternative date,
  // intercept time-only replies (e.g. "10", "10am", "2pm") and use the suggested date.
  if (session.metadata?.suggestedDate && session.metadata?.suggestedProperty) {
    const timeCandidate = resolveTime(userText.trim());
    if (timeCandidate) {
      const sugDate = session.metadata.suggestedDate;
      const sugProp = session.metadata.suggestedProperty;
      console.log(`[Scheduling] Intercepted time-only reply "${userText}" — using suggested date ${sugDate}`);

      // Clear suggested context before creating
      delete session.metadata.suggestedDate;
      delete session.metadata.suggestedProperty;

      await addMessage(from, "user", userText);

      await handleViewingSchedule(from, {
        propertyId: sugProp.id,
        propertyName: sugProp.name,
        preferredDate: sugDate,
        preferredTime: timeCandidate,
        name: session.leadData?.name || "Not provided",
      });
      return;
    }
  }

  // --- Off-topic guard ---
  // Detect users consistently asking for jobs, money, romance, or totally unrelated topics.
  // After 2 off-topic exchanges the system sends one polite closure and stops engaging.
  const OFF_TOPIC_PATTERNS = [
    // Job / employment seeking
    /\b(?:looking\s+for\s+(?:a\s+)?(?:job|work)|find\s+(?:me\s+)?(?:a\s+)?(?:job|work|company)|hire\s+me|employ\s+me|i\s+need\s+(?:a\s+)?(?:job|work)|i\s+want\s+to\s+work|mechanic|plumber|electrician|driver|gardener|security\s+guard|domestic|housekeeper|skilled\s+worker)\b/i,
    // Money / financial begging
    /\b(?:send\s+(?:me\s+)?money|give\s+(?:me\s+)?money|i\s+need\s+money|lend\s+me|help\s+me\s+with\s+(?:some\s+)?money|need\s+cash|transfer\s+(?:to\s+)?me|mobile\s+money|momo\s+me)\b/i,
    // Romantic / inappropriate
    /\b(?:i\s+love\s+you|my\s+love\s+is\s+(?:for\s+)?you|be\s+my\s+(?:girlfriend|boyfriend|lover|wife|husband)|marry\s+me|i\s+(?:like|love)\s+you\s+babe|sweetie|you\s+are\s+(?:so\s+)?beautiful\s+babe|accept\s+me\s+(?:as\s+)?(?:your\s+)?lover)\b/i,
  ];
  const offTopic = OFF_TOPIC_PATTERNS.some(p => p.test(userText));
  if (offTopic) {
    session.metadata = session.metadata || {};
    session.metadata.offTopicCount = (session.metadata.offTopicCount || 0) + 1;
    await updateLeadData(from, {}); // persist counter
    if (session.metadata.offTopicCount >= 3) {
      // Send one polite closure on exactly the 3rd strike, then silently discard further messages
      if (session.metadata.offTopicCount === 3) {
        await addMessage(from, "user", userText);
        const closingMsg = `Thank you for getting in touch! 😊\n\nWe specialize exclusively in real estate at Devtraco Plus and aren't able to assist with jobs, financial requests, or other matters.\n\nIf you ever need help finding a property, we'll be right here. Wishing you all the best! 🙏`;
        await sendTextMessage(from, closingMsg);
        await addMessage(from, "assistant", closingMsg);
      }
      return; // Discard further off-topic messages silently
    }
    // Strikes 1-2: fall through to AI — it handles redirection gracefully
  }

  // --- AI conversation pipeline ---
  const pipelineStart = Date.now();

  // For image messages, download and send to AI Vision for analysis
  let imageData = null;
  let imageLocalUrl = null;
  if (type === "image" && media?.id) {
    try {
      const mediaUrl = await getMediaUrl(media.id);
      imageData = await downloadMediaAsBase64(mediaUrl);
      // Save to public/uploads/ so the dashboard can display it permanently
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });
      const ext = imageData.mimeType.includes("png") ? "png" : "jpg";
      const filename = `${Date.now()}-${from}.${ext}`;
      await writeFile(path.join(uploadsDir, filename), Buffer.from(imageData.base64, "base64"));
      imageLocalUrl = `/static/uploads/${filename}`;
      console.log(`[Media] Downloaded image for vision analysis (${imageData.mimeType}), saved to ${imageLocalUrl}`);
    } catch (err) {
      console.error("[Media] Failed to download image:", err.message);
    }
  }

  await addMessage(from, "user", userText, imageLocalUrl);
  const aiResult = await generateAIResponseFull(from, session, imageData);
  const aiDone = Date.now();

  // --- Fallback scheduling: AI confirmed intent but didn't emit the tag ---
  // Only fires when AI clearly says it is SUBMITTING (not just "can arrange, what time?").
  // Also requires BOTH a date AND a time — never create a booking with unknown time.
  if (!aiResult.scheduleViewing && session.metadata?.scheduling) {
    const confirmsPhrases = /\b(let me arrange that|i.ll arrange that|i will arrange that|i.ll submit your|i will submit your|submitting your viewing|book(?:ed|ing) you(?:\s+in)?\s+for)\b/i;
    if (confirmsPhrases.test(aiResult.text)) {
      const property = await getPropertyById(session.metadata.scheduling);
      // Try user's message first; if incomplete, try the AI's own reply text
      // (e.g. user says "tomorrow isn't a weekend" and AI echoes "tomorrow at 11:00 AM")
      let parsed = extractDateTimeFromText(userText);
      if (!parsed.date || !parsed.time) {
        const fromAI = extractDateTimeFromText(aiResult.text);
        if (!parsed.date && fromAI.date) parsed.date = fromAI.date;
        if (!parsed.time && fromAI.time) parsed.time = fromAI.time;
      }
      if (parsed.date && parsed.time) {
        aiResult.scheduleViewing = {
          propertyId: session.metadata.scheduling,
          propertyName: property?.name || session.metadata.schedulingPropertyName || "Not specified",
          preferredDate: parsed.date,
          preferredTime: parsed.time,
          name: session.leadData?.name || "Not provided",
        };
        console.log(`[Fallback] Schedule recovery: ${JSON.stringify(aiResult.scheduleViewing)}`);
      }
    }
  }

  // --- Post-AI processing (non-blocking where possible) ---

  // Lead capture runs in background — doesn't block the reply
  const leadWork = (async () => {
    if (aiResult.leadData) {
      await captureLead(from, aiResult.leadData);
    } else {
      const fallbackLead = extractLeadFromConversation(userText, aiResult.text, session);
      if (fallbackLead && Object.keys(fallbackLead).length > 0) {
        await captureLead(from, fallbackLead);
        console.log(`[Fallback] Extracted lead data from conversation:`, JSON.stringify(fallbackLead));
      }
    }
    if (aiResult.scheduleViewing) {
      const viewingLead = {};
      if (aiResult.scheduleViewing.name) viewingLead.name = aiResult.scheduleViewing.name;
      if (aiResult.scheduleViewing.propertyName) viewingLead.propertyInterest = aiResult.scheduleViewing.propertyName;
      if (Object.keys(viewingLead).length > 0) {
        await captureLead(from, viewingLead);
      }
    }
  })();

  // Fallback property detection (sync — fast, no DB call)
  if (!aiResult.showProperty) {
    const detected = await detectPropertyInText(aiResult.text);
    if (detected) {
      aiResult.showProperty = detected;
      console.log(`[Fallback] Detected property in AI text: ${detected}`);
    }
  }

  // Strip refusal text
  aiResult.text = cleanImageRefusals(aiResult.text);

  console.log(`[Chat] ${from} → ${userText}`);
  console.log(`[Chat] Bot → ${aiResult.text.slice(0, 150)}...`);

  // Detect if user is explicitly asking for images/photos
  const userExplicitlyAskedForImages = isExplicitImageRequest(userText);

  // Send media + text reply (this is the user-facing latency)
  const skipMedia = !!aiResult.scheduleViewing;
  const isScheduling = !!session.metadata?.scheduling;
  const lastButtons = session.metadata?.lastPropertyButtons;
  const recentlyShown = lastButtons &&
    lastButtons.propertyId === aiResult.showProperty &&
    (Date.now() - lastButtons.time) < 5 * 60 * 1000;
  // Also suppress if a viewing was recently booked (within 2 hours) — prevents button/image re-send
  // immediately after a booking, but allows returning clients to see property details normally.
  const viewingJustBooked = !!(session.metadata?.lastViewingTime && (Date.now() - session.metadata.lastViewingTime) < 2 * 60 * 60 * 1000);
  // Allow re-sending images when user explicitly asks for them
  const suppressPropertyUI = skipMedia || isScheduling || (recentlyShown && !userExplicitlyAskedForImages) || viewingJustBooked;

  if (aiResult.showProperty && !suppressPropertyUI) {
    // Send property card first
    const showProp = await getPropertyById(aiResult.showProperty);
    if (showProp) {
      const card = formatPropertyCard(showProp);
      await sendTextMessage(from, card);
    }
  }

  // Always send the AI response text — it gives the user the acknowledgment ("I'll arrange that...").
  // The subsequent viewing submission / rejection message will follow immediately after.
  await sendTextMessage(from, aiResult.text);

  // Send images AFTER text so they don't push the description down
  if (aiResult.showProperty && !suppressPropertyUI) {
    await sendPropertyImages(from, aiResult.showProperty);
  }
  const replySent = Date.now();
  console.log(`[Perf] Pipeline: AI=${aiDone - pipelineStart}ms | Reply=${replySent - aiDone}ms | Total=${replySent - pipelineStart}ms`);

  // --- Post-reply work (user already has the message) ---

  if (aiResult.showProperty && !suppressPropertyUI) {
    const prop = await getPropertyById(aiResult.showProperty);
    if (prop) {
      session.metadata = session.metadata || {};
      session.metadata.lastPropertyButtons = { propertyId: aiResult.showProperty, time: Date.now() };
      const pipelineButtons = prop.status === "Sold Out"
        ? [
            { id: "view_properties", title: "More Properties" },
            { id: "speak_agent", title: "Speak to Agent" },
          ]
        : [
            { id: `schedule_${prop.id}`, title: "Schedule Visit" },
            { id: "view_properties", title: "More Properties" },
            { id: "speak_agent", title: "Speak to Agent" },
          ];
      await sendButtonMessage(
        from,
        prop.status === "Sold Out"
          ? `This property is currently *sold out*. Would you like to explore other options?`
          : `What would you like to do?`,
        pipelineButtons,
        prop.name
      );
    }
  }

  if (aiResult.scheduleViewing) {
    await handleViewingSchedule(from, aiResult.scheduleViewing);
  }

  // Wait for background lead work to finish
  await leadWork;

  // Auto-escalate hot leads — only after sufficient conversation depth
  // Require at least 10 messages so the client has time to explore properties,
  // ask questions, view images, and potentially schedule a viewing before escalation.
  const updatedSession = await getSession(from);
  const hasEnoughDepth = updatedSession.history.length >= 10;
  if (shouldAutoEscalate(updatedSession) && updatedSession.state !== "ESCALATED" && hasEnoughDepth) {
    setTimeout(async () => {
      await handleEscalation(from, "Auto-escalation: Hot lead with high engagement");
    }, 2000);
    console.log(`[Escalation] Auto-escalating HOT lead: ${from}`);
  }

  // Handle explicit escalation from AI
  if (aiResult.escalate) {
    await handleEscalation(from, aiResult.escalate);
  }
}

/**
 * Full AI response with structured data
 */
async function generateAIResponseFull(from, session, imageData = null) {
  // Determine category from user's product intent
  let category = null;
  const productIntent = session.metadata?.productIntent;
  if (productIntent === "buying_home") {
    category = "residential";
  } else if (productIntent === "land_investment") {
    category = "land_investment";
  } else if (productIntent === "catalogue") {
    category = "all_catalogue";
  }

  const result = await generateResponse(session.history, session.leadData, imageData, category);
  await addMessage(from, "assistant", result.text);
  return result;
}

/**
 * Basic gender title detection for common Ghanaian and international names.
 * Returns 'Mr.' / 'Ms.' or null if uncertain.
 */
function getNameTitle(name) {
  const first = name.split(' ')[0].toLowerCase();
  const male = ['kobby','kwame','kofi','kweku','kojo','kwabena','kwesi','yaw','fiifi','ekow','ebo',
    'daniel','michael','james','john','peter','paul','david','george','richard','robert','william',
    'thomas','charles','joseph','eric','samuel','benjamin','frank','henry','andrew','mark','stephen',
    'edward','christopher','patrick','emmanuel','isaac','prince','felix','justice','bright','richmond',
    'ernest','fred','solomon','alex','victor','muheeb','ahmed','ibrahim','yussif','yakubu','nana kwame',
    'kwabena','ato','nii','nana','kow','kweku','kwame','kevin','kenneth','leonard','lawrence','moses',
    'nathaniel','nicholas','oliver','oscar','phillip','raymond','reginald','ronald','ruben','russell',
    'sebastian','simon','stanley','theodore','timothy','tony','trevor','ulric','warren','xavier'];
  const female = ['ama','akosua','abena','akua','adjoa','adwoa','afia','efua','maame','yaa','esi',
    'freda','sandra','grace','mercy','patience','abigail','sarah','mary','elizabeth','diana','emily',
    'jennifer','linda','margaret','patricia','barbara','jessica','helen','ruth','deborah','esther',
    'clara','naomi','rachel','rebecca','alice','gloria','joy','hope','faith','celestine','vivian',
    'doris','benedicta','gifty','eunice','regina','priscilla','harriet','akosua','nana ama','adjoa',
    'abenaa','adwoa','araba','ewurama','ekua','sheila','sylvia','theresa','victoria','wendy','zara'];
  if (male.includes(first)) return 'Mr.';
  if (female.includes(first)) return 'Ms.';
  return null;
}

/**
 * Send GDPR/data consent request — personalised with name and intent
 */
async function sendConsentRequest(to, name = null, intent = null) {
  const title = name ? getNameTitle(name) : null;
  const addressed = name ? (title ? `${title} ${name}` : name) : null;

  let intro = '';
  if (addressed && intent) {
    intro = `*${addressed}*, that's great to hear! `;
  } else if (addressed) {
    intro = `*${addressed}*, great to connect with you! `;
  }

  await sendTextMessage(
    to,
    `${intro}Before we proceed, a quick note on your privacy:\n\n📋 We may collect your contact information and preferences to provide you with a tailored property experience.\n\n🔒 Your information is secure. We will not sell, distribute, or lease your personal information to third parties unless required by law.\n\nFor our full privacy policy, visit devtracoplus.com or email info@devtracoplus.com.\n\nDo you consent to proceed?`
  );

  await sendButtonMessage(
    to,
    "Please confirm to continue:",
    [
      { id: "consent_accept", title: "✅ Yes, I agree" },
      { id: "consent_decline", title: "❌ No, thanks" },
    ],
    "Data Privacy",
    "We respect your privacy"
  );
}

/**
 * Re-ask for consent when a non-consented user tries to book a viewing
 */
async function sendConsentForViewing(to) {
  await sendTextMessage(
    to,
    `To schedule a property viewing, we'll need to collect some of your details (name, contact, preferences) to coordinate with our team.\n\n🔒 Your information is secure and will only be used for this purpose.\n\nWould you like to provide your consent so we can arrange the viewing?`
  );

  await sendButtonMessage(
    to,
    "Your consent is needed to proceed:",
    [
      { id: "consent_accept", title: "✅ Yes, I agree" },
      { id: "speak_agent", title: "📞 Speak to Agent" },
    ],
    "Consent Required"
  );
}

/**
 * Fallback lead extraction: scan user message for budget, location, name patterns.
 * Only extracts data that isn't already captured in the session.
 */
function extractLeadFromConversation(userText, aiText, session) {
  const lead = {};
  const existing = session.leadData || {};
  const text = userText.toLowerCase();

  // Budget: match $XXX,XXX or XXX,XXX$ or XXXK or XXX dollars etc.
  if (!existing.budget) {
    const budgetMatch = userText.match(/\$\s?[\d,]+(?:\.\d+)?(?:k|m)?|\b[\d,]+(?:\.\d+)?\s*(?:dollars?|usd|\$)/i);
    if (budgetMatch) {
      lead.budget = budgetMatch[0].trim();
    }
  }

  // Preferred location: match known Ghana locations
  if (!existing.preferredLocation) {
    const locations = [
      "east legon", "cantonments", "roman ridge", "airport residential",
      "ridge", "labone", "osu", "dzorwulu", "north ridge", "adjiringanor",
      "tse addo", "la", "accra", "tema", "kumasi", "takoradi", "spintex",
      "trasacco", "au village", "community 25", "sakumono", "ashongman",
    ];
    for (const loc of locations) {
      if (text.includes(loc)) {
        lead.preferredLocation = loc.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        break;
      }
    }
  }

  // Property interest: check if AI response mentions a specific property by name
  if (!existing.propertyInterest) {
    // Look for property names in the AI text context (e.g., "You've chosen Acasia Apartments")
    const propertyPatterns = [
      /(?:chosen|selected|interested in|recommend)\s+\*?([A-Z][A-Za-z\s']+?)(?:\*|!|\.|,|\n)/,
    ];
    for (const pat of propertyPatterns) {
      const match = aiText.match(pat);
      if (match && match[1].trim().length > 3) {
        lead.propertyInterest = match[1].trim();
        break;
      }
    }
  }

  // Email
  if (!existing.email) {
    const emailMatch = userText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (emailMatch) {
      lead.email = emailMatch[0];
    }
  }

  return lead;
}

/**
 * Fallback: detect a property name mentioned in AI text when SHOW_PROPERTY tag was omitted.
 * Returns the propertyId if a single property is clearly being discussed, otherwise null.
 */
async function detectPropertyInText(text) {
  try {
    const properties = await getAllProperties();
    const lower = text.toLowerCase();
    const matches = properties.filter(p => {
      const name = (p.name || "").toLowerCase();
      return name && lower.includes(name);
    });
    // Only auto-send if exactly one property is clearly referenced
    if (matches.length === 1) {
      return matches[0].propertyId || matches[0].id;
    }
  } catch (err) {
    console.warn("[Fallback] detectPropertyInText error:", err.message);
  }
  return null;
}

/**
 * Extract a date and/or time from a free-form user message.
 * Handles patterns like "Tomorrow 11", "Saturday 2pm", "March 15 at 10am", "11am tomorrow".
 * Returns { date: "YYYY-MM-DD"|null, time: "HH:MM"|null }.
 */
function extractDateTimeFromText(userText) {
  const rawText = userText.trim();
  const words = rawText.split(/\s+/);
  let date = null;
  let time = null;

  // 1. Try the full string as a date or time
  date = resolveDate(rawText);
  time = resolveTime(rawText);
  if (date && time) return { date, time };

  // 2. Try splitting at each word boundary: [date part] + [time part] and vice-versa
  for (let i = 1; i < words.length; i++) {
    const part1 = words.slice(0, i).join(" ");
    const part2 = words.slice(i).join(" ").replace(/^at\s+/i, "");

    const d1 = resolveDate(part1);
    const t2 = resolveTime(part2);
    if (d1 && t2) return { date: d1, time: t2 };

    const t1 = resolveTime(part1);
    const d2 = resolveDate(part2);
    if (d2 && t1) return { date: d2, time: t1 };

    // Partial matches — keep scanning but record first hits
    if (!date && d1) date = d1;
    if (!time && t2) time = t2;
    if (!date && d2) date = d2;
    if (!time && t1) time = t1;
  }

  // 3. Regex fallback for inline time patterns like "11am", "2:30pm" buried in longer text
  if (!time) {
    const inlineTime = rawText.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (inlineTime) time = resolveTime(inlineTime[1]);
  }

  return { date, time };
}

/**
 * Detect if user message is explicitly requesting images/photos of a property.
 */
function isExplicitImageRequest(text) {
  const lower = text.toLowerCase().trim();
  return /\b(show|send|see|view|get)\b.*\b(image|images|photo|photos|picture|pictures|pic|pics)\b/i.test(lower)
    || /\b(image|images|photo|photos|picture|pictures|pic|pics)\b.*\b(please|pls)?\b/i.test(lower)
    || /^(images?|photos?|pictures?|pics?)$/i.test(lower)
    || /\b(?:any|all)\b.*\b(images?|photos?|pictures?|pics?)\b/i.test(lower)
    || /\b(images?|photos?|pictures?|pics?)\b\s*\b(?:any|all|please|pls)\b/i.test(lower)
    || /\bi\s+(mean|want|need)\s+(an?\s+)?(image|photo|picture|pic)/i.test(lower);
}

/**
 * Strip sentences where the AI says it cannot show/display images.
 * These are incorrect — the system CAN send images via the SHOW_PROPERTY mechanism.
 */
function cleanImageRefusals(text) {
  // Remove sentences where AI says it cannot show/display/share images or videos.
  // Use can.?t to handle smart quotes (Unicode U+2019 right single quote vs ASCII)
  // Also remove "visit the website/link to see/watch" redirect sentences.
  //
  // Strategy: first strip entire lines that contain refusal + redirect combos,
  // then strip remaining individual refusal sentences.
  let cleaned = text;

  // Strip full lines/paragraphs that contain a refusal about images/videos
  // (handles multi-clause sentences with URLs containing dots)
  cleaned = cleaned.replace(
    /^.*?(?:can.?t|cannot|unable to|don.?t have the ability to)\s+(?:show|display|send|share)\s+(?:images|videos?|photos?|pictures?|visuals?).*$/gim,
    ""
  );

  // Strip "visit/follow this link ... to watch/see" redirect sentences
  cleaned = cleaned.replace(
    /^.*?(?:visit|follow|check out)\s+(?:this\s+)?link.*?(?:watch|see|view).*$/gim,
    ""
  );

  // Strip "you can find videos/images on our website" redirect sentences
  cleaned = cleaned.replace(
    /^.*?(?:you can find|check out)\s+(?:videos?|images?|photos?|visuals?|more visual content).*?(?:website|link).*$/gim,
    ""
  );

  // Clean up leftover blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || text; // fallback to original if everything got stripped
}

/**
 * Send ALL property images and videos for a given propertyId.
 */
async function sendPropertyImages(to, propertyId) {
  const property = await getPropertyById(propertyId);
  if (!property) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Build all media tasks and send in parallel with a small stagger
  const tasks = [];

  if (property.images && property.images.length > 0) {
    property.images.forEach((img, i) => {
      tasks.push(async () => {
        await sleep(i * 300); // small stagger to preserve order
        let imageUrl = img.startsWith("/") ? `${BASE_URL}${img}` : img;
        const caption = i === 0
          ? `${property.name} — ${property.location} (${i + 1}/${property.images.length})`
          : `${property.name} (${i + 1}/${property.images.length})`;
        console.log(`[Property] Sending image ${i + 1}/${property.images.length} for ${propertyId}`);
        await sendImageMessage(to, imageUrl, caption);
      });
    });
  } else {
    console.log(`[Property] No images available for ${propertyId}`);
  }

  if (property.videos && property.videos.length > 0) {
    const imgCount = property.images ? property.images.length : 0;
    property.videos.forEach((vid, i) => {
      tasks.push(async () => {
        await sleep((imgCount + i) * 300);
        let videoUrl = vid.startsWith("/") ? `${BASE_URL}${vid}` : vid;
        const caption = `${property.name} — Video ${i + 1}/${property.videos.length}`;
        console.log(`[Property] Sending video ${i + 1}/${property.videos.length} for ${propertyId}`);
        await sendVideoMessage(to, videoUrl, caption);
      });
    });
  }

  // Fire all in parallel — stagger keeps them roughly ordered
  await Promise.all(tasks.map((fn) => fn().catch((err) => {
    console.warn(`[Property] Media send failed for ${propertyId}:`, err.message);
  })));
}

/**
 * Send detailed property view — card text → images → action buttons.
 * Used by non-AI flows (e.g. /properties command). For the interactive
 * list selection, the property_ handler orchestrates the full flow
 * (card → images → AI description → buttons).
 */
async function sendPropertyDetail(to, propertyId) {
  const property = await getPropertyById(propertyId);
  if (!property) return;

  // 1. Send property card text first
  const card = formatPropertyCard(property);
  await sendTextMessage(to, card);

  // 2. Send ALL images
  await sendPropertyImages(to, propertyId);

  // 3. Send action buttons
  const detailButtons = property.status === "Sold Out"
    ? [
        { id: "view_properties", title: "More Properties" },
        { id: "speak_agent", title: "Speak to Agent" },
      ]
    : [
        { id: `schedule_${property.id}`, title: "Schedule Visit" },
        { id: "view_properties", title: "More Properties" },
        { id: "speak_agent", title: "Speak to Agent" },
      ];
  await sendButtonMessage(
    to,
    property.status === "Sold Out"
      ? `This property is currently *sold out*. Would you like to explore other options?`
      : `What would you like to do?`,
    detailButtons,
    property.name
  );
}

/**
 * Handle viewing schedule from AI response
 */
async function handleViewingSchedule(to, scheduleData) {
  const session = await getSession(to);

  // Block viewing without consent
  if (!session.consentGiven) {
    session.metadata = session.metadata || {};
    if (scheduleData.propertyId && scheduleData.propertyId !== "unknown") {
      session.metadata.pendingViewingProperty = scheduleData.propertyId;
    } else {
      session.metadata.pendingViewingProperty = "general";
    }
    await sendConsentForViewing(to);
    return;
  }

  // Block viewing for sold-out properties
  if (scheduleData.propertyId && scheduleData.propertyId !== "unknown") {
    const property = await getPropertyById(scheduleData.propertyId);
    if (property && property.status === "Sold Out") {
      const msg = `We appreciate your interest in *${property.name}*! Unfortunately, this property is currently *sold out* — all units have been taken.\n\nI'd be happy to suggest similar available properties. Would you like me to recommend alternatives?`;
      await sendTextMessage(to, msg);
      await addMessage(to, "assistant", msg);
      return;
    }
  }

  // Resolve the date/time now so we can show the client the interpreted result
  const resolvedDate = resolveDate(scheduleData.preferredDate) || scheduleData.preferredDate || "To be confirmed";
  const resolvedTime = resolveTime(scheduleData.preferredTime) || scheduleData.preferredTime || "To be confirmed";

  // Pre-validate business hours
  if (resolvedDate && resolvedDate !== "To be confirmed") {
    const bizCheck = validateBusinessHours(resolvedDate, resolvedTime !== "To be confirmed" ? resolvedTime : null);
    if (!bizCheck.valid) {
      await sendTextMessage(to, `⚠️ ${bizCheck.reason}`);
      await addMessage(to, "assistant", `⚠️ ${bizCheck.reason}`);
      return;
    }
  }

  // Pre-validate 24-hour advance rule
  if (resolvedDate && resolvedDate !== "To be confirmed") {
    const requestedDate = new Date(resolvedDate + (resolvedTime !== "To be confirmed" ? `T${resolvedTime}:00` : "T23:59:59"));
    const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (!isNaN(requestedDate.getTime()) && requestedDate < minDate) {
      const nextBiz = getNextBusinessDay();
      const slots = await getAvailableSlots(nextBiz, scheduleData.propertyId);
      const slotText = slots.length > 0
        ? `\n\nThe next available date is *${formatDateNice(nextBiz)}*. Available slots:\n${slots.map(s => `• ${formatTimeNice(s)}`).join("\n")}`
        : "";
      const reason = `All property viewings must be scheduled at least 24 hours in advance. Please choose a later date.${slotText}`;
      await sendTextMessage(to, `⚠️ ${reason}`);
      session.metadata = session.metadata || {};
      if (nextBiz) {
        session.metadata.suggestedDate = nextBiz;
        session.metadata.suggestedProperty = {
          id: scheduleData.propertyId || "unknown",
          name: scheduleData.propertyName || "Not specified",
        };
        // Explicitly persist metadata so time-only replies can be intercepted
        await updateLeadData(to, {});
      }
      await addMessage(to, "assistant", `⚠️ ${reason}`);
      return;
    }
  }

  // Directly create the viewing — no intermediate confirmation step
  await confirmAndCreateViewing(to, {
    ...scheduleData,
    resolvedDate,
    resolvedTime,
  });
}

/**
 * Actually create the viewing after client confirms.
 */
async function confirmAndCreateViewing(to, pendingData) {
  const session = await getSession(to);

  const viewing = await createViewing({
    userId: to,
    propertyId: pendingData.propertyId || "unknown",
    propertyName: pendingData.propertyName || "Not specified",
    preferredDate: pendingData.resolvedDate || pendingData.preferredDate || "To be confirmed",
    preferredTime: pendingData.resolvedTime || pendingData.preferredTime || "To be confirmed",
    name: pendingData.name || session.leadData?.name || "Not provided",
    phone: to,
    email: session.leadData?.email || "Not provided",
    notes: pendingData.notes || "",
  });

  // Handle rejections (slot taken, etc.)
  if (viewing.rejected) {
    await sendTextMessage(to, `⚠️ ${viewing.reason}`);
    session.metadata = session.metadata || {};
    if (viewing.suggestedDate) {
      session.metadata.suggestedDate = viewing.suggestedDate;
      session.metadata.suggestedProperty = {
        id: pendingData.propertyId || "unknown",
        name: pendingData.propertyName || "Not specified",
      };
      // Persist so time-only replies are correctly intercepted
      await updateLeadData(to, {});
    }
    await addMessage(to, "assistant", `⚠️ ${viewing.reason}`);
    return;
  }

  // Success — clear scheduling flags
  session.metadata = session.metadata || {};
  session.metadata.scheduling = null;
  session.metadata.schedulingPropertyName = null;
  session.metadata.suggestedDate = null;
  session.metadata.suggestedProperty = null;
  session.metadata.lastViewingId = viewing.viewingId;
  session.metadata.lastViewingTime = Date.now();

  const clientName = viewing.name !== "Not provided" ? viewing.name : "Valued Client";
  const dateDisplay = formatDateNice(viewing.preferredDate);
  const timeDisplay = formatTimeNice(viewing.preferredTime);

  // Send submission confirmation
  const submissionMsg = [
    `I have submitted your viewing request for *${viewing.propertyName}* on *${dateDisplay} at ${timeDisplay}*. ✅`,
    ``,
    `📋 Reference: *${viewing.viewingId}*`,
    ``,
    `You will receive a confirmation call or message shortly, along with the contact details of your assigned Sales Executive.`,
    ``,
    `If you have any further questions or need assistance, please feel free to reach out. Thank you for choosing Devtraco Plus! 🙏`,
  ].join("\n");

  await sendTextMessage(to, submissionMsg);
  await addMessage(to, "assistant", submissionMsg);

  // Auto-confirm viewing after 3 seconds and notify customer
  setTimeout(async () => {
    try {
      const confirmed = await updateViewingStatus(viewing.viewingId, "CONFIRMED");
      if (confirmed) {
        await sendTextMessage(to, formatViewingConfirmed(confirmed));
        console.log(`[Viewing] Auto-confirmed ${viewing.viewingId} for ${to}`);

        // Notify agent immediately of confirmed viewing
        try {
          const agentNumber = config.company.escalationWhatsApp.replace("+", "");
          const dateDisp = formatDateNice(confirmed.preferredDate);
          const timeDisp = formatTimeNice(confirmed.preferredTime);
          await sendTextMessage(
            agentNumber,
            `📅 *New Viewing Confirmed*\n\n` +
            `👤 *Client:* ${confirmed.name || "Not provided"}\n` +
            `📱 *Phone:* +${to}\n` +
            `📧 *Email:* ${confirmed.email || "Not provided"}\n` +
            `🏠 *Property:* ${confirmed.propertyName || "Not specified"}\n` +
            `📆 *Date:* ${dateDisp}\n` +
            `⏰ *Time:* ${timeDisp}\n` +
            `📋 *Reference:* ${confirmed.viewingId}\n\n` +
            `Reply to client: wa.me/${to}`
          );
          console.log(`[Viewing] Agent notified of confirmed viewing ${confirmed.viewingId}`);
        } catch (agentErr) {
          console.error(`[Viewing] Failed to notify agent of confirmed viewing:`, agentErr.message);
        }

        // NOTE: Auto-email disabled — agent handles confirmation manually
        // Send email if we have one\n        // if (freshSession.leadData?.email && freshSession.leadData.email !== "Not provided") {
        //   await sendViewingConfirmationEmail(freshSession.leadData.email, confirmed);
        // }

        // Use a fresh session to get latest lead data (e.g. email already provided)
        const freshSession = await getSession(to);

        // Ask for email after confirmation if not yet collected
        if (!freshSession.leadData?.email || freshSession.leadData.email === "Not provided") {
          setTimeout(async () => {
            await updateState(to, "AWAITING_EMAIL");
            await sendTextMessage(to, `📧 To send you a confirmation email with all the details, could you please share your email address?\n\nType *skip* if you'd prefer not to.`);
          }, 2000);
        }
      }
    } catch (err) {
      console.error(`[Viewing] Auto-confirm failed for ${viewing.viewingId}:`, err.message);
    }
  }, 3000);
}

/**
 * Send user's viewing history
 */
async function sendUserViewings(to) {
  const viewings = await getUserViewings(to);
  if (viewings.length === 0) {
    await sendTextMessage(to, "📅 You don't have any scheduled viewings yet. Would you like to schedule one?");
    return;
  }

  const lines = viewings.map((v, i) =>
    `${i + 1}. *${v.propertyName}*\n   📋 Ref: ${v.id}\n   📆 ${v.preferredDate} at ${v.preferredTime}\n   📌 Status: ${v.status}`
  );

  await sendTextMessage(to, `📅 *Your Scheduled Viewings*\n\n${lines.join("\n\n")}`);
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
 * Send the property listing (WhatsApp allows max 10 rows per list)
 */
async function sendPropertyList(to, category = null) {
  // Get properties filtered by category if specified
  const properties = category ? await getPropertiesByCategory(category) : await getAllProperties();

  // Split into sections of max 10 total rows
  const apartments = properties.filter(p => p.type === "Apartments" || p.type === "Hotel Apartments");
  const townhouses = properties.filter(p => p.type === "Townhouses" || p.type === "Townhomes");
  const land = properties.filter(p => p.type === "Land");

  const sections = [];

  if (apartments.length > 0) {
    sections.push({
      title: "Apartments",
      rows: apartments.slice(0, 7).map((p) => ({
        id: `property_${p.id}`,
        title: p.name.slice(0, 24),
        description: `${p.location} — From $${p.priceFrom.toLocaleString()}${p.status === "Sold Out" ? " (Sold Out)" : ""}`.slice(0, 72),
      })),
    });
  }

  if (townhouses.length > 0) {
    sections.push({
      title: "Townhouses & Townhomes",
      rows: townhouses.slice(0, 3).map((p) => ({
        id: `property_${p.id}`,
        title: p.name.slice(0, 24),
        description: `${p.location} — From $${p.priceFrom.toLocaleString()}${p.status === "Sold Out" ? " (Sold Out)" : ""}`.slice(0, 72),
      })),
    });
  }

  if (land.length > 0) {
    sections.push({
      title: "Land Investments",
      rows: land.slice(0, 3).map((p) => ({
        id: `property_${p.id}`,
        title: p.name.slice(0, 24),
        description: `${p.location} — From $${p.priceFrom > 0 ? p.priceFrom.toLocaleString() : "Contact for price"}${p.status === "Sold Out" ? " (Sold Out)" : ""}`.slice(0, 72),
      })),
    });
  }

  // If no sections found, send a text message instead
  if (sections.length === 0) {
    await sendTextMessage(to, `📋 No properties available in this category yet.\n\nWould you like to:\n• Browse all properties\n• Speak to a team member for more options`);
    await sendButtonMessage(
      to,
      "What would you like to do?",
      [
        { id: "view_properties", title: "📋 All Properties" },
        { id: "speak_agent", title: "📞 Agent" },
        { id: "back_to_product_intent", title: "< Back" },
      ],
      "Options"
    );
    return;
  }

  await sendListMessage(
    to,
    "Here are our available properties. Tap below to explore! 🏡",
    "Browse Properties",
    sections,
    "Devtraco Plus Properties"
  );
}

/**
 * Handle escalation to human agent
 */
async function handleEscalation(to, reason) {
  await updateState(to, "ESCALATED");

  // Store escalation details in client's session metadata
  const session = await getSession(to);
  session.metadata = session.metadata || {};
  session.metadata.escalation = {
    status: "awaiting_agent",
    reason,
    timestamp: Date.now(),
  };
  // Persist escalation metadata to DB
  await updateLeadData(to, {});

  await sendTextMessage(
    to,
    `👤 *Connecting you with a team member*\n\nI'm transferring you to one of our property consultants who'll be able to assist you further.\n\n📞 You can also reach us directly:\n• Call: ${config.company.phone}\n• WhatsApp: ${config.company.escalationWhatsApp}\n• Email: ${config.company.email}\n\n🕒 Business Hours: ${config.company.businessHours}\n\nA team member will respond shortly. Thank you for your patience! 🙏`
  );

  // Notify agent — always send plain text first (guaranteed delivery regardless of 24h window)
  try {
    const lead = session.leadData || {};
    const name = lead.name || "Not provided";
    const phone = lead.phone || to;
    const email = lead.email || "Not provided";
    const budget = lead.budget || "Not provided";
    const interest = lead.propertyInterest || "Not provided";
    const location = lead.preferredLocation || "Not provided";

    const agentNumber = config.company.escalationWhatsApp.replace("+", "");

    const clientInfo =
      `🔔 *New Client Escalation*\n\n` +
      `👤 *Name:* ${name}\n` +
      `📱 *Phone:* +${phone}\n` +
      `📧 *Email:* ${email}\n` +
      `💰 *Budget:* ${budget}\n` +
      `🏠 *Property Interest:* ${interest}\n` +
      `📍 *Preferred Location:* ${location}\n\n` +
      `📝 *Reason:* ${reason}\n\n` +
      `Reply to the client directly on WhatsApp: wa.me/${phone}`;

    // Step 1: Plain text message — always delivered, no 24h window restriction
    await sendTextMessage(agentNumber, clientInfo);

    // Step 2: Try adding interactive response buttons (only works within 24h window)
    try {
      await sendButtonMessage(
        agentNumber,
        `Tap to update client status:`,
        [
          { id: `escalation_respond_${to}`, title: "Responded" },
          { id: `escalation_later_${to}`, title: "Later" },
        ],
        "Quick Actions"
      );
    } catch (btnErr) {
      console.log(`[Escalation] Buttons unavailable (outside 24h window) — plain text delivered`);
    }
    console.log(`[Escalation] Notified agent ${agentNumber} about client ${to}`);
  } catch (err) {
    console.error(`[Escalation] Failed to notify agent:`, err.response?.data || err.message);
  }

  console.log(`[Escalation] ${to} — Reason: ${reason}`);
}

/**
 * Handle agent's response to an escalation (button press)
 */
async function handleAgentResponse(clientNumber, action, agentNumber) {
  const session = await getSession(clientNumber);
  session.metadata = session.metadata || {};

  if (action === "responded") {
    session.metadata.escalation = {
      ...session.metadata.escalation,
      status: "responded",
      respondedAt: Date.now(),
    };
    await updateLeadData(clientNumber, {}); // persist
    await updateState(clientNumber, "ACTIVE");
    await sendTextMessage(agentNumber, `✅ Noted! Client +${clientNumber} marked as attended to.`);
    console.log(`[Escalation] Agent responded to client ${clientNumber}`);
  } else {
    // "later" — keep awaiting status
    session.metadata.escalation = {
      ...session.metadata.escalation,
      status: "awaiting_agent",
    };
    await updateLeadData(clientNumber, {}); // persist
    await sendTextMessage(agentNumber, `⏰ Noted! Client +${clientNumber} is still awaiting your response.`);
    console.log(`[Escalation] Agent deferred client ${clientNumber}`);
  }
}

/**
 * Normalize the incoming WhatsApp payload
 */
function normalizePayload(messagePayload) {
  const type = messagePayload.type;
  const mediaTypes = ["image", "video", "document", "audio", "sticker"];
  const raw = mediaTypes.includes(type) ? messagePayload[type] : null;
  return {
    from: messagePayload.from,
    messageId: messagePayload.id,
    type,
    text: messagePayload.text?.body || "",
    interactive: messagePayload.interactive || null,
    media: raw ? { id: raw.id, caption: raw.caption || "", mimeType: raw.mime_type || "" } : null,
  };
}

/**
 * Extract readable user text from different message types
 */
function extractUserText(type, text, interactive, media) {
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
      return media?.caption ? `[Image: ${media.caption}]` : "[User sent an image]";
    case "video":
      return media?.caption ? `[Video: ${media.caption}]` : "[User sent a video]";
    case "document":
      return media?.caption ? `[Document: ${media.caption}]` : "[User sent a document]";
    case "location":
      return "I shared my location";
    default:
      return null;
  }
}
