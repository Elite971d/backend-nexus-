// src/validators/deals.js — Zod schemas for deal and note payloads
const { z } = require('zod');
const { DEAL_SOURCE, DEAL_STATUS, DEAL_PRIORITY } = require('../../models/Deal');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

const propertySchema = z.object({
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().length(2).optional(),
  zip: z.string().trim().max(20).optional(),
  county: z.string().trim().max(100).optional()
}).strict();

const numbersSchema = z.object({
  askingPrice: z.number().min(0).optional(),
  arv: z.number().min(0).optional(),
  rehabEstimate: z.number().min(0).optional()
}).strict();

/** Create deal: required source; status/priority/assignment optional with defaults */
const createDealSchema = z.object({
  source: z.enum(DEAL_SOURCE),
  status: z.enum(DEAL_STATUS).optional().default('new'),
  assignedTo: objectId.nullable().optional(),
  priority: z.enum(DEAL_PRIORITY).optional().default('normal'),
  senderName: z.string().trim().max(200).optional(),
  senderEmail: z.string().email().max(200).optional().or(z.literal('')),
  subject: z.string().trim().max(500).optional(),
  bodySnippet: z.string().optional(),
  property: propertySchema.optional(),
  numbers: numbersSchema.optional()
}).strict();

/** PATCH: only these fields are allowed for update (no createdBy, tenantId, assignedTo via PATCH) */
const allowedUpdateFields = [
  'status', 'priority', 'senderName', 'senderEmail', 'subject', 'bodySnippet',
  'property', 'numbers'
];
const updateDealSchema = z.object({
  status: z.enum(DEAL_STATUS).optional(),
  priority: z.enum(DEAL_PRIORITY).optional(),
  senderName: z.string().trim().max(200).optional(),
  senderEmail: z.string().email().max(200).optional().or(z.literal('')),
  subject: z.string().trim().max(500).optional(),
  bodySnippet: z.string().optional(),
  property: propertySchema.optional(),
  numbers: numbersSchema.optional()
}).strict();

/** Assign body: only assignedTo */
const assignDealSchema = z.object({
  assignedTo: objectId.nullable()
}).strict();

/** Add note */
const addNoteSchema = z.object({
  body: z.string().trim().min(1).max(10000)
}).strict();

/** Query params for GET /api/deals */
const listDealsQuerySchema = z.object({
  status: z.enum(DEAL_STATUS).optional(),
  assignedTo: objectId.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

/** Query params for GET /api/activity */
const listActivityQuerySchema = z.object({
  entityId: objectId.optional(),
  entityType: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

module.exports = {
  objectId,
  createDealSchema,
  updateDealSchema,
  allowedUpdateFields,
  assignDealSchema,
  addNoteSchema,
  listDealsQuerySchema,
  listActivityQuerySchema
};
