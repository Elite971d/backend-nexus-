# Lead Scoring Engine Implementation Summary

## Overview
The Lead Scoring Engine has been successfully integrated into the Elite Nexus CRM / Rapid Offer System. This system scores seller leads based on market-specific Buy Boxes, starting with the DFW Quick Flip Buy Box.

## Components Implemented

### 1. Buy Box Data Model (`models/BuyBox.js`)
- **Fields:**
  - `marketKey` (string, required) - e.g. TX-DFW, CA-LA, WA-SEATTLE
  - `label` (string) - Display name
  - `propertyType` (array) - Allowed property types
  - `minBeds`, `minBaths`, `minSqft`, `minYearBuilt` - Minimum requirements
  - `conditionAllowed` (array) - Allowed condition tiers
  - `buyPriceMin`, `buyPriceMax` - Buy price range
  - `arvMin`, `arvMax` - ARV range
  - `counties` (array) - Target counties
  - `cityOverrides` (object) - City-specific price overrides
  - `exclusions` (array) - Exclusion keywords
  - `active` (boolean) - Active status

### 2. Lead Scoring Engine (`utils/leadScoringEngine.js`)
- **Scoring Logic (Weighted):**
  - Property type match: 20 points (pass/fail)
  - Beds/Baths match: 15 points
  - Sq Ft match: 10 points
  - Year built match: 10 points
  - Condition match: 15 points
  - Buy price within range: 20 points
  - ARV within range: 10 points
  - Location match (county/city): 10 points
  - Exclusion flags: -30 point penalty if found

- **Grade Thresholds:**
  - A: 85-100 (Immediate action)
  - B: 70-84
  - C: 50-69
  - D: 30-49
  - Dead: <30

### 3. Lead Model Extension (`models/Lead.js`)
- **New Field: `leadScore`**
  - `score` (0-100)
  - `grade` (A|B|C|D|Dead)
  - `buyBoxKey`, `buyBoxId`, `buyBoxLabel`
  - `evaluatedAt`
  - `reasons[]` - Positive scoring factors
  - `failedChecks[]` - Failed criteria
  - `override` - Closer override with reason and user tracking

### 4. Buy Box Management
- **Controller:** `controllers/buyBoxController.js`
- **Routes:** `routes/buyBoxRoutes.js`
- **Endpoints:**
  - `GET /api/buyboxes` - List buy boxes (filterable by marketKey, active)
  - `GET /api/buyboxes/:id` - Get single buy box
  - `POST /api/buyboxes` - Create buy box (admin/manager)
  - `PUT /api/buyboxes/:id` - Update buy box (admin/manager)
  - `POST /api/buyboxes/:id/toggle` - Toggle active status (admin/manager)

### 5. Lead Scoring Endpoints
- **Routes:** Added to `routes/crmRoutes.js`
- **Endpoints:**
  - `GET /api/leads/:id/score` - Get calculated score (on-the-fly)
  - `POST /api/leads/:id/recalculate-score` - Recalculate and save score

### 6. Dialer Integration
- **Queue Sorting:** Leads sorted by Grade (A → B → C → D → Dead), then by score, then by updatedAt
- **Score Badge:** Each lead shows score and grade badge
- **Auto-Recalculate:** Score recalculated automatically when intake is updated
- **No Override:** Dialers cannot override scores

### 7. Closer Integration
- **Score Breakdown:** Full score breakdown visible with reasons and failed checks
- **Override Capability:** Closers can override grade with reason (tracked for KPI review)
- **Endpoint:** `POST /api/rapid-offer/closer/leads/:id/override-score`

### 8. Auto-Recalculate Triggers
- **On Intake Update:** When dialer completes/updates intake
- **On Skip Trace Completion:** When skip trace data is enriched
- **Manual:** Via `/api/leads/:id/recalculate-score` endpoint

### 9. Buyer Matching Integration
- **Endpoint:** `GET /api/buyers/match/:leadId`
- **Logic:**
  - Matches buyers based on lead's Buy Box market
  - Filters by property type
  - Ranks by:
    - Market match
    - Property type match
    - Recent purchase history
    - Confidence score
    - Lead score influence
- **Returns:** Ranked list of matched buyers with match scores and reasons

### 10. KPI Tracking
- **New Event Types:**
  - `score_calculated` - Logged when score is recalculated
  - `score_override` - Logged when closer overrides grade
- **Metadata Tracked:**
  - Score, grade, previous score/grade
  - Buy box key
  - Number of reasons/failed checks
  - Override reason and user

### 11. Seed Script
- **File:** `jobs/seedBuyBoxes.js`
- **DFW Quick Flip Buy Box:**
  - Property Type: SFR
  - Beds/Baths: 3+ / 2+
  - Sq Ft: 1,000+
  - Year Built: 1960+
  - Condition: light, medium
  - Buy Range: 100k–250k
  - City Overrides: McKinney, Lewisville, Flower Mound, Plano, Denton
  - ARV Range: 180k–400k+
  - Counties: Dallas, Tarrant, Collin, Denton
  - Exclusions: major fire damage, extreme structural damage
  - Status: ACTIVE

## Multi-Market Support

The system is designed to support all 50 states:
- Multiple buy boxes per market supported
- California, Seattle, NY, NJ can be added without code changes
- Buy boxes can be toggled active/inactive
- City-level overrides supported cleanly
- Market key format: `STATE-NAME` (e.g., `TX-DFW`, `CA-LA`, `WA-SEATTLE`)

## Safety & Audit Features

- ✅ **No Auto-Rejection:** Leads are never auto-rejected purely on score
- ✅ **Manual Review Always Available:** All leads can be manually reviewed
- ✅ **Override Tracking:** All score overrides logged with user and reason
- ✅ **Transparent Rules:** Scoring rules are transparent and visible to closers
- ✅ **KPI Review:** Override frequency tracked for quality control

## API Endpoints Summary

### Admin/Manager
- `POST /api/buyboxes` - Create buy box
- `PUT /api/buyboxes/:id` - Update buy box
- `GET /api/buyboxes` - List buy boxes
- `POST /api/buyboxes/:id/toggle` - Toggle active status

### System/All Users
- `GET /api/leads/:id/score` - Get lead score
- `POST /api/leads/:id/recalculate-score` - Recalculate score
- `GET /api/buyers/match/:leadId` - Match buyers for lead

## Usage

### Seeding Buy Boxes
```bash
node jobs/seedBuyBoxes.js
```

### Scoring a Lead
```javascript
const { recalculateAndSaveLeadScore } = require('./utils/leadScoringEngine');
await recalculateAndSaveLeadScore(lead);
```

### Overriding Score (Closer)
```http
POST /api/rapid-offer/closer/leads/:id/override-score
{
  "grade": "A",
  "reason": "Seller highly motivated, willing to negotiate"
}
```

## Next Steps

1. **Run Seed Script:** Execute `node jobs/seedBuyBoxes.js` to seed DFW Buy Box
2. **Test Scoring:** Create/update a lead with intake data and verify scoring
3. **Test Buyer Matching:** Use `/api/buyers/match/:leadId` to test buyer matching
4. **Monitor KPIs:** Review score calculation and override events in KPI dashboard
5. **Expand Markets:** Add additional buy boxes for CA, WA, NY, NJ as needed

## Verification Checklist

- [x] Buy Box model created
- [x] Lead scoring engine implemented
- [x] Lead model extended with leadScore
- [x] Buy Box CRUD endpoints created
- [x] DFW Buy Box seed script created
- [x] Dialer queue sorted by grade
- [x] Closer can view score breakdown
- [x] Closer can override score
- [x] Auto-recalculate on intake update
- [x] Auto-recalculate on skip trace completion
- [x] Buyer matching endpoint created
- [x] KPI tracking added
- [x] Multi-market support designed
- [x] Safety features implemented

