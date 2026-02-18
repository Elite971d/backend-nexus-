# Skip Trace Freemium Implementation Summary

## Overview
A FREE/FREEMIUM skip tracing system has been implemented that enriches leads with contact data (phone, email, mailing address) using only free or freemium sources. The system is optional, non-blocking, and gracefully handles "no data found" scenarios.

## Architecture

### Provider-Based System
The skip trace system uses a provider-based architecture located in `/utils/skiptrace/`:

1. **baseProvider.js** - Base interface defining the `skipTrace(lead)` method
2. **noopProvider.js** - Fallback provider that returns empty contact info
3. **publicRecordsProvider.js** - Extracts data from existing lead fields (mailingAddress, ownerName, etc.)
4. **freemiumApiProvider.js** - Optional provider using People Data Labs API (if API key is present)
5. **index.js** - Orchestrator that runs providers in sequence and merges results

### Provider Execution Order
1. `publicRecordsProvider` - Always runs, extracts from existing lead data
2. `freemiumApiProvider` - Only runs if API key is present (PEOPLE_DATA_LABS_API_KEY or CLEARBIT_API_KEY)
3. `noopProvider` - Always runs as fallback (returns empty if no data found)

## Data Sources

### Public Records Provider
Extracts contact information from data ALREADY available in the lead:
- County appraisal district data (mailingAddress)
- Tax assessor records
- Clerk/probate filings
- Owner name analysis (determines if individual or entity)

**Output:**
- `mailingAddress` - From lead.mailingAddress
- `ownerType` - "individual" or "entity" (based on ownerName analysis)
- `source` - "public_records"

### Freemium API Provider
Uses People Data Labs API (optional, env-based):
- Only runs if `PEOPLE_DATA_LABS_API_KEY` is set
- Limits calls to 1 per lead
- Never crashes if quota exceeded
- Only enriches missing fields
- Auto-disables if no key exists (logs warning once)

**Output:**
- `phones` - Array of phone numbers
- `emails` - Array of email addresses
- `source` - "freemium_api"

## Lead Model Extensions

### Top-Level Fields (for easy access)
- `phones: [String]` - Simple array of phone numbers
- `emails: [String]` - Simple array of email addresses
- `skipTraceStatus: String` - "pending" | "completed" | "no_data"
- `skipTraceSources: [String]` - Array of provider names that contributed data
- `lastSkipTracedAt: Date` - Timestamp of last skip trace

### Skip Trace Object (detailed data)
- `skipTrace.status` - "not_requested" | "pending" | "completed" | "no_data" | "failed"
- `skipTrace.phones` - Array of phone objects with metadata
- `skipTrace.emails` - Array of email objects with metadata
- `skipTrace.mailingAddresses` - Array of address objects
- `skipTrace.entityInfo` - Business entity information
- `skipTrace.confidenceScore` - 0-100 confidence score
- `skipTrace.provider` - Provider name(s) used
- `skipTrace.skipTraceSources` - Array of source names

## API Endpoints

### POST /api/skiptrace/:leadId
Request skip trace for a lead.

**Roles:** admin, manager, closer

**Behavior:**
- Runs skip trace using orchestrator
- Updates Lead with any found data
- Sets status accordingly (completed, no_data, or failed)
- Returns enriched lead
- Non-blocking - never crashes on errors

**Response:**
```json
{
  "message": "Skip trace requested successfully",
  "lead": { /* enriched lead object */ }
}
```

### GET /api/skiptrace/leads/:id
Get skip trace data for a lead.

**Roles:** admin, manager, closer, dialer

**Behavior:**
- Dialers see limited data (status, counts only)
- Closers/managers/admins see full data (phones, emails, addresses)

### POST /api/skiptrace/leads/:id/lock
Lock/unlock skip trace (admin only)

### GET /api/skiptrace/leads/:id/estimate
Estimate cost (returns 0 for free/freemium providers)

## Frontend Integration

### Dialer View
- Shows skip trace status
- Shows phone/email counts (if available)
- "Run Skip Trace" button (if no data exists)
- Button disabled while running
- Status indicators: Completed (green), No data found (orange), Not requested (gray)

### Closer View
- Shows full skip trace data
- Displays actual phone numbers and emails
- "Run Skip Trace" button (if no data exists)
- Full status information

### CRM View
- "Skip Trace" button in lead table
- Shows status after completion

## Logging & Safety

### Logs Added
- `[SkipTrace] Starting skip trace for lead X`
- `[SkipTrace] Running provider: <name>`
- `[SkipTrace] <provider> found: X phones, Y emails`
- `[SkipTrace] Completed - phones: X, emails: Y, sources: ...`
- `[SkipTraceService] Skip trace started for lead X`
- `[SkipTraceService] Skip trace completed — phones: X, emails: Y`
- `[SkipTraceService] Skip trace no data found`
- `[SkipTraceService] Skip trace error for lead X: <error>`

### Safety Features
- Errors never crash the server
- Rate limits respected (freemium API)
- Providers can be disabled via env (no API key = auto-disable)
- Graceful handling of "no data found"
- Non-blocking - system continues even if skip trace fails

## Environment Variables

### Optional (for freemium API)
- `PEOPLE_DATA_LABS_API_KEY` - Enable People Data Labs provider
- `CLEARBIT_API_KEY` - Enable Clearbit provider (stub, not yet implemented)

**Note:** If no API keys are set, the system still works using only the public records provider.

## Key Features

✅ **No Paid Providers Required** - Works with free sources only
✅ **Non-Blocking** - Never crashes, gracefully handles errors
✅ **Optional** - Can be triggered manually, not automatic
✅ **Re-runnable** - Can be run multiple times safely
✅ **Provider Architecture** - Easy to add paid providers later
✅ **Deduplication** - Merges and deduplicates results from all providers
✅ **Role-Based Access** - Dialers see limited data, closers see full data
✅ **Status Tracking** - Clear status indicators (pending, completed, no_data, failed)

## Future Enhancements

The architecture supports adding paid providers later without refactoring:
1. Create new provider class extending `BaseProvider`
2. Add to orchestrator in `utils/skiptrace/index.js`
3. Provider will automatically run in sequence with others

## Testing

To test the skip trace system:
1. Ensure a lead exists with `ownerName` and/or `mailingAddress`
2. Call `POST /api/skiptrace/:leadId`
3. Check lead for updated `phones`, `emails`, and `skipTraceStatus`
4. Verify logs show provider execution
5. Check frontend displays skip trace data correctly

## Files Created/Modified

### Created
- `utils/skiptrace/baseProvider.js`
- `utils/skiptrace/noopProvider.js`
- `utils/skiptrace/publicRecordsProvider.js`
- `utils/skiptrace/freemiumApiProvider.js`
- `utils/skiptrace/index.js`

### Modified
- `services/skipTraceService.js` - Updated to use orchestrator
- `models/Lead.js` - Added top-level fields
- `controllers/skipTraceController.js` - Updated endpoint path
- `routes/skipTraceRoutes.js` - Added new route pattern
- `index.html` - Added skip trace UI and functionality

