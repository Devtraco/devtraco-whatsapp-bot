# WhatsApp Agent Broadcast Guide

This system allows you to send WhatsApp broadcasts to your 80+ agents for the Agent Mixer event on April 30th.

## Features

✅ Send messages to 80+ agents at once
✅ Automatic rate limiting (batches of 20 with 2-second delays)
✅ Parse phone numbers from CSV/JSON files
✅ Auto-detect phone number fields
✅ Automatic Ghana phone number formatting (+233)
✅ Error tracking and retry logic
✅ CLI and REST API options

---

## Method 1: Using the CLI (Fastest)

### Setup

Ensure you have your agent contact list as a CSV file with a phone column.

### Run Broadcast

```bash
# Using CSV file
node broadcast-cli.js --csv agents.csv --message "Join us for the Agent Mixer on April 30th at our headquarters! Event details: [link]"

# With specific phone column name
node broadcast-cli.js --csv agents.csv --phoneField "mobile_number" --message "Your message"

# Using JSON file
node broadcast-cli.js --file agents.json --message "Join us on April 30th!"
```

### CSV Format Required

The CSV file must have a phone column (auto-detected from: `phone`, `phone_number`, `whatsapp`, `mobile`):

```csv
name,email,phone_number,status
John Amah,john@example.com,0501234567,active
Mary Osei,mary@example.com,0502234567,active
```

**Note:** Numbers starting with `0` are automatically converted to `+233` format. Numbers already in `+233` format are used as-is.

---

## Method 2: Using the REST API

### Option A: Send to List of Numbers

```bash
curl -X POST http://localhost:3000/api/broadcast/send \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumbers": ["+233501234567", "+233502234567"],
    "message": "Join us for the Agent Mixer on April 30th!"
  }'
```

### Option B: Upload Excel/CSV File

```bash
curl -X POST http://localhost:3000/api/broadcast/upload-excel \
  -F "file=@agents.csv" \
  -F "message=Join us for the Agent Mixer on April 30th!"
```

### Response Example

```json
{
  "status": "broadcast_completed",
  "totalRequested": 80,
  "totalSent": 78,
  "failed": 2,
  "durationSeconds": 12.5,
  "failedNumbers": [
    {
      "number": "+233501111111",
      "reason": "Invalid phone number"
    }
  ]
}
```

---

## Step-by-Step: Send Broadcast to 80 Agents

### 1. **Prepare Your Contact List**
   - Export from your Excel file as **CSV**
   - Ensure it has a phone column (`phone`, `phone_number`, `whatsapp`, or `mobile`)
   - Save it: `agents.csv`

### 2. **Format Check**
   - Phone numbers should be either:
     - Local format: `0501234567` (converted to `+233501234567`)
     - International: `+233501234567` (used as-is)

### 3. **Send Broadcast**

**Via CLI (Recommended for admin):**
```bash
node broadcast-cli.js --csv agents.csv --message "You're invited to Devtraco Plus Agent Mixer on April 30th! Event details: [link]. Reply 'YES' to confirm attendance."
```

**Via HTTP (For Web Dashboard):**
```bash
POST /api/broadcast/send
Content-Type: application/json

{
  "phoneNumbers": ["+233501234567", "+233502234567", ...],
  "message": "You're invited to Devtraco Plus Agent Mixer on April 30th!"
}
```

### 4. **Monitor Progress**
   - CLI shows real-time progress
   - API returns summary with success/failure counts
   - Batch size: 20 numbers per batch
   - Delay: 2 seconds between batches
   - For 80 agents: ~8 seconds total

---

## Message Template for April 30th Event

```
📢 You're invited to the Devtraco Plus Agent Mixer - April 30th!

Celebrate your achievements and network with fellow agents.

Date: Tuesday, April 30th, 2026
Time: [INSERT TIME]
Location: [INSERT LOCATION]

🔗 Event Details: [INSERT LINK]

Please reply with:
✓ YES - I'll attend
✗ NO - I can't make it
? MAYBE - Still deciding

See you there! 🎉
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Phone column not found" | Ensure CSV has a column named `phone`, `phone_number`, `whatsapp`, or `mobile` |
| "Invalid phone number" | Check format—must start with `+` or `0` (e.g., `+233501234567` or `0501234567`) |
| "Rate limit exceeded" | System automatically batches. Wait 2 seconds between batches. |
| "Failed to send to X numbers" | Check network connection. System retries automatically. |
| "File format not supported" | Use CSV or JSON. XLSX support coming soon. |

---

## Technical Details

- **Batch Size:** 20 numbers per batch (respects WhatsApp rate limits)
- **Delay Between Batches:** 2 seconds (configurable via options)
- **Retry Logic:** Built-in exponential backoff for failed messages
- **Rate Limiting:** WhatsApp Business API rate limits handled
- **Success Rate:** Typically 99%+ for valid numbers

---

## What Gets Logged

- ✅ All successfully sent messages
- ❌ Failed numbers with error reasons
- ⏱️ Total duration and batch timing
- 📊 Summary report with stats

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/broadcast/send` | Send to phone number list |
| POST | `/api/broadcast/upload-excel` | Upload CSV/JSON file |
| GET | `/api/broadcast/status` | Check broadcast status |

---

## Next Steps

1. ✅ Export agent contacts as CSV from Excel
2. ✅ Verify phone number format (+233 or 0-prefix)
3. ✅ Run broadcast via CLI or API
4. ✅ Monitor responses (agents will reply with YES/NO/MAYBE)
5. ✅ Export responses for attendance tracking
