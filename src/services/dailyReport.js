import XLSX from "xlsx";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getAllSessions } from "./session.js";
import { getLeadTier } from "./leadCapture.js";
import { sendTextMessage, sendDocumentMessage } from "./whatsapp.js";
import config from "../config/index.js";

const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${config.port}`;
const REPORTS_DIR = path.join(process.cwd(), "public", "reports");

function getGhanaDateString(ms = Date.now()) {
  // Ghana is UTC+0 — same as UTC, no offset needed
  return new Date(ms).toISOString().split("T")[0]; // YYYY-MM-DD
}

function getTodayGhanaStartMs() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today.getTime();
}

async function generateDailyExcel() {
  const sessions = await getAllSessions();
  const todayStart = getTodayGhanaStartMs();

  const activeSessions = sessions.filter((s) => s.lastActivity >= todayStart);

  if (activeSessions.length === 0) return null;

  // Sort: HOT → WARM → COLD (descending lead score)
  const sorted = [...activeSessions].sort((a, b) => b.leadScore - a.leadScore);

  const ghanaLocale = (ms) =>
    new Date(ms).toLocaleString("en-GB", {
      timeZone: "Africa/Accra",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const rows = sorted.map((s) => ({
    "Phone": `+${s.userId}`,
    "Name": s.leadData?.name || "Not provided",
    "Email": s.leadData?.email || "Not provided",
    "Country": s.leadData?.country || "Not provided",
    "Budget": s.leadData?.budget || "Not provided",
    "Property Interest": s.leadData?.propertyInterest || "Not provided",
    "Lead Score": s.leadScore,
    "Tier": getLeadTier(s.leadScore),
    "Messages": s.history?.length || 0,
    "Status": s.state,
    "Escalated": s.state === "ESCALATED" ? "Yes" : "No",
    "First Contact": s.firstContact ? ghanaLocale(s.firstContact) : "N/A",
    "Last Active": ghanaLocale(s.lastActivity),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 15 },
    { wch: 15 }, { wch: 26 }, { wch: 11 }, { wch: 7 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Daily Leads");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const hot = sorted.filter((s) => s.leadScore >= 80).length;
  const warm = sorted.filter((s) => s.leadScore >= 50 && s.leadScore < 80).length;
  const cold = sorted.filter((s) => s.leadScore < 50).length;

  return { buffer, count: sorted.length, hot, warm, cold };
}

export async function sendDailyReportToAgent() {
  const agentNumber = config.company.escalationWhatsApp.replace("+", "");
  const dateLabel = new Date().toLocaleDateString("en-GB", {
    timeZone: "Africa/Accra",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    console.log("[DailyReport] Generating daily leads report...");
    const result = await generateDailyExcel();

    if (!result) {
      await sendTextMessage(
        agentNumber,
        `📊 *Daily Leads Report — ${dateLabel}*\n\n_No active chats recorded today._`
      );
      console.log("[DailyReport] No active sessions today — sent empty notice");
      return;
    }

    // Send summary text first
    const summary =
      `📊 *Daily Leads Report — ${dateLabel}*\n\n` +
      `📋 *Total Active Today:* ${result.count}\n` +
      `🔥 *Hot Leads:* ${result.hot}\n` +
      `🟡 *Warm Leads:* ${result.warm}\n` +
      `🔵 *Cold Leads:* ${result.cold}\n\n` +
      `📎 See attached Excel file for full details (sorted Hot → Warm → Cold).`;

    await sendTextMessage(agentNumber, summary);

    // Save Excel to public folder and send via URL
    if (!existsSync(REPORTS_DIR)) {
      await mkdir(REPORTS_DIR, { recursive: true });
    }

    const dateStr = getGhanaDateString();
    const filename = `devtraco-leads-${dateStr}.xlsx`;
    const filepath = path.join(REPORTS_DIR, filename);

    await writeFile(filepath, result.buffer);

    const fileUrl = `${BASE_URL}/static/reports/${filename}`;
    await sendDocumentMessage(agentNumber, fileUrl, filename, `Daily Leads — ${dateStr}`);

    console.log(
      `[DailyReport] ✅ Sent to agent: ${result.count} leads (${result.hot} hot, ${result.warm} warm, ${result.cold} cold)`
    );
  } catch (err) {
    console.error("[DailyReport] ❌ Failed to send daily report:", err.message);
    try {
      await sendTextMessage(
        agentNumber,
        `⚠️ *Daily Leads Report — ${dateLabel}*\n\nFailed to generate report: ${err.message}\n\nPlease check the dashboard for today's leads.`
      );
    } catch { /* swallow secondary error */ }
  }
}

export function scheduleDailyReport() {
  const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
  console.log(`[DailyReport] Scheduled every 5 minutes`);
  setInterval(sendDailyReportToAgent, INTERVAL_MS);
}
