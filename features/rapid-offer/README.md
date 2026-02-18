# Rapid Offer System

The Rapid Offer System is a fully integrated feature for Elite Nexus CRM that manages the complete lead-to-contract workflow, from initial dialer intake through closer negotiation and contract execution.

## Overview

The system consists of four main modules:
- **Dialer Module**: Onshore and offshore dialer intake workflows
- **Closer Module**: Offer creation, negotiation, and contract management
- **Template Library**: Centralized script, objection, and compliance templates
- **KPI/Grading System**: Performance tracking and scorecard reporting

## Architecture

### Data Models

#### Lead Model Extensions
The `Lead` model has been extended with three new sections:

1. **`dialerIntake`**: All intake data collected by dialers
   - Property details (address, type, occupancy, condition)
   - Financial information (asking price, mortgage details)
   - Seller psychology (motivation, timeline, flexibility)
   - Red flags and confidence ratings
   - Recommended offer lane (auto-classified)
   - Compliance tracking (recording disclosure, offshore mode)

2. **`handoff`**: Workflow state between dialer and closer
   - Status tracking (none → ready_for_closer → closer_review → back_to_dialer → offer_sent → contract_sent → under_contract → dead)
   - Structured handoff summary (zero information loss)
   - Missing fields tracking
   - Timestamps and user tracking

3. **`closer`**: Closer-only fields for offer management
   - Final offer lane selection
   - Offer terms and amount
   - LOI options
   - Follow-up schedule
   - Disposition tracking

#### Template Model
Stores all scripts, objections, compliance language, and note templates:
- `key`: Unique identifier (e.g., "homeowner_intro")
- `type`: script | objection | compliance | closer_script | notes
- `roleScope`: dialer | closer | both | admin
- `content`: Template text
- `isActive`: Soft delete flag

#### KPI Models
- **KpiEvent**: Individual activity events (calls, conversations, intakes, handoffs, violations)
- **ScorecardWeekly**: Weekly rollup with 100-point scorecard breakdown

### Role-Based Access Control

#### User Roles
- `admin`: Full access to all features
- `manager`: Access to dialer, closer, and management features
- `dialer`: Access to dialer module only
- `closer`: Access to closer module only

#### Guardrails

**Dialer Restrictions:**
- Cannot set any closer fields (offerAmount, offerSent, contractSent, underContract, offerLaneFinal)
- Cannot enter offer amounts anywhere
- Intake fields are locked once sent to closer (unless closer requests info)
- Must use "unknown" for required fields if data is unavailable (no guessing)

**Closer Restrictions:**
- Can only modify closer fields
- Can request missing info from dialer (unlocks intake temporarily)

**Field Locks:**
- When lead is sent to closer: `intakeLocked = true`
- Closer can request info: `intakeLocked = false` (backflow)
- Intake remains locked during closer review unless explicitly unlocked

## API Endpoints

### Dialer Module

#### `GET /api/rapid-offer/dialer/queue?filter=...`
Get dialer queue with optional filters:
- `new`: Leads without completed intake
- `follow-up`: Leads with past-due follow-up dates
- `hot`: High motivation leads (rating ≥ 4)
- `needs-missing-data`: Leads back from closer requesting info
- `escalated`: Leads ready for closer review

**Response:** Array of leads with intake and handoff data

#### `GET /api/rapid-offer/dialer/leads/:id`
Get single lead with:
- Full lead data
- Available templates for dialer role
- Compliance banner data (recording disclosure status, offshore mode)

#### `POST /api/rapid-offer/dialer/leads/:id/intake`
Create/update intake data. Enforces:
- Intake lock check
- Dialer field restrictions (no closer fields)
- Compliance phrase checking (logs violations)
- Offshore mode validation (script-only, no free-form pitch)
- Auto-classification of offer lane
- Auto-completion timestamp when all required fields present

**Request Body:**
```json
{
  "propertyAddress": "123 Main St",
  "occupancyType": "owner",
  "conditionTier": "medium",
  "askingPrice": 150000,
  "mortgageFreeAndClear": "no",
  "mortgageBalance": 120000,
  "mortgageMonthlyPayment": 800,
  "mortgageCurrent": "yes",
  "motivationRating": 4,
  "timelineToClose": "30-60 days",
  "sellerReason": "Relocating for job",
  "sellerFlexibility": "both",
  "redFlags": ["Property needs major repairs"],
  "dialerConfidence": 4,
  "recordingDisclosureGiven": true,
  "offshoreModeUsed": false
}
```

#### `POST /api/rapid-offer/dialer/leads/:id/send-to-closer`
Send lead to closer with handoff summary. Requires:
- Completed intake OR `escalate: "high_priority"` flag
- Generates structured handoff summary
- Locks intake (`intakeLocked = true`)
- Creates KPI event

**Request Body (optional):**
```json
{
  "escalate": "high_priority"  // Use if intake incomplete
}
```

### Closer Module

#### `GET /api/rapid-offer/closer/queue?filter=...`
Get closer queue:
- `new`: Leads in closer_review status
- `offer-sent`: Leads with offer sent
- `contract-sent`: Leads with contract sent
- Default: All active closer leads

#### `GET /api/rapid-offer/closer/leads/:id`
Get lead with all data for closer review, including available closer templates.

#### `POST /api/rapid-offer/closer/leads/:id/request-info`
Request missing information from dialer (backflow):
- Sets status to `back_to_dialer`
- Unlocks intake
- Creates follow-up event

**Request Body:**
```json
{
  "requestedFields": ["mortgageBalance", "sellerReason"],
  "note": "Need exact mortgage balance and seller motivation details"
}
```

#### `POST /api/rapid-offer/closer/leads/:id/offer`
Set offer details (closer only):

**Request Body:**
```json
{
  "offerLaneFinal": "subto",
  "offerTermsSummary": "Subject-to existing mortgage, $10k down, $500/month",
  "offerAmount": 140000,
  "loiOptions": ["Option A: Cash close", "Option B: Seller finance"],
  "followupSchedule": "Call in 48 hours",
  "disposition": "negotiating"
}
```

#### `POST /api/rapid-offer/closer/leads/:id/mark-offer-sent`
Mark offer as sent, updates status and creates KPI event.

#### `POST /api/rapid-offer/closer/leads/:id/mark-contract-sent`
Mark contract as sent.

#### `POST /api/rapid-offer/closer/leads/:id/mark-under-contract`
Mark lead as under contract, updates both handoff status and lead status.

### Template Library

#### `GET /api/templates?roleScope=dialer&type=script&isActive=true`
Get templates with optional filters.

#### `GET /api/templates/:id`
Get single template.

#### `POST /api/templates`
Create template (admin/manager only).

**Request Body:**
```json
{
  "key": "custom_script",
  "type": "script",
  "roleScope": "dialer",
  "title": "Custom Script",
  "content": "Script content here...",
  "tags": ["custom", "script"]
}
```

#### `PUT /api/templates/:id`
Update template (admin/manager only).

#### `DELETE /api/templates/:id?hardDelete=true`
Delete template:
- Default: Soft delete (`isActive = false`)
- `hardDelete=true`: Hard delete (admin only)

### KPI/Reporting

#### `GET /api/rapid-offer/kpi/dialer/weekly?weekStart=YYYY-MM-DD&userId=...`
Get weekly scorecard for dialer:
- Calculates 100-point scorecard:
  - Intake Accuracy (30 points)
  - Call Control (20 points)
  - Script Adherence (20 points)
  - Compliance (20 points)
  - Professionalism (10 points)
- Certification status: `certified` | `conditional` | `retraining_required`
- Activity metrics (calls, conversations, intakes, handoffs, violations)

#### `GET /api/rapid-offer/kpi/offshore/weekly?weekStart=YYYY-MM-DD&userId=...`
Get offshore-specific weekly metrics.

#### `GET /api/rapid-offer/kpi/closer/pipeline`
Get closer pipeline summary:
- Counts by status (in review, offer sent, contract sent, under contract)
- Total pipeline value

#### `PUT /api/rapid-offer/kpi/scorecard/:id`
Manager override for scorecard (manager/admin only).

## Handoff Workflow

### Zero Information Loss

When a dialer sends a lead to closer, the system generates a structured handoff summary that includes:

1. **Property Snapshot**: Address, type, occupancy, condition, beds/baths/sqft
2. **Financial Snapshot**: Asking price, mortgage details, payment status
3. **Seller Psychology**: Motivation rating, timeline, reason, flexibility
4. **Dialer Recommendation**: Recommended offer lane and confidence level
5. **Red Flags**: Any concerns or issues identified
6. **Missing Fields**: Explicit list of required fields not yet collected
7. **Additional Notes**: Any other notes from the lead record

This summary is stored in `handoff.handoffSummary` and ensures the closer has complete context.

### Backflow Process

If the closer needs additional information:
1. Closer calls `POST /api/rapid-offer/closer/leads/:id/request-info`
2. System sets `handoff.status = 'back_to_dialer'`
3. System unlocks intake (`intakeLocked = false`)
4. System creates follow-up event for dialer
5. Lead appears in dialer's "needs-missing-data" queue

## Offer Lane Classifier

The system automatically classifies the recommended offer lane based on intake data:

**Rules:**
- **Free & Clear** → Seller Finance
- **Low Equity (<20%)** → Sub-To
- **Wants Retail / Not Flexible** → Novation
- **High Motivation + Distressed** → Cash
- **Rental-Ready + Open to Terms** → Lease Option
- **Default** → Sub-To (if mortgage exists and current)

The classifier is in `utils/offerLaneClassifier.js` and runs automatically when intake data is updated.

## Compliance Enforcement

### Recording Disclosure
- Tracked in `dialerIntake.recordingDisclosureGiven`
- Must be set to `true` before completing intake
- Compliance banner shown in dialer UI

### Prohibited Phrases
The system checks for prohibited phrases in notes:
- "guarantee", "guaranteed"
- "definitely"
- "final offer"
- "promise", "promised"
- "assure", "assured"
- "certain", "certainly"

**Behavior:**
- Violations are logged as KPI events (`compliance_violation`)
- Compliance score reduced by 5 points per violation
- Notes are not rejected, but violations are tracked

### Offshore Mode
When `offshoreModeUsed = true`:
- API enforces script selection only
- Rejects free-form `pitchText` if attempted
- Ensures compliance banner is always shown

## Template Admin

Templates are stored in MongoDB and can be managed via API:

1. **Seed Initial Templates**: Run `node jobs/seedTemplates.js`
2. **View Templates**: `GET /api/templates`
3. **Create/Edit**: Use POST/PUT endpoints (admin/manager only)
4. **Disable**: DELETE endpoint (soft delete by default)

### Template Categories

**Scripts:**
- `homeowner_intro`: Introduction for homeowners
- `investor_intro_blunt`: Direct approach for investors
- `condition_questions`: Property condition questions
- `price_questions`: Financial questions
- `motivation_questions`: Seller motivation questions
- `call_close_next_steps`: Call closing script

**Objections:**
- `offer_too_low`: Response to low offer objection
- `need_to_think`: Response to "need to think"
- `talking_to_other_buyers`: Response to competition
- `not_interested`: Exit script

**Compliance:**
- `recording_disclosure`: Recording disclosure script
- `safe_language_examples`: Safe language guidelines
- `opt_out_language`: TCPA opt-out language

**Closer Scripts:**
- `negotiation_responses`: Common negotiation scenarios
- `followup_scripts`: Follow-up templates
- `loi_framing_script`: LOI delivery script

**Notes Templates:**
- `initial_call_notes`: Template for initial call notes
- `followup_notes`: Template for follow-up notes
- `escalation_notes`: Template for escalation notes

## KPI Scorecard System

### 100-Point Breakdown

1. **Intake Accuracy (30 points)**
   - Based on intake completion rate
   - Formula: `(intakesCompleted / conversations) * 30`

2. **Call Control (20 points)**
   - Based on conversation-to-call ratio
   - Formula: `(conversations / callsMade) * 20`

3. **Script Adherence (20 points)**
   - Base score: 15 points
   - Can be enhanced with template usage tracking

4. **Compliance (20 points)**
   - Start at 20, deduct 5 per violation
   - Formula: `20 - (violations * 5)`

5. **Professionalism (10 points)**
   - Default: 8 points
   - Can be overridden by manager

### Certification Status

- **Certified**: Score ≥ 85
- **Conditional**: Score 60-84
- **Retraining Required**: Score < 60

### Weekly Scorecards

Scorecards are computed on-demand and cached in `ScorecardWeekly` model. Managers can override scores and add notes.

## Setup Instructions

### 1. Database Migration
The Lead and User models have been extended. Existing leads will have empty Rapid Offer fields (safe).

### 2. Seed Templates
```bash
node jobs/seedTemplates.js
```

### 3. Set User Roles
Update existing users to have appropriate roles:
```javascript
// In MongoDB or via API
db.users.updateMany({}, { $set: { role: 'dialer' } })
```

### 4. Test Endpoints
All endpoints require authentication. Use JWT token from `/api/auth/login`.

## Testing

Basic test scenarios to verify:

1. **Dialer cannot set offerAmount**: Try POST to intake with `offerAmount` → should reject
2. **Closer can set offerAmount**: POST to closer offer endpoint → should succeed
3. **Handoff summary includes required sections**: Send to closer → check summary structure
4. **Classifier outputs expected lane**: Test with sample intakes → verify lane suggestions

## Future Enhancements

- PDF/LOI generation integration (if PDF generator exists)
- Automated follow-up scheduling
- Advanced template versioning
- Real-time compliance monitoring dashboard
- Integration with call recording systems

## Implementation Summary

### New/Modified Files

#### Models
- `models/Lead.js` - Extended with `dialerIntake`, `handoff`, and `closer` nested objects
- `models/Template.js` - Stores script, objection, compliance, and note templates
- `models/KpiEvent.js` - Logs activity events for KPI tracking
- `models/ScorecardWeekly.js` - Weekly scorecard rollups
- `models/user.js` - Added `role` field (admin|dialer|closer|manager)

#### Controllers
- `controllers/rapidOfferDialerController.js` - Dialer intake and handoff workflows
- `controllers/rapidOfferCloserController.js` - Closer offer and contract management
- `controllers/kpiController.js` - KPI reporting and event logging (added `logEvent`)
- `controllers/templateController.js` - Template CRUD operations

#### Routes
- `routes/rapidOfferDialerRoutes.js` - Dialer endpoints
- `routes/rapidOfferCloserRoutes.js` - Closer endpoints
- `routes/kpiRoutes.js` - KPI endpoints (added POST /event)
- `routes/templateRoutes.js` - Template management endpoints

#### Utilities
- `utils/offerLaneClassifier.js` - Automatic offer lane classification
- `utils/handoffGenerator.js` - Generates structured handoff summaries
- `utils/complianceChecker.js` - Prohibited phrase detection

#### Jobs/Scripts
- `jobs/seedTemplates.js` - Seed script for initial template content

#### Tests
- `__tests__/rapidOffer.test.js` - Minimal test suite for utilities

### Running the Seed Script

```bash
# Ensure MongoDB is running and MONGODB_URI is set in .env
node jobs/seedTemplates.js
```

The script will:
- Connect to the database
- Insert templates if they don't exist (by key)
- Update existing templates if they already exist
- Output: "[SEED] Complete: X created, Y updated"

### Example API Calls

#### 1. Dialer: Complete Intake

```bash
# Get JWT token first via /api/auth/login
TOKEN="your-jwt-token"

# POST intake data
curl -X POST http://localhost:8080/api/rapid-offer/dialer/leads/LEAD_ID/intake \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyAddress": "123 Main St",
    "occupancyType": "owner",
    "conditionTier": "medium",
    "askingPrice": 150000,
    "mortgageFreeAndClear": "no",
    "mortgageBalance": 120000,
    "mortgageMonthlyPayment": 800,
    "mortgageCurrent": "yes",
    "motivationRating": 4,
    "timelineToClose": "30-60 days",
    "sellerReason": "Relocating for job",
    "sellerFlexibility": "both",
    "redFlags": [],
    "dialerConfidence": 4,
    "recordingDisclosureGiven": true,
    "offshoreModeUsed": false
  }'
```

#### 2. Dialer: Send to Closer

```bash
curl -X POST http://localhost:8080/api/rapid-offer/dialer/leads/LEAD_ID/send-to-closer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

Response includes:
- Updated lead with locked intake
- Generated handoff summary (structured text)
- Missing fields array

#### 3. Closer: Set Offer

```bash
curl -X POST http://localhost:8080/api/rapid-offer/closer/leads/LEAD_ID/offer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerLaneFinal": "subto",
    "offerTermsSummary": "Subject-to existing mortgage, $10k down, $500/month",
    "offerAmount": 140000,
    "loiOptions": ["Option A: Cash close", "Option B: Seller finance"],
    "followupSchedule": "Call in 48 hours",
    "disposition": "negotiating"
  }'
```

#### 4. Closer: Mark Offer Sent

```bash
curl -X POST http://localhost:8080/api/rapid-offer/closer/leads/LEAD_ID/mark-offer-sent \
  -H "Authorization: Bearer $TOKEN"
```

#### 5. Log KPI Event

```bash
curl -X POST http://localhost:8080/api/rapid-offer/kpi/event \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "call_made",
    "leadId": "LEAD_ID",
    "metadata": {}
  }'
```

### Key Features Verified

✅ Dialer cannot set `offerAmount` or closer fields  
✅ Closer can set offer amount and terms  
✅ Handoff summary includes all required sections  
✅ Offer lane classifier returns expected lanes  
✅ Intake locking prevents dialer edits after handoff  
✅ Backflow unlocks intake when closer requests info  
✅ Compliance violations are logged  
✅ Templates are editable via API  

### Notes

- All endpoints require authentication (JWT token)
- Role-based access control enforced via middleware
- Templates are stored in MongoDB (no redeploy needed to change)
- Offshore mode placeholder: UI enforcement comes later
- Tests run with `npm test` (Jest framework)

## Support

For questions or issues, refer to the main Elite Nexus documentation or contact the development team.
