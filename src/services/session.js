import config from "../config/index.js";

/**
 * In-memory session store for conversation context.
 * In production, swap this for Redis or DynamoDB.
 *
 * Each session:
 *  {
 *    userId: string,
 *    history: [{ role: "user"|"assistant", content: string, timestamp }],
 *    state: string,           // current conversation state
 *    leadData: {},            // captured lead info
 *    leadScore: number,
 *    lastActivity: Date,
 *    consentGiven: boolean,   // GDPR consent
 *    metadata: {}             // arbitrary key-value
 *  }
 */

const sessions = new Map();

export function getSession(userId) {
  const session = sessions.get(userId);
  if (session) {
    // Check TTL
    const elapsed = (Date.now() - session.lastActivity) / 1000 / 60;
    if (elapsed > config.session.ttlMinutes) {
      sessions.delete(userId);
      return createSession(userId);
    }
    session.lastActivity = Date.now();
    return session;
  }
  return createSession(userId);
}

export function createSession(userId) {
  const session = {
    userId,
    history: [],
    state: "GREETING",  // initial state
    leadData: {
      name: null,
      email: null,
      phone: userId,
      budget: null,
      propertyInterest: null,
      preferredLocation: null,
      timeline: null,
    },
    leadScore: 0,
    lastActivity: Date.now(),
    consentGiven: false,
    metadata: {},
  };
  sessions.set(userId, session);
  return session;
}

export function addMessage(userId, role, content) {
  const session = getSession(userId);
  session.history.push({
    role,
    content,
    timestamp: Date.now(),
  });

  // Trim to maxHistory
  if (session.history.length > config.session.maxHistory) {
    session.history = session.history.slice(-config.session.maxHistory);
  }

  session.lastActivity = Date.now();
  return session;
}

export function updateState(userId, newState) {
  const session = getSession(userId);
  session.state = newState;
  session.lastActivity = Date.now();
  return session;
}

export function updateLeadData(userId, data) {
  const session = getSession(userId);
  Object.assign(session.leadData, data);
  session.lastActivity = Date.now();
  recalculateLeadScore(session);
  return session;
}

export function setConsent(userId, consent) {
  const session = getSession(userId);
  session.consentGiven = consent;
  return session;
}

export function deleteSession(userId) {
  sessions.delete(userId);
}

export function getAllSessions() {
  return Array.from(sessions.values());
}

export function getActiveSessionCount() {
  return sessions.size;
}

/**
 * Simple rule-based lead scoring
 */
function recalculateLeadScore(session) {
  let score = 0;
  const ld = session.leadData;

  if (ld.name) score += 15;
  if (ld.email) score += 20;
  if (ld.budget) score += 15;
  if (ld.propertyInterest) score += 15;
  if (ld.preferredLocation) score += 10;
  if (ld.timeline) score += 10;

  // Engagement bonus
  if (session.history.length > 5) score += 5;
  if (session.history.length > 10) score += 5;
  if (session.consentGiven) score += 5;

  session.leadScore = Math.min(score, 100);
}
