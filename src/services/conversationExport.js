import { getLeadTier } from "./leadCapture.js";

/**
 * Conversation export — CSV/JSON formatting for the dashboard's "Export" feature.
 * Mirrors the CSV export pattern used in services/broadcast.js.
 */

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Prefix a UTF-8 BOM so Excel renders emojis/accents in chat text correctly.
const BOM = "﻿";

/**
 * Full message-by-message transcript for a single conversation.
 */
export function exportConversationTranscriptCSV(session) {
  const rows = ["Timestamp,Role,Message,Media URL"];
  for (const m of session.history || []) {
    rows.push(
      [
        csvEscape(m.timestamp ? new Date(m.timestamp).toLocaleString() : ""),
        csvEscape(m.role),
        csvEscape(m.content || ""),
        csvEscape(m.mediaUrl || ""),
      ].join(",")
    );
  }
  return BOM + rows.join("\n");
}

/**
 * Full conversation (transcript + lead context) as a JSON document.
 */
export function exportConversationJSON(session) {
  return {
    userId: session.userId,
    state: session.state,
    leadScore: session.leadScore,
    leadTier: getLeadTier(session.leadScore),
    leadData: session.leadData || {},
    consentGiven: session.consentGiven || false,
    firstContact: session.firstContact || null,
    lastActivity: session.lastActivity || null,
    messageCount: session.history?.length || 0,
    history: session.history || [],
  };
}

/**
 * One-row-per-conversation summary across many sessions (for the "Export all" button).
 */
export function exportConversationsSummaryCSV(sessions) {
  const header = [
    "User ID", "Name", "Phone", "Email", "State", "Lead Score", "Lead Tier",
    "Property Interest", "Budget", "Message Count", "Consent Given",
    "First Contact", "Last Activity", "Last Message",
  ];
  const rows = [header.join(",")];

  for (const s of sessions) {
    const lastMsg = s.history?.length > 0 ? s.history[s.history.length - 1].content : "";
    rows.push(
      [
        csvEscape(s.userId),
        csvEscape(s.leadData?.name || ""),
        csvEscape(s.leadData?.phone || s.userId),
        csvEscape(s.leadData?.email || ""),
        csvEscape(s.state || ""),
        s.leadScore || 0,
        csvEscape(getLeadTier(s.leadScore)),
        csvEscape(s.leadData?.propertyInterest || ""),
        csvEscape(s.leadData?.budget || ""),
        s.history?.length || 0,
        s.consentGiven ? "Yes" : "No",
        csvEscape(s.firstContact ? new Date(s.firstContact).toLocaleString() : ""),
        csvEscape(s.lastActivity ? new Date(s.lastActivity).toLocaleString() : ""),
        csvEscape(lastMsg),
      ].join(",")
    );
  }
  return BOM + rows.join("\n");
}
