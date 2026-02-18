# Skip Trace + Data Enrichment Implementation Summary

## Overview

The Elite Nexus CRM / Rapid Offer System has been extended with a comprehensive Skip Tracing + Data Enrichment pipeline that supports:
- Seller contact enrichment (phone, email, mailing address, entity data)
- Buyer intelligence (cash buyers list by market)
- Market expansion from DFW & Houston to all 50 states

## ✅ Requirements Confirmation

### 1. Skip Trace is Provider-Agnostic ✅
- **Base Provider Interface**: `utils/skipTraceProviders/baseProvider.js`
- **No-op Provider**: `utils/skipTraceProviders/noopProvider.js` (default)
- **Provider Selection**: Via `SKIP_TRACE_PROVIDER` environment variable
- **Easy Extension**: Add new providers by creating a class extending `BaseProvider` and updating `services/skipTraceService.js`

### 2. Buyers List Builds from Cash Transactions ✅
- **Auto-Creation**: `services/buyerIntelligenceService.js` automatically creates buyer records when:
  - `lead.closer.offerLaneFinal === 'cash'`
  - Skip trace entity info indicates buyer entity
  - Transaction data indicates cash purchase
- **Buyer Model**: `models/Buyer.js` stores buyer intelligence data
- **Integration**: Auto-processes buyers when offers are set to cash in closer workflow

### 3. System Supports Expansion to All 50 States ✅
- **Market Utility**: `utils/marketUtils.js` provides market code validation and normalization
- **Market Format**: `STATE-MARKET` (e.g., `TX-DFW`, `CA-LA`, `NY-NYC`)
- **All 50 States**: `US_STATES` constant includes all valid state codes
- **Scalable Design**: Market system can handle any state-market combination

## New Models

### 1. Lead Model Extensions (`models/Lead.js`)
Added `skipTrace` schema:
```javascript
skipTrace: {
  status: enum('not_requested', 'pending', 'completed', 'failed'),
  requestedAt: Date,
  completedAt: Date,
  requestedBy: ObjectId (ref: User),
  provider: String,
  confidenceScore: Number (0-100),
  phones: [{ number, type, confidence, lastSeen }],
  emails: [{ email, confidence, lastSeen }],
  mailingAddresses: [{ address, confidence, lastSeen }],
  entityInfo: { isLLC, entityName, registeredState },
  notes: String
}
skipTraceLocked: Boolean
skipTraceCost: Number
```

### 2. Buyer Model (`models/Buyer.js`)
New model for cash buyer intelligence:
```javascript
{
  name: String,
  entityName: String,
  phones: [String],
  emails: [String],
  mailingAddress: String,
  markets: [String], // e.g., ['TX-DFW', 'TX-HOUSTON']
  propertyTypes: [enum('sfh', 'mf', 'land', 'commercial')],
  lastPurchaseDate: Date,
  purchaseMethod: enum('cash', 'hard_money', 'other'),
  source: enum('skip_trace', 'deed_records', 'manual'),
  tags: [String],
  confidenceScore: Number (0-100),
  metadata: Mixed,
  timestamps: true
}
```

## New Services

### 1. Skip Trace Service (`services/skipTraceService.js`)
**Responsibilities**:
- Provider selection via `SKIP_TRACE_PROVIDER` env variable
- Deduplication of phones, emails, addresses
- Normalization of formats (E.164 phones, lowercase emails)
- Updates `Lead.skipTrace` with results
- Handles retries and failures gracefully
- Emits KPI events: `skip_trace_requested`, `skip_trace_completed`, `skip_trace_failed`

**Key Functions**:
- `skipTraceLead(leadId, userId)` - Perform skip trace
- `estimateSkipTraceCost(leadId)` - Estimate cost
- `getProvider()` - Get configured provider instance

### 2. Buyer Intelligence Service (`services/buyerIntelligenceService.js`)
**Responsibilities**:
- Auto-create buyer records from cash transactions
- Create buyers from skip trace entity info
- Process leads with cash offer lanes
- Merge duplicate buyers

**Key Functions**:
- `createBuyerFromTransaction(transactionData, options)`
- `createBuyerFromSkipTrace(lead, entityInfo)`
- `processCashBuyerFromLead(lead)`

### 3. Market Utilities (`utils/marketUtils.js`)
**Responsibilities**:
- Validate market codes (`STATE-MARKET` format)
- Normalize markets (uppercase, validation)
- Extract state/market from codes
- Get default markets from env
- Support all 50 US states

## New Routes & Endpoints

### Skip Trace Routes (`routes/skipTraceRoutes.js`)
- `POST /api/skiptrace/leads/:id` - Request skip trace (admin, manager, closer)
- `GET /api/skiptrace/leads/:id` - Get skip trace data (role-filtered)
- `POST /api/skiptrace/leads/:id/lock` - Lock/unlock skip trace (admin only)
- `GET /api/skiptrace/leads/:id/estimate` - Estimate cost

### Buyer Routes (`routes/buyerRoutes.js`)
- `GET /api/buyers` - List buyers with filtering (market, type, purchaseMethod)
- `GET /api/buyers/:id` - Get single buyer
- `POST /api/buyers` - Create buyer manually (admin, manager)
- `PUT /api/buyers/:id` - Update buyer (admin, manager)
- `POST /api/buyers/leads/:leadId/attach` - Attach buyer to lead
- `GET /api/buyers/export` - Export buyers CSV

## Provider Interface System

### Base Provider (`utils/skipTraceProviders/baseProvider.js`)
Abstract class that all providers must extend:
- `skipTraceLead(lead)` - Returns normalized result
- `estimateCost(lead)` - Returns cost estimate
- Helper methods: `normalizePhone()`, `normalizeEmail()`, `normalizeAddress()`, `dedupeByKey()`

### No-op Provider (`utils/skipTraceProviders/noopProvider.js`)
Default provider for development/testing:
- Returns empty skip trace results
- Zero cost
- Safe for testing without external API calls

## Rapid Offer Integration

### Dialer View Updates (`controllers/rapidOfferDialerController.js`)
- Shows skip trace status badge: `not_requested` | `pending` | `completed`
- Displays phone/email counts (not actual numbers)
- Limited visibility (compliance requirement)

### Closer View Updates (`controllers/rapidOfferCloserController.js`)
- Full access to skip trace results (phones, emails, addresses, entity info)
- Ability to request skip trace if missing
- Confidence score visible
- Auto-processes cash buyers when offer lane set to cash

## KPI Events Extended

### Updated Model (`models/KpiEvent.js`)
Added event types:
- `skip_trace_requested`
- `skip_trace_completed`
- `skip_trace_failed`

## Compliance & Safety Features

1. **Role-Based Access**:
   - Dialers: Status and counts only (no actual phone/email numbers)
   - Closers/Managers: Full skip trace data access

2. **Skip Trace Locking**:
   - `skipTraceLocked` boolean prevents re-running
   - Only admin can unlock and re-run

3. **Audit Trail**:
   - All skip trace requests logged with `requestedBy` user ID
   - KPI events track all skip trace activities
   - Timestamps for requested/completed dates

4. **Data Protection**:
   - Sensitive data (SSN, DOB) never stored even if provider returns it
   - Normalized and deduplicated data only

## Environment Variables

Required/Recommended environment variables (see `SKIP_TRACE_CONFIG.md` for details):

```bash
SKIP_TRACE_PROVIDER=none          # Provider selection
SKIP_TRACE_MAX_PER_DAY=100        # Optional limit
DEFAULT_MARKETS=TX-DFW,TX-HOUSTON # Default markets
```

## File Structure

```
models/
  ├── Buyer.js (NEW)
  ├── Lead.js (UPDATED - skipTrace fields)
  └── KpiEvent.js (UPDATED - skip trace event types)

services/
  ├── skipTraceService.js (NEW)
  └── buyerIntelligenceService.js (NEW)

utils/
  ├── skipTraceProviders/
  │   ├── baseProvider.js (NEW)
  │   └── noopProvider.js (NEW)
  └── marketUtils.js (NEW)

controllers/
  ├── skipTraceController.js (NEW)
  ├── buyerController.js (NEW)
  ├── rapidOfferDialerController.js (UPDATED)
  └── rapidOfferCloserController.js (UPDATED)

routes/
  ├── skipTraceRoutes.js (NEW)
  └── buyerRoutes.js (NEW)

server.js (UPDATED - registered new routes)
```

## Usage Examples

### Request Skip Trace
```bash
POST /api/skiptrace/leads/:leadId
Authorization: Bearer <token>
```

### Get Skip Trace Results
```bash
GET /api/skiptrace/leads/:leadId
Authorization: Bearer <token>
```

### List Buyers by Market
```bash
GET /api/buyers?market=TX-DFW&type=sfh&purchaseMethod=cash
Authorization: Bearer <token>
```

### Export Buyers CSV
```bash
GET /api/buyers/export?market=TX-DFW
Authorization: Bearer <token>
```

## Next Steps for Production

1. **Implement Real Provider**: Replace `noopProvider` with actual skip trace API integration
2. **Add Market Mapping**: Enhance county-to-market mapping for better market assignment
3. **Transaction Integration**: Connect with deed/sale records for automatic buyer creation
4. **Rate Limiting**: Implement `SKIP_TRACE_MAX_PER_DAY` enforcement
5. **SMS/Email Campaigns**: Add messaging functionality (future enhancement)

## Testing Recommendations

1. Test provider switching via `SKIP_TRACE_PROVIDER` env variable
2. Test role-based access (dialer vs closer visibility)
3. Test skip trace locking/unlocking
4. Test buyer auto-creation from cash offers
5. Test market filtering and CSV export

