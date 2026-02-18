# Multi-Buyer Matching + Controlled Deal Blast System - Implementation Summary

## Overview

The Elite Nexus CRM has been extended with a comprehensive Multi-Buyer Matching + Controlled Deal Blast system that automatically matches buyers to deals and provides a controlled workflow for sending deal information to qualified buyers.

## ✅ Implementation Complete

### A) DATA MODELS

#### 1. Extended Buyer Model (`models/Buyer.js`)
**New Fields:**
- `preferredMarkets`: [marketKey] - e.g. TX-DFW, TX-HOUSTON
- `preferredCounties`: [string]
- `preferredCities`: [string]
- `propertyTypes`: Extended enum to include SFR, MF, LAND, COMMERCIAL (in addition to existing sfh, mf, land, commercial)
- `minBeds`, `minBaths`, `minSqft`, `minYearBuilt`: Number thresholds
- `maxRehabLevel`: enum('light', 'medium', 'heavy')
- `maxBuyPrice`: Number
- `minArv`: Number
- `strategies`: [enum('flip', 'rental', 'wholesale', 'novation', 'subto', 'sellerfinance')]
- `proofOfFundsOnFile`: Boolean
- `contactPreferences`: { sms: bool, email: bool }
- `optOut`: { sms: bool, email: bool, updatedAt: Date }
- `cooldownHours`: Number (default: 72)
- `lastBlastAt`: Date
- `engagementScore`: Number (0-100, default: 0)

**New Indexes:**
- `preferredMarkets + propertyTypes`
- `optOut.sms + optOut.email`
- `lastBlastAt`
- `engagementScore` (descending)

#### 2. DealBlast Model (`models/DealBlast.js`)
**Fields:**
- `leadId`: ObjectId (ref: Lead)
- `marketKey`: String
- `gradeAtBlast`: enum('A', 'B', 'C', 'D', 'Dead')
- `createdBy`: ObjectId (ref: User)
- `channel`: enum('internal', 'sms', 'email')
- `status`: enum('draft', 'sent', 'canceled')
- `messageTemplateKey`: String
- `sentAt`: Date
- `stats`: { recipients, delivered, failed, replies, interested, notInterested }

#### 3. DealBlastRecipient Model (`models/DealBlastRecipient.js`)
**Fields:**
- `dealBlastId`: ObjectId (ref: DealBlast)
- `buyerId`: ObjectId (ref: Buyer)
- `channel`: enum('internal', 'sms', 'email')
- `status`: enum('queued', 'sent', 'delivered', 'failed', 'replied', 'interested', 'not_interested', 'opted_out')
- `sentAt`: Date
- `respondedAt`: Date
- `responseText`: String
- `tracking`: { messageId, provider }
- `reasonExcluded`: String (nullable)
- `metadata`: Mixed (for storing internal messages)

### B) BUYER MATCHING ENGINE

**File:** `services/buyerMatchingService.js`

**Function:** `matchBuyersForLead(lead, options) => rankedBuyers[]`

**Matching Rules:**
1. **Market match (required)**: `lead.marketKey` in `buyer.preferredMarkets` (or legacy `buyer.markets`)
2. **Property type match**: Lead property type must match buyer preferences
3. **Beds/baths/sqft/year built thresholds**: Lead values must meet buyer minimums
4. **Rehab tolerance match**: Based on lead condition tier vs buyer `maxRehabLevel`
5. **Price fit**: `askingPrice <= buyer.maxBuyPrice`
6. **ARV fit**: `arv >= buyer.minArv`
7. **Exclusion filters**: Major fire/extreme structural damage → exclude unless buyer allows heavy rehab
8. **Cooldown**: Exclude buyers blasted within `buyer.cooldownHours` (default 72h)
9. **Opt-out**: Exclude if `buyer.optOut` for channel

**Ranking Weights:**
- Base score: 50
- Market + county/city exact match: +10 each
- Historical `engagementScore`: up to +20 points
- Proof of funds on file: +5
- Recent purchase date (<90 days: +5, <180 days: +3)

**Returns:** `[{ buyer, score, reasons[], excluded: false }]`

### C) DEAL PACKAGE GENERATION

**File:** `utils/dealPackageFormatter.js`

**Functions:**
- `formatDealPackage(lead, options)` - Returns structured deal object
- `formatDealPackageAsText(lead, options)` - Returns SMS/text format
- `formatDealPackageAsHTML(lead, options)` - Returns email HTML format

**Features:**
- Supports "redacted" (masked street number) and "full" versions
- Includes: address, property details, pricing, scoring, buy box info, strategy lane, access info, disclaimer
- Target price guidance (closer-only, never exposed to buyers)

### D) CONTROLLED BLAST WORKFLOW

**File:** `controllers/dealBlastController.js`  
**Routes:** `routes/dealBlastRoutes.js`

#### Endpoints:

1. **GET /api/deal-blasts/leads/:leadId/matches?channel=sms|email|internal**
   - Roles: manager|admin|closer
   - Returns top ranked buyers + exclusion reasons
   - Shows available providers

2. **POST /api/deal-blasts**
   - Body: `{ leadId, channel, messageTemplateKey, maxRecipients }`
   - Roles: manager|admin|closer
   - Creates DealBlast as draft
   - Populates recipients list (queued) from matching engine

3. **POST /api/deal-blasts/:id/send**
   - Roles: manager|admin|closer
   - **Guardrails:**
     - Only allow send if `lead.routing.route != 'archive'`
     - Rate limit sends (global + per user, configurable via `MAX_BLASTS_PER_HOUR`)
     - Enforce `maxRecipients` default (25, max 100)
     - Respect opt-out & cooldown
     - Set `sentAt`, `status='sent'`

4. **POST /api/deal-blasts/:id/cancel**
   - Roles: manager|admin
   - Only if draft or queued, not after sent

5. **POST /api/deal-blasts/:id/response**
   - Body: `{ recipientId, responseText, status: 'interested'|'not_interested'|'replied' }`
   - Used by internal UI or future SMS/email provider webhooks
   - Updates DealBlastRecipient status and responseText
   - If buyer replies "STOP", marks `optOut.sms=true` or `optOut.email=true`

6. **GET /api/deal-blasts** - List blasts (with filtering)
7. **GET /api/deal-blasts/:id** - Get single blast with recipients

### E) CHANNEL PROVIDER INTERFACE

**Directory:** `services/outboundProviders/`

**Files:**
- `baseOutboundProvider.js` - Base class with `send({to, message}) => {messageId}`
- `internalProvider.js` - Writes notifications into DB (always available)
- `smsProvider.js` - Wraps existing Twilio util (if configured)
- `emailProvider.js` - Stub implementation (ready for SendGrid/AWS SES/etc.)
- `index.js` - Provider factory

**Features:**
- Provider-agnostic design
- Automatic fallback to internal if provider not configured
- Validation of recipient addresses
- Error handling and logging

### F) TEMPLATES

**File:** `models/Template.js`

**Extended Types:**
- `buyer_blast_sms`
- `buyer_blast_email`
- `buyer_blast_internal`

**Template Keys (examples):**
- `both_buyer_blast_sms_default`
- `both_buyer_blast_email_default`
- `both_buyer_blast_internal_default`

**Template Variables:**
- `{{dealPackage}}` - Full deal text
- `{{dealPackageHTML}}` - Full deal HTML
- `{{leadId}}` - Lead ID
- `{{address}}` - Property address

Templates follow existing versioning + approval workflow: `draft → approved → active`

### G) UI ENDPOINTS

#### Closer Workspace (`controllers/rapidOfferCloserController.js`):

1. **GET /api/rapid-offer/closer/leads/:id/buyer-matches?channel=internal|sms|email**
   - Preview buyer matches for a lead
   - Returns ranked list with score + reasons
   - Shows recent blasts for the lead

2. **GET /api/rapid-offer/closer/leads/:id/blasts**
   - Get all deal blasts for a lead
   - Includes recipient counts and response counts

#### Buyer Management (`controllers/buyerController.js`):

**Enhanced GET /api/buyers** with new filters:
- `maxBuyPrice` - Filter by maximum buy price
- `minArv` - Filter by minimum ARV
- `strategy` - Filter by strategy (flip, rental, etc.)
- `hasOptOut` - Filter by opt-out status (true/false)
- `engagementScoreMin` - Filter by minimum engagement score
- Results sorted by `engagementScore` (descending), then `lastPurchaseDate`

### H) SAFETY & COMPLIANCE

**Guardrails Implemented:**
- ✅ No misleading statements (disclaimer included in all messages)
- ✅ Respect opt-out keywords (STOP, UNSUBSCRIBE, OPT OUT, REMOVE)
- ✅ Cooldown enforcement (default 72 hours, configurable per buyer)
- ✅ Rate limiting (configurable via `MAX_BLASTS_PER_HOUR` env var, default: 10)
- ✅ Log every send with `userId + leadId` (via `createdBy` field)
- ✅ Do not expose sensitive skip trace fields (SSN/DOB) - never included
- ✅ Archive route protection - cannot blast archived leads
- ✅ Template approval required - only active templates can be used

## 📋 API Examples

### 1. Preview Matches
```bash
GET /api/deal-blasts/leads/:leadId/matches?channel=sms
Authorization: Bearer <token>
```

**Response:**
```json
{
  "leadId": "...",
  "marketKey": "TX-DFW",
  "grade": "A",
  "channel": "sms",
  "matched": [
    {
      "buyerId": "...",
      "buyerName": "John Buyer",
      "score": 85,
      "reasons": ["Market match: TX-DFW", "Property type match: SFR", "Price fit: $150000 <= $200000"],
      "preferences": { ... }
    }
  ],
  "excluded": [
    {
      "buyerId": "...",
      "buyerName": "Jane Buyer",
      "exclusionReason": "Buyer on cooldown (last blast 12h ago)"
    }
  ],
  "summary": {
    "totalMatched": 15,
    "totalExcluded": 5,
    "availableProviders": { "internal": true, "sms": true, "email": false }
  }
}
```

### 2. Create Blast Draft
```bash
POST /api/deal-blasts
Authorization: Bearer <token>
Content-Type: application/json

{
  "leadId": "...",
  "channel": "sms",
  "messageTemplateKey": "both_buyer_blast_sms_default",
  "maxRecipients": 25
}
```

**Response:**
```json
{
  "blast": {
    "_id": "...",
    "leadId": "...",
    "channel": "sms",
    "status": "draft",
    "stats": { "recipients": 15 }
  },
  "recipients": [...],
  "summary": {
    "totalRecipients": 15,
    "marketKey": "TX-DFW",
    "grade": "A"
  }
}
```

### 3. Send Blast
```bash
POST /api/deal-blasts/:id/send
Authorization: Bearer <token>
```

**Response:**
```json
{
  "blast": {
    "_id": "...",
    "status": "sent",
    "sentAt": "2024-01-15T10:30:00Z",
    "stats": {
      "recipients": 15,
      "delivered": 14,
      "failed": 1,
      "replies": 0,
      "interested": 0,
      "notInterested": 0
    }
  },
  "summary": {
    "totalRecipients": 15,
    "sent": 14,
    "failed": 1
  }
}
```

### 4. Record Response
```bash
POST /api/deal-blasts/:id/response
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipientId": "...",
  "responseText": "I'm interested!",
  "status": "interested"
}
```

## 📁 Files Created/Modified

### New Files:
1. `models/DealBlast.js`
2. `models/DealBlastRecipient.js`
3. `services/buyerMatchingService.js`
4. `utils/dealPackageFormatter.js`
5. `services/outboundProviders/baseOutboundProvider.js`
6. `services/outboundProviders/internalProvider.js`
7. `services/outboundProviders/smsProvider.js`
8. `services/outboundProviders/emailProvider.js`
9. `services/outboundProviders/index.js`
10. `controllers/dealBlastController.js`
11. `routes/dealBlastRoutes.js`

### Modified Files:
1. `models/Buyer.js` - Extended with preferences, opt-out, cooldown, engagement
2. `models/Template.js` - Added buyer_blast template types
3. `controllers/rapidOfferCloserController.js` - Added buyer matching endpoints
4. `controllers/buyerController.js` - Enhanced filtering for buyer management
5. `routes/rapidOfferCloserRoutes.js` - Added new routes
6. `server.js` - Registered deal blast routes

## 🔧 Configuration

### Environment Variables:
- `MAX_BLASTS_PER_HOUR` - Rate limit for blasts per user (default: 10)
- `TWILIO_ACCOUNT_SID` - For SMS provider (optional)
- `TWILIO_AUTH_TOKEN` - For SMS provider (optional)
- `TWILIO_PHONE_NUMBER` - For SMS provider (optional)

## ✅ Confirmation Checklist

1. ✅ Buyer matching rules + ranking implemented
2. ✅ Blast workflow: preview → draft → send → track responses
3. ✅ Opt-out + cooldown + rate limiting working
4. ✅ Provider interface (no vendor lock-in)
5. ✅ Template system extended
6. ✅ Safety & compliance guardrails
7. ✅ API endpoints documented
8. ✅ Integration with existing lead scoring, routing, buy boxes

## 🚀 Next Steps (Future Enhancements)

1. Implement email provider (SendGrid, AWS SES, Mailgun)
2. Add webhook support for SMS/email provider callbacks
3. Build engagement score calculation based on historical responses
4. Add analytics dashboard for blast performance
5. Implement A/B testing for message templates
6. Add buyer feedback loop to improve matching algorithm

