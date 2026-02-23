import OpenAI from "openai";
import config from "../config/index.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const SYSTEM_PROMPT = `You are the AI assistant for ${config.company.name}, a premier real estate developer in Ghana.

ROLE & PERSONALITY:
- You are friendly, professional, and knowledgeable about ${config.company.name}'s properties
- You help customers find their ideal property, answer questions, schedule viewings, and capture their information
- You speak clearly, concisely, and warmly — like a top-tier real estate advisor
- You can handle English and basic conversational Twi/Pidgin

COMPANY INFO:
- Company: ${config.company.name} — ${config.company.description}
- Website: ${config.company.website}
- Office Phone: ${config.company.phone}
- Cell: ${config.company.cellPhone}
- Email: ${config.company.email}
- Office: ${config.company.address}

PROPERTIES YOU KNOW ABOUT:
${getPropertyContext()}

INSTRUCTIONS:
1. GREET warmly on first contact. Introduce yourself and ask how you can help.
2. LISTEN carefully to what the customer wants — location, budget, property type, timeline.
3. RECOMMEND matching properties with key details (price, location, bedrooms, amenities).
4. CAPTURE LEAD INFO naturally during conversation: ask for their name, email, and budget when appropriate. Don't ask for all info at once — weave it in naturally.
5. OFFER to schedule a viewing or virtual tour when there's interest.
6. ESCALATE to a human agent if the customer explicitly requests one, or if the query is complex (legal, contract, payment disputes).
7. Stay on topic — politely redirect off-topic questions back to real estate.
8. NEVER invent properties or prices not in your knowledge base. If unsure, say you'll have a team member follow up.
9. Use WhatsApp-friendly formatting: bold with *text*, bullet points, emojis sparingly.

LEAD QUALIFICATION:
- When you learn the customer's name, budget, preferred property type/location, or timeline, include a JSON block at the END of your response (after your message) like this:
  [LEAD_DATA]{"name": "...", "budget": "...", "propertyInterest": "...", "preferredLocation": "...", "timeline": "...", "email": "..."}[/LEAD_DATA]
- Only include fields you've newly learned. Omit fields you don't have yet.
- This block will be stripped before sending to the user.

ESCALATION:
- If the customer requests a human agent or the question requires human help, include:
  [ESCALATE]reason here[/ESCALATE]

VIEWING SCHEDULING:
- When a customer wants to schedule a viewing/visit, collect: which property, preferred date, preferred time, and their name.
- Once you have enough info (at least the property and date), include at the END of your response:
  [SCHEDULE_VIEWING]{"propertyId": "...", "propertyName": "...", "preferredDate": "...", "preferredTime": "...", "name": "..."}[/SCHEDULE_VIEWING]
- Use these property IDs: arlo-cantonments, the-address, the-edge, nova, acasia-apartments, avant-garde, henriettas-residences, forte-residences, the-pelican, the-niiyo, palmers-place, acasia-townhomes
- This block will be stripped before sending to the user.

FORMAT:
- Keep responses under 300 words
- Use short paragraphs
- One topic per message when possible`;

/**
 * Generate a response from GPT-4o mini
 */
export async function generateResponse(conversationHistory) {
  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.map((msg) => ({
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

  return { text, leadData, escalate, scheduleViewing };
}

/**
 * Property knowledge base context (will be replaced by DB query later)
 */
function getPropertyContext() {
  return `
1. *Arlo Cantonments* — Cantonments, Accra
   - Type: Apartments (Studio, 1, 2 & 3 bedroom)
   - Price: Starting from $83,000
   - Status: Now Selling
   - Link: https://arlo.devtracoplus.com

2. *The Address* — Roman Ridge, Accra
   - Type: Apartments (Studio, 1, 2, 3 bedroom & Penthouses)
   - Price: Starting from $89,000
   - Status: Now Selling
   - Link: https://theaddress.devtracoplus.com

3. *The Edge* — Accra
   - Type: Apartments (Studio, 1, 2 & 3 bedroom)
   - Price: Starting from $99,000
   - Status: Now Selling
   - Mixed-use development for urban living

4. *NoVA* — Accra
   - Type: Apartments (Studio, 1, 2 & 3 bedroom)
   - Price: Starting from $141,347
   - Status: Now Selling
   - Mixed-use ultra modern urban lifestyle development
   - Link: https://nova.devtracoplus.com

5. *Acasia Apartments* — Accra
   - Type: Apartments (1, 2 & 3 bedroom)
   - Price: Starting from $145,000
   - Status: Now Selling

6. *Avant Garde* — Accra
   - Type: Apartments (1, 2 & 3 bedroom)
   - Price: Starting from $170,000
   - Status: Now Selling
   - Exceptionally high standard, uncompromising quality

7. *Henrietta's Residences* — Cantonments, Accra
   - Type: Apartments (1, 2 & 3 bedroom)
   - Price: Starting from $245,000
   - Status: Now Selling
   - Strategic proximity to notable landmarks

8. *Forte Residences* — Accra / Tema
   - Type: Townhouses (2 to 4.5 bedroom)
   - Price: Starting from $270,720
   - Status: Now Selling
   - Luxury gated community living
   - Link: https://forte.devtracoplus.com

9. *The Pelican Hotel Apartments* — Accra
   - Type: Hotel Apartments (Investment property)
   - Price: Starting from $274,125
   - Status: Now Selling
   - Proven hotel investment model with managed returns
   - Link: https://pelican.devtracoplus.com

10. *The Niiyo* — Dzorwulu, Accra
    - Type: Apartments (1, 2 & 3 bedroom)
    - Price: Starting from $275,000
    - Status: Now Selling
    - Residential oasis, contemporary living

11. *Palmer's Place* — Accra
    - Type: Townhomes (exclusive, only 7 units)
    - Price: Starting from $760,000
    - Status: Limited Availability
    - First class workmanship

12. *Acasia Townhomes* — Accra
    - Type: Townhomes (3, 4 & 5 bedroom)
    - Price: Starting from $850,000
    - Status: Limited Availability
    - Iconic luxury for discerning homeowners
  `;
}
