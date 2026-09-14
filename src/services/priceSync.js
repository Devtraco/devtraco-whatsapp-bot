import XLSX from "xlsx";
import { getAllProperties, updateProperty } from "../data/properties.js";
import { invalidatePromptCache } from "./ai.js";

/**
 * Price sheet sync — pulls the Devtraco price list Google Sheet as CSV
 * (the sheet is shared "anyone with the link can view", so no Google API
 * credentials are needed) and updates each matching property's priceList.
 *
 * The sheet is laid out as one mini-table per project:
 *   SN,<PROJECT NAME>,START SALE PRICE (USD),MORTGAGE (USD)
 *   1,Studio,"109,425.73","115,425.73"
 *   2,One Bed,"196,020.96","203,020.96"
 *   ...
 *   ,,,               <- blank row separates the next table
 *
 * Re-running this is safe (idempotent) — it always overwrites priceList
 * with the sheet's current numbers.
 */

const SHEET_ID = process.env.PRICE_SHEET_ID || "1Hyd3Gv_8yY5RYlJIH9yJYMr0wTfnwl1dl7_oWMMXtFk";
const SHEET_GID = process.env.PRICE_SHEET_GID || "0";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const POLL_MINUTES = parseInt(process.env.PRICE_SYNC_MINUTES || "30", 10);

// Generic words that appear across multiple property names and shouldn't drive a match on their own.
const STOPWORDS = new Set([
  "THE", "APARTMENTS", "APARTMENT", "RESIDENCES", "RESIDENCE", "TOWNHOMES", "TOWNHOUSES",
  "TOWNHOME", "TOWNHOUSE", "HOTEL", "PLACE", "COURT", "PLOT", "LAND", "INVESTMENT", "INVESTMENTS",
]);

let lastSyncResult = null;
const syncLog = []; // most recent runs first, capped

// ───────── CSV parsing ─────────

function parseMoney(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null, soldOut: false };
  if (/sold/i.test(s)) return { value: null, soldOut: true };
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return { value: Number.isFinite(n) ? n : null, soldOut: false };
}

/**
 * Parse the multi-table CSV into blocks: [{ name, rows: [{unitType,startPrice,mortgagePrice,soldOut}] }]
 */
export function parsePriceSheetCSV(csvText) {
  const wb = XLSX.read(csvText, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const blocks = [];
  let current = null;

  for (const row of rows) {
    const c0 = String(row[0] ?? "").trim();
    const c1 = String(row[1] ?? "").trim();

    if (c0.toUpperCase() === "SN") {
      current = { name: c1, rows: [] };
      blocks.push(current);
      continue;
    }

    const isBlank = row.every((c) => String(c ?? "").trim() === "");
    if (isBlank) { current = null; continue; }

    if (current && c1) {
      const start = parseMoney(row[2]);
      const mortgage = parseMoney(row[3]);
      current.rows.push({
        unitType: c1,
        startPrice: start.value,
        mortgagePrice: mortgage.value,
        soldOut: start.soldOut || mortgage.soldOut,
      });
    }
  }

  return blocks.filter((b) => b.rows.length > 0);
}

// ───────── Fuzzy matching sheet project names → catalog properties ─────────

function normalizeTokens(str) {
  return String(str || "")
    .toUpperCase()
    .replace(/['".]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildPropertyIndex(properties) {
  return properties.map((p) => ({
    property: p,
    tokens: new Set([...normalizeTokens(p.name), ...normalizeTokens(p.propertyId)]),
  }));
}

function scoreTokens(queryTokens, indexTokens) {
  let score = 0;
  for (const qt of queryTokens) {
    for (const pt of indexTokens) {
      if (pt === qt || (qt.length > 2 && (pt.includes(qt) || qt.includes(pt)))) { score++; break; }
    }
  }
  return score;
}

/** Returns { property, candidates } — property is null when there's no match or it's a tie. */
function matchText(text, index) {
  const qTokens = normalizeTokens(text).filter((t) => !STOPWORDS.has(t));
  if (qTokens.length === 0) return { property: null, candidates: [] };

  const scored = index
    .map((e) => ({ property: e.property, score: scoreTokens(qTokens, e.tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { property: null, candidates: [] };
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return { property: scored[0].property, candidates: scored };
  }
  return { property: null, candidates: scored }; // ambiguous tie
}

/**
 * Match each sheet block to a property. Tries the whole block name first; if that's
 * ambiguous or unmatched, falls back to matching each row individually — this is what
 * lets a combined block like "WOODLANDS ORCHID/JUTE" split correctly across two
 * properties (Woodlands Orchid, Woodlands Jute) without any hardcoded alias list.
 */
function matchBlocksToProperties(blocks, properties) {
  const index = buildPropertyIndex(properties);
  const matched = new Map(); // propertyId -> rows[]
  const unmatched = [];

  for (const block of blocks) {
    const whole = matchText(block.name, index);
    if (whole.property) {
      const list = matched.get(whole.property.propertyId) || [];
      matched.set(whole.property.propertyId, [...list, ...block.rows]);
      continue;
    }

    const leftover = [];
    for (const row of block.rows) {
      const rowMatch = matchText(`${block.name} ${row.unitType}`, index);
      if (rowMatch.property) {
        const list = matched.get(rowMatch.property.propertyId) || [];
        matched.set(rowMatch.property.propertyId, [...list, row]);
      } else {
        leftover.push(row.unitType);
      }
    }

    if (leftover.length === block.rows.length) {
      unmatched.push({ sheetProject: block.name, unitCount: block.rows.length, reason: "No matching property in the catalog" });
    } else if (leftover.length > 0) {
      unmatched.push({ sheetProject: block.name, unmatchedUnits: leftover, reason: "Some unit rows couldn't be matched" });
    }
  }

  return { matched, unmatched };
}

// ───────── Sync orchestration ─────────

export async function syncPricesFromSheet({ dryRun = false } = {}) {
  const startedAt = Date.now();
  const result = { timestamp: startedAt, ok: false, matchedProperties: [], unmatchedItems: [], error: null };

  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
    const csvText = await res.text();

    const blocks = parsePriceSheetCSV(csvText);
    const properties = await getAllProperties();
    const { matched, unmatched } = matchBlocksToProperties(blocks, properties);

    for (const [propertyId, rows] of matched.entries()) {
      const priceList = rows.map((r) => ({
        unitType: r.unitType,
        startPrice: r.startPrice,
        mortgagePrice: r.mortgagePrice,
        soldOut: r.soldOut,
      }));
      const available = priceList.filter((r) => !r.soldOut && r.startPrice != null);
      const priceFrom = available.length > 0 ? Math.min(...available.map((r) => r.startPrice)) : null;

      const prop = properties.find((p) => p.propertyId === propertyId);
      const updates = { priceList, lastPriceSyncAt: new Date() };
      if (priceFrom != null) updates.priceFrom = priceFrom; // leave priceFrom untouched if every unit is sold out

      if (!dryRun) {
        await updateProperty(propertyId, updates);
      }
      result.matchedProperties.push({
        propertyId,
        name: prop?.name,
        unitCount: priceList.length,
        priceFrom: priceFrom ?? prop?.priceFrom,
      });
    }

    result.unmatchedItems = unmatched;
    result.ok = true;

    // Clear the cached AI system prompt so the bot picks up new prices immediately,
    // instead of waiting out the 5-minute cache TTL in services/ai.js.
    if (!dryRun && matched.size > 0) invalidatePromptCache();
  } catch (err) {
    result.error = err.message;
    console.error("[PriceSync] Failed:", err.message);
  }

  result.durationMs = Date.now() - startedAt;
  lastSyncResult = result;
  syncLog.unshift(result);
  if (syncLog.length > 20) syncLog.pop();

  console.log(
    `[PriceSync] ${result.ok ? "OK" : "FAILED"} — ${result.matchedProperties.length} propert${result.matchedProperties.length === 1 ? "y" : "ies"} updated, ${result.unmatchedItems.length} unmatched item(s) (${result.durationMs}ms)`
  );

  return result;
}

export function getLastPriceSyncResult() {
  return lastSyncResult;
}

export function getPriceSyncLog() {
  return syncLog;
}

/**
 * Run once shortly after startup, then on a fixed interval — mirrors the
 * startStatusScraper() pattern in services/statusScraper.js.
 */
export function startPriceSyncScheduler() {
  setTimeout(() => syncPricesFromSheet(), 10_000);
  setInterval(() => syncPricesFromSheet(), POLL_MINUTES * 60 * 1000);
  console.log(`[PriceSync] Scheduler started — polling the price sheet every ${POLL_MINUTES} min`);
}
