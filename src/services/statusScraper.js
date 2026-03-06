import axios from "axios";
import { getAllProperties, updateProperty } from "../data/properties.js";
import { isDBConnected } from "../db/connection.js";

/**
 * Scrapes devtracoplus.com project pages to detect sold-out status
 * and updates the database accordingly.
 *
 * Runs on server startup and every 6 hours.
 */

const SOLD_OUT_PATTERNS = [
  /is\s+sold\s+out/i,
  /are\s+sold\s+out/i,
  /currently\s+sold\s+out/i,
  /\bsold\s+out\b/i,
];

const LIMITED_PATTERNS = [
  /limited\s+availability/i,
  /few\s+units?\s+(left|remaining|available)/i,
  /only\s+\d+\s+units?\s+(left|remaining|available)/i,
];

async function fetchPageText(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { "User-Agent": "DevtracoBot/1.0" },
    });
    return typeof data === "string" ? data : "";
  } catch (err) {
    console.warn(`[StatusScraper] Failed to fetch ${url}:`, err.message);
    return "";
  }
}

function detectStatus(html) {
  if (SOLD_OUT_PATTERNS.some((p) => p.test(html))) return "Sold Out";
  if (LIMITED_PATTERNS.some((p) => p.test(html))) return "Limited Availability";
  return null; // no change detected — keep current status
}

export async function syncPropertyStatuses() {
  if (!isDBConnected()) {
    console.log("[StatusScraper] DB not connected, skipping sync");
    return;
  }

  console.log("[StatusScraper] Checking devtracoplus.com for status updates...");
  const properties = await getAllProperties();
  let updated = 0;

  for (const prop of properties) {
    if (!prop.projectUrl) continue;

    const html = await fetchPageText(prop.projectUrl);
    if (!html) continue;

    const detected = detectStatus(html);
    if (!detected) continue; // page didn't mention sold out / limited — leave as-is

    if (detected !== prop.status) {
      try {
        await updateProperty(prop.id, { status: detected });
        console.log(`[StatusScraper] ${prop.name}: "${prop.status}" → "${detected}"`);
        updated++;
      } catch (err) {
        console.error(`[StatusScraper] Failed to update ${prop.name}:`, err.message);
      }
    }
  }

  console.log(`[StatusScraper] Done. ${updated} status${updated !== 1 ? "es" : ""} updated.`);
}

/**
 * Start periodic status checking (every 6 hours)
 */
export function startStatusScraper() {
  // Run immediately on startup (with delay to let DB settle)
  setTimeout(() => syncPropertyStatuses(), 10000);

  // Then every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => syncPropertyStatuses(), SIX_HOURS);
  console.log("[StatusScraper] Scheduled: checks every 6 hours ✅");
}
