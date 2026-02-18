// jobs/seedTemplates.js
// Seed script for Rapid Offer templates
// Usage: node jobs/seedTemplates.js
// 
// IMPORTANT: This script will NOT overwrite existing active templates.
// It only creates new templates if no active version exists for the key.

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const connectDB = require('../config/db');
const Template = require('../models/Template');
const User = require('../models/user');

const templates = [
  // ===== DIALER SCRIPTS =====
  {
    key: 'dialer_script_homeowner_intro',
    type: 'script',
    roleScope: 'dialer',
    title: 'Homeowner Introduction Script',
    content: `Hi [Name], this is [Your Name] from Elite Solutions Network. I'm calling because we're actively looking to purchase properties in [Area] and I wanted to see if you might be interested in selling your property at [Address].

We're not real estate agents - we're direct buyers, which means we can close quickly and you won't pay any commissions or fees. Do you have a few minutes to chat?`,
    tags: ['intro', 'homeowner', 'script']
  },
  {
    key: 'dialer_script_investor_intro_blunt',
    type: 'script',
    roleScope: 'dialer',
    title: 'Investor Introduction (Blunt)',
    content: `Hey [Name], [Your Name] here from Elite Nexus. I see you have a property at [Address]. Are you looking to sell it, or are you just holding it?

If you're open to selling, we can make you a cash offer and close in 7-14 days. No agents, no fees, no hassle. What's your situation?`,
    tags: ['intro', 'investor', 'blunt', 'script']
  },
  {
    key: 'dialer_script_condition_questions',
    type: 'script',
    roleScope: 'dialer',
    title: 'Property Condition Questions',
    content: `I'd like to understand the condition of the property. Can you tell me:

1. Is the property currently occupied? (Owner, tenant, or vacant?)
2. How would you rate the overall condition? (Light fix-up, medium repairs needed, or heavy rehab?)
3. Are there any major issues I should know about? (Roof, foundation, plumbing, electrical?)
4. When was the last time you were at the property?`,
    tags: ['questions', 'condition', 'script']
  },
  {
    key: 'dialer_script_price_questions',
    type: 'script',
    roleScope: 'dialer',
    title: 'Price & Financial Questions',
    content: `Let me ask a few questions about the financials:

1. What are you hoping to get for the property? (Asking price or range?)
2. Is there a mortgage on the property? If so, what's the current balance?
3. Are the mortgage payments current?
4. Are there any liens or back taxes?`,
    tags: ['questions', 'price', 'financial', 'script']
  },
  {
    key: 'dialer_script_motivation_questions',
    type: 'script',
    roleScope: 'dialer',
    title: 'Motivation & Timeline Questions',
    content: `I want to understand your situation better:

1. What's driving your decision to sell? (Divorce, inheritance, relocation, financial hardship, etc.)
2. How quickly do you need to close? (Timeline urgency?)
3. Are you flexible on price, terms, or both?
4. Have you tried listing it before? What happened?`,
    tags: ['questions', 'motivation', 'timeline', 'script']
  },
  {
    key: 'dialer_script_call_close_next_steps',
    type: 'script',
    roleScope: 'dialer',
    title: 'Call Close & Next Steps',
    content: `Great, I have all the information I need. Here's what happens next:

1. I'll review everything with my team
2. We'll prepare an offer based on your situation
3. I'll call you back within [timeframe] with our proposal
4. If you like it, we can move forward quickly

Does that work for you? And just to confirm - what's the best number to reach you at?`,
    tags: ['close', 'next-steps', 'script']
  },
  
  // ===== DIALER OBJECTIONS =====
  {
    key: 'dialer_objection_offer_too_low',
    type: 'objection',
    roleScope: 'dialer',
    title: 'Objection: Offer Too Low',
    content: `I understand that number might be lower than you were hoping for. Let me explain why:

We're making a cash offer with no contingencies, no repairs needed, and we can close in 7-14 days. That speed and certainty has value.

Also, we're not asking you to pay commissions, closing costs, or make any repairs. When you factor all that in, our offer is actually competitive with what you'd net from a traditional sale.

Would you be open to seeing the full offer terms? Sometimes the structure matters more than just the number.`,
    tags: ['objection', 'price', 'low-offer']
  },
  {
    key: 'dialer_objection_need_to_think',
    type: 'objection',
    roleScope: 'dialer',
    title: 'Objection: Need to Think',
    content: `Absolutely, I understand this is a big decision. Take your time.

What I'd suggest is this: let me send you our offer in writing. That way you can review it on your own time, show it to anyone you want, and we can discuss it when you're ready.

There's no pressure and no obligation. Does that work?`,
    tags: ['objection', 'thinking', 'time']
  },
  {
    key: 'dialer_objection_talking_to_other_buyers',
    type: 'objection',
    roleScope: 'dialer',
    title: 'Objection: Talking to Other Buyers',
    content: `That's totally fine - I'd expect you to explore your options. Here's what makes us different:

1. We can close faster than most (7-14 days)
2. No contingencies - we buy as-is
3. Cash offer - no financing delays
4. No commissions or fees

Even if you're talking to others, having our offer gives you leverage and a backup option. Would you like to see what we can do?`,
    tags: ['objection', 'competition', 'other-buyers']
  },
  {
    key: 'dialer_objection_not_interested',
    type: 'objection',
    roleScope: 'dialer',
    title: 'Objection: Not Interested',
    content: `I completely understand. Just so you know, we're here if your situation changes. 

If you ever decide you want to sell quickly without the hassle of listing, feel free to reach out. We're always looking for properties in [Area].

Thanks for your time today.`,
    tags: ['objection', 'not-interested', 'exit']
  },
  
  // ===== DIALER COMPLIANCE =====
  {
    key: 'dialer_compliance_recording_disclosure',
    type: 'compliance',
    roleScope: 'dialer',
    title: 'Recording Disclosure',
    content: `Before we continue, I need to let you know that this call may be recorded for quality and training purposes. Is that okay with you?

[Wait for confirmation]

Thank you. Now, let's continue...`,
    tags: ['compliance', 'recording', 'disclosure']
  },
  {
    key: 'dialer_compliance_opt_out_language',
    type: 'compliance',
    roleScope: 'dialer',
    title: 'Opt-Out Language',
    content: `If you'd prefer not to receive calls from us in the future, just let me know and I'll remove you from our list immediately. We respect your preferences.`,
    tags: ['compliance', 'opt-out', 'tcpa']
  },
  
  // ===== SHARED COMPLIANCE =====
  {
    key: 'both_compliance_safe_language',
    type: 'compliance',
    roleScope: 'both',
    title: 'Safe Language Examples',
    content: `SAFE LANGUAGE:
- "We can potentially offer..."
- "Based on what you've told me, we might be able to..."
- "Our typical process is..."
- "We'll do our best to..."
- "This is what we're thinking..."

AVOID:
- "I guarantee..."
- "I promise..."
- "This is definitely..."
- "We will absolutely..."
- "Final offer..."`,
    tags: ['compliance', 'language', 'safe']
  },
  
  // ===== CLOSER SCRIPTS =====
  {
    key: 'closer_closer_script_negotiation_responses',
    type: 'closer_script',
    roleScope: 'closer',
    title: 'Negotiation Response Scripts',
    content: `COMMON NEGOTIATION SCENARIOS:

1. Seller wants more money:
"I understand. Let me see if we can adjust the terms. Would you be open to seller financing? That could increase your total return while keeping our cash offer competitive."

2. Seller wants faster close:
"We can absolutely close faster. If you can provide [documents] by [date], we can close in [X] days. What do you need from us to make that happen?"

3. Seller wants to stay in property:
"We have options for that. We could do a lease-back, or structure this as a lease-option where you stay while we handle the purchase. Would that work?"

4. Seller concerned about repairs:
"That's exactly why we buy as-is. You don't need to fix anything. We'll handle all repairs after closing. That's our problem, not yours."`,
    tags: ['closer', 'negotiation', 'script']
  },
  {
    key: 'closer_closer_script_followup',
    type: 'closer_script',
    roleScope: 'closer',
    title: 'Follow-Up Scripts',
    content: `FOLLOW-UP TEMPLATES:

Initial Follow-Up (24-48 hours after offer):
"Hi [Name], this is [Your Name] from Elite Nexus. I wanted to follow up on the offer we sent you yesterday. Did you have a chance to review it? Any questions?"

Second Follow-Up (3-5 days):
"Hi [Name], just checking in. I know you're probably weighing your options. Is there anything I can clarify about our offer or process?"

Final Follow-Up (7-10 days):
"Hi [Name], I wanted to touch base one more time. Our offer is still on the table, but we're moving forward on other properties. If you're interested, let's talk this week."`,
    tags: ['closer', 'followup', 'script']
  },
  {
    key: 'closer_closer_script_loi_framing',
    type: 'closer_script',
    roleScope: 'closer',
    title: 'LOI Framing Script',
    content: `I'm sending you a Letter of Intent (LOI) that outlines our offer. This isn't a binding contract yet - it's just our way of putting everything in writing so you can review it.

The LOI covers:
- Purchase price
- Closing timeline
- Terms and conditions
- What happens next

Once you review it and we agree on terms, we'll move to a formal purchase agreement. Does that work for you?`,
    tags: ['closer', 'loi', 'script']
  },
  
  // ===== CLOSER NEGOTIATION =====
  {
    key: 'closer_negotiation_price_anchoring',
    type: 'negotiation',
    roleScope: 'closer',
    title: 'Price Anchoring Techniques',
    content: `PRICE ANCHORING STRATEGIES:

1. Start with market context:
"Based on recent sales in your area, properties in similar condition are selling for [range]. We're offering [amount], which accounts for [repairs/condition/timeline]."

2. Frame the value:
"Our offer is [X]% of your asking price, but remember - you're getting cash, no commissions, no repairs, and a guaranteed close in [days]."

3. Create urgency:
"We have other properties we're evaluating. This offer is good for [timeframe]. After that, we'll need to reassess based on our current pipeline."`,
    tags: ['negotiation', 'price', 'anchoring']
  },
  
  // ===== CLOSER LOI =====
  {
    key: 'closer_loi_options_framing',
    type: 'loi',
    roleScope: 'closer',
    title: 'LOI Options Framing',
    content: `LOI OPTIONS TO PRESENT:

Option 1: Cash Offer - Fast Close
- Price: [Amount]
- Close: 7-14 days
- Terms: As-is, no contingencies

Option 2: Higher Price - Extended Close
- Price: [Amount + X]
- Close: 30-45 days
- Terms: Standard inspection period

Option 3: Seller Financing
- Price: [Amount]
- Terms: [Details]
- Benefits: Higher total return, tax advantages

Which option aligns best with your goals?`,
    tags: ['loi', 'options', 'framing']
  },
  
  // ===== CLOSER FOLLOWUP =====
  {
    key: 'closer_followup_structured',
    type: 'followup',
    roleScope: 'closer',
    title: 'Structured Follow-Up Template',
    content: `FOLLOW-UP STRUCTURE:

1. Acknowledge their timeline:
"I know you mentioned you need to [situation]. How is that timeline looking?"

2. Address concerns:
"Last time we talked, you had questions about [topic]. Have you had a chance to think about that?"

3. Provide value:
"I wanted to share [relevant info] that might help with your decision."

4. Clear next steps:
"What would be most helpful - another call, updated offer, or documentation?"`,
    tags: ['followup', 'structured', 'template']
  },
  
  // ===== DIALER NOTES =====
  {
    key: 'dialer_notes_initial_call',
    type: 'notes',
    roleScope: 'dialer',
    title: 'Initial Call Notes Template',
    content: `INITIAL CALL NOTES TEMPLATE:

Date: [Date]
Time: [Time]
Contact: [Name]
Phone: [Phone]
Property: [Address]

Call Summary:
- [Key points discussed]
- [Seller's situation]
- [Motivation level: 1-5]
- [Timeline urgency]

Next Steps:
- [Follow-up date/time]
- [Information needed]`,
    tags: ['notes', 'template', 'initial']
  },
  {
    key: 'dialer_notes_followup',
    type: 'notes',
    roleScope: 'dialer',
    title: 'Follow-Up Notes Template',
    content: `FOLLOW-UP NOTES TEMPLATE:

Date: [Date]
Previous Contact: [Date]

Update:
- [What changed since last call]
- [New information gathered]
- [Seller's current status]

Action Items:
- [What needs to happen next]`,
    tags: ['notes', 'template', 'followup']
  },
  {
    key: 'dialer_notes_escalation',
    type: 'notes',
    roleScope: 'dialer',
    title: 'Escalation Notes Template',
    content: `ESCALATION NOTES TEMPLATE:

Reason for Escalation: [High priority / Hot lead / Complex situation]

Key Details:
- [Why this needs closer attention]
- [Urgency factors]
- [Special circumstances]

Intake Status:
- [Completed / Partial]
- [Missing fields if any]`,
    tags: ['notes', 'template', 'escalation']
  }
];

async function seedTemplates() {
  try {
    await connectDB();
    console.log('[SEED] Connected to database');

    // Find or create a system admin user for createdBy field
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      // Try manager as fallback
      adminUser = await User.findOne({ role: 'manager' });
    }
    if (!adminUser) {
      // Create a placeholder user if none exists (for seed only)
      console.warn('[SEED] No admin/manager user found. Templates will need createdBy updated manually.');
      adminUser = { _id: null };
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const templateData of templates) {
      try {
        // Check if an active template already exists for this key
        const existingActive = await Template.findOne({
          key: templateData.key,
          status: 'active'
        });

        if (existingActive) {
          console.log(`[SEED] Skipped: ${templateData.key} (active version already exists)`);
          skipped++;
          continue;
        }

        // Create new template as version 1, status active
        const template = await Template.create({
          ...templateData,
          version: 1,
          status: 'active',
          isActive: true,
          createdBy: adminUser._id || null,
          updatedBy: adminUser._id || null,
          approvedBy: adminUser._id || null,
          approvedAt: new Date()
        });

        created++;
        console.log(`[SEED] Created: ${templateData.key} (v${template.version}, status: ${template.status})`);
      } catch (err) {
        errors++;
        console.error(`[SEED] Error creating ${templateData.key}:`, err.message);
      }
    }

    console.log(`[SEED] Complete: ${created} created, ${skipped} skipped, ${errors} errors`);
    process.exit(0);
  } catch (err) {
    console.error('[SEED] Fatal error:', err);
    process.exit(1);
  }
}

seedTemplates();
