import OpenAI from "openai";
import config from "../config/index.js";
import { getAllProperties } from "../data/properties.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// Cache the system prompt to avoid DB queries on every message
let cachedPrompt = null;
let promptCacheTime = 0;
const PROMPT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build the system prompt dynamically, with caching.
 */
async function buildSystemPrompt() {
  const now = Date.now();
  if (cachedPrompt && (now - promptCacheTime) < PROMPT_CACHE_TTL) {
    return cachedPrompt;
  }

  const properties = await getAllProperties();
  const propertyIds = properties.map((p) => p.propertyId || p.id).join(", ");

  // Build compact property context (fewer tokens = faster response)
  const propertyContext = properties.map((p) => {
    let beds;
    if (!p.bedrooms || p.bedrooms.length === 0) beds = "Investment";
    else if (p.bedrooms.includes(0)) {
      const others = p.bedrooms.filter((b) => b > 0);
      beds = `Studio${others.length ? `/${others.join(",")}BR` : ""}`;
    } else beds = `${p.bedrooms.join(",")}BR`;
    return `${p.propertyId || p.id}: ${p.name} | ${p.location} | ${p.type} (${beds}) | $${p.priceFrom.toLocaleString()}+ | ${p.status}`;
  }).join("\n");

  const prompt = `You are the AI assistant for ${config.company.name}, a premier real estate developer in Ghana. Be friendly, professional, concise. Handle English and basic Twi/Pidgin.

COMPANY: ${config.company.name} | ${config.company.website} | ${config.company.cellPhone} | ${config.company.email}
Office: ${config.company.address}

PROPERTIES (ID: Name | Location | Type | Price | Status):
${propertyContext}

RULES:
1. Greet warmly on first contact. Ask how you can help.
2. Listen for: location, budget, type, timeline. Recommend matching properties.
3. Capture lead info naturally (name, email, budget). Don't ask all at once.
4. Offer viewings when there's interest.
5. Escalate to human if requested or for legal/contract/payment issues.
6. Stay on topic. Never invent properties or prices.
7. Use WhatsApp formatting: *bold*, bullets, emojis sparingly.
8. You CAN show images/videos — use [SHOW_PROPERTY] tag. NEVER say you can't show media.

TAGS (append at END of response, invisible to user):

LEAD — when customer reveals name/email/budget/location/timeline/property interest:
[LEAD_DATA]{"name":"...","budget":"...","propertyInterest":"...","preferredLocation":"...","timeline":"...","email":"..."}[/LEAD_DATA]
Only include NEWLY learned fields.

MEDIA — when you mention/recommend a specific property:
[SHOW_PROPERTY]property-id[/SHOW_PROPERTY]
One ID per message. IDs: ${propertyIds}

VIEWING — when you have property + date (+ optional time, name):
[SCHEDULE_VIEWING]{"propertyId":"...","propertyName":"...","preferredDate":"...","preferredTime":"...","name":"..."}[/SCHEDULE_VIEWING]

ESCALATION: [ESCALATE]reason[/ESCALATE]

FORMAT: Under 200 words. Short paragraphs. One topic per message.`;

  return prompt;

  cachedPrompt = prompt;
  promptCacheTime = now;
  return cachedPrompt;
}

/**
 * Invalidate the cached system prompt (call after property CRUD).
 */
export function invalidatePromptCache() {
  cachedPrompt = null;
  promptCacheTime = 0;
}

/**
 * Generate a response from GPT-4o mini
 */
export async function generateResponse(conversationHistory) {
  try {
    const t0 = Date.now();
    const systemPrompt = await buildSystemPrompt();
    const t1 = Date.now();

    // Only send last N messages to keep input tokens low
    const recentHistory = conversationHistory.slice(-config.session.maxHistory);

    const messages = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
    });
    const t2 = Date.now();
    console.log(`[Perf] Prompt: ${t1 - t0}ms | OpenAI: ${t2 - t1}ms | Total AI: ${t2 - t0}ms`);

    const raw = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process that. Please try again.";
    return parseAIResponse(raw);
  } catch (err) {
    console.error("OpenAI error:", err.message);

    if (err.status === 429) {
      return {
        text: "I'm experiencing high demand right now. Please try again in a moment! 🙏",
        leadData: null,
        escalate: null,
      };
    }

    return {
      text: "I'm having a brief technical issue. Please try again shortly, or contact us directly at " +
        `${config.company.phone} or ${config.company.email}. 📞`,
      leadData: null,
      escalate: null,
    };
  }
}

/**
 * Parse structured data from the AI response
 */
function parseAIResponse(raw) {
  let text = raw;
  let leadData = null;
  let escalate = null;
  let scheduleViewing = null;

  // Extract lead data
  const leadMatch = raw.match(/\[LEAD_DATA\](.*?)\[\/LEAD_DATA\]/s);
  if (leadMatch) {
    try {
      leadData = JSON.parse(leadMatch[1]);
      text = text.replace(leadMatch[0], "").trim();
    } catch {
      console.warn("Failed to parse lead data from AI response");
    }
  }

  // Extract escalation
  const escMatch = raw.match(/\[ESCALATE\](.*?)\[\/ESCALATE\]/s);
  if (escMatch) {
    escalate = escMatch[1].trim();
    text = text.replace(escMatch[0], "").trim();
  }

  // Extract viewing schedule
  const viewMatch = raw.match(/\[SCHEDULE_VIEWING\](.*?)\[\/SCHEDULE_VIEWING\]/s);
  if (viewMatch) {
    try {
      scheduleViewing = JSON.parse(viewMatch[1]);
      text = text.replace(viewMatch[0], "").trim();
    } catch {
      console.warn("Failed to parse viewing schedule from AI response");
    }
  }

  // Extract show property (send image)
  let showProperty = null;
  const showMatch = raw.match(/\[SHOW_PROPERTY\](.*?)\[\/SHOW_PROPERTY\]/s);
  if (showMatch) {
    showProperty = showMatch[1].trim();
    text = text.replace(showMatch[0], "").trim();
  }

  return { text, leadData, escalate, scheduleViewing, showProperty };
}
