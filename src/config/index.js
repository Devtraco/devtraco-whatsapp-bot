import dotenv from "dotenv";
dotenv.config();

const config = {
  port: process.env.PORT || 3000,

  // WhatsApp Business API
  whatsapp: {
    verifyToken: process.env.VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    apiVersion: "v22.0",
    get baseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    },
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    maxTokens: 1024,
    temperature: 0.7,
  },

  // Session
  session: {
    ttlMinutes: 30, // conversation context window
    maxHistory: 20, // max messages kept in context
  },

  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000,   // 1 minute
    maxRequests: 30,        // per user per window
  },

  // Lead scoring thresholds
  leadScoring: {
    hot: 80,
    warm: 50,
    cold: 0,
  },

  // Company info for the AI system prompt
  company: {
    name: "Devtraco",
    industry: "Real Estate Development",
    description: "Devtraco is a leading real estate development company in Ghana, specializing in premium residential and commercial properties.",
    website: "https://devtraco.com",
    phone: "+233 30 222 3441",
    email: "info@devtraco.com",
  },
};

// Validate required env vars
const required = ["VERIFY_TOKEN", "WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "OPENAI_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export default config;
