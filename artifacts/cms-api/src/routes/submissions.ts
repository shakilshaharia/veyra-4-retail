import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { notFound, parse } from '../lib/http.ts';
import { optionalText, pageArgs, paged, pagingSchema } from '../lib/paging.ts';

export const submissionsRouter = Router();
submissionsRouter.use(requireCap('forms.view'));

const filterSchema = z.object({
  type: z.enum(['DEMO', 'CONTACT']).optional(),
  status: z.enum(['NEW', 'CONTACTED', 'COMPLETED', 'SPAM']).optional(),
  q: optionalText,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function whereFrom(filters: z.infer<typeof filterSchema>): Prisma.FormSubmissionWhereInput {
  return {
    ...(filters.type ? { type: filters.type } : {}),
    // Spam stays out of the default view; ask for it explicitly.
    ...(filters.status ? { status: filters.status } : { status: { not: 'SPAM' } }),
    ...(filters.q
      ? { OR: [{ name: { contains: filters.q } }, { email: { contains: filters.q } }, { company: { contains: filters.q } }] }
      : {}),
    ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
  };
}

// Spreadsheet apps execute cells that start with = + - @ as formulas. A form
// field could carry one, so neutralise it before it reaches Excel.
function csvCell(value: unknown) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

submissionsRouter.get('/export.csv', async (req, res) => {
  const filters = parse(filterSchema, req.query);
  const items = await db.formSubmission.findMany({ where: whereFrom(filters), orderBy: { createdAt: 'desc' }, take: 10_000 });
  const columns = ['Received', 'Form', 'Status', 'Name', 'Email', 'Company', 'Interest / inquiry', 'Solution', 'Message', 'Notes'];
  const rows = items.map((item) => {
    const data = item.data as Record<string, string>;
    return [
      item.createdAt.toISOString(),
      item.type === 'DEMO' ? 'Demo request' : 'Contact',
      item.status,
      item.name,
      item.email,
      item.company,
      data.interest ?? data.inquiryType ?? '',
      data.solution ?? '',
      data.message ?? '',
      item.notes,
    ].map(csvCell).join(',');
  });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="veyra-submissions-${stamp}.csv"`);
  // A BOM so Excel opens UTF-8 (names with accents, the em dash) correctly.
  res.send(`﻿${[columns.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`);
  logActivity(req, 'export', 'submission', `Exported ${items.length} submission${items.length === 1 ? '' : 's'} to CSV`);
});

submissionsRouter.get('/', async (req, res) => {
  const query = parse(pagingSchema.merge(filterSchema), req.query);
  const where = whereFrom(query);
  const [items, total, counts] = await Promise.all([
    db.formSubmission.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
    db.formSubmission.count({ where }),
    db.formSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({
    ...paged(items, total, query),
    statusCounts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
  });
});

submissionsRouter.get('/:id', async (req, res) => {
  const item = await db.formSubmission.findUnique({ where: { id: String(req.params.id) } });
  if (!item) throw notFound('Submission');
  res.json({ item });
});

submissionsRouter.patch('/:id', requireCap('forms.manage'), async (req, res) => {
  const input = parse(
    z.object({ status: z.enum(['NEW', 'CONTACTED', 'COMPLETED', 'SPAM']).optional(), notes: z.string().max(4000).optional() }),
    req.body,
  );
  const item = await db.formSubmission.update({ where: { id: String(req.params.id) }, data: input });
  if (input.status) logActivity(req, 'update', 'submission', `Marked ${item.name}'s ${item.type === 'DEMO' ? 'demo request' : 'message'} as ${input.status.toLowerCase()}`, item.id);
  res.json({ item });
});

submissionsRouter.delete('/:id', requireCap('forms.manage'), async (req, res) => {
  const item = await db.formSubmission.delete({ where: { id: String(req.params.id) } });
  logActivity(req, 'delete', 'submission', `Deleted a submission from ${item.name}`, item.id);
  res.json({ ok: true });
});
