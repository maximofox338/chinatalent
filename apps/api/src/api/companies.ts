/**
 * Company routes.
 *
 *   GET   /api/companies       list companies
 *   POST  /api/companies       create a company (caller becomes owner)
 *   GET   /api/companies/:id   a single company
 *   PATCH /api/companies/:id   update a company (owner/admin members only)
 */
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, getClient, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError, sendOk } from '../utils/http';
import { parse } from '../utils/validate';
import { parsePaging } from '../utils/paging';
import {
  createCompany,
  getCompanyById,
  listCompanies,
  updateCompany,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from '../services/companyService';

const router = Router();

const uuidSchema = z.string().uuid();
const sizeEnum = z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']);

const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(80).optional(),
    website: z.string().url().max(500).optional(),
    description: z.string().max(4000).optional(),
    industry: z.string().max(120).optional(),
    size: sizeEnum.optional(),
    headquarters_country: z.string().length(2).optional(),
    logo_url: z.string().url().max(500).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    website: z.string().url().max(500).optional(),
    description: z.string().max(4000).optional(),
    industry: z.string().max(120).optional(),
    size: sizeEnum.optional(),
    headquarters_country: z.string().length(2).optional(),
    logo_url: z.string().url().max(500).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const companies = await listCompanies(getClient(req), paging);
    sendOk(res, companies);
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const input = parse(createSchema, req.body) as CreateCompanyInput;
    const company = await createCompany(getClient(req), userId, input);
    sendOk(res, company, 201);
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const company = await getCompanyById(getClient(req), id);
    if (!company) {
      throw ApiError.notFound('Company not found');
    }
    sendOk(res, company);
  }),
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const patch = parse(updateSchema, req.body) as UpdateCompanyInput;
    const company = await updateCompany(getClient(req), id, patch);
    sendOk(res, company);
  }),
);

export default router;
