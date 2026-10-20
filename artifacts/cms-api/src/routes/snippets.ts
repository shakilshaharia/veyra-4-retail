// Code snippets: managed custom HTML / CSS / JS injected into the public site.
// Everything here is gated behind settings.manage (Super Admin) because it runs
// arbitrary front-end code.

import { snippetSchema } from '@workspace/cms-content';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { badRequest, notFound, parse } from '../lib/http.ts';
import { validateCustomCode } from '../lib/sanitize.ts';

export const snippetsRouter = Router();
snippetsRouter.use(requireCap('settings.manage'));

const json = (value: unknown) => value as Prisma.InputJsonValue;

// HTML and JS can load external resources; keep that to https, like the old
// custom-code field did. CSS is static, so it is left as-is.
function validate(language: string, code: string) {
  if (language === 'html' || language === 'js') {
    const problem = validateCustomCode(code);
    if (problem) throw badRequest(problem, { code: problem });
  }
}

function describe(s: Awaited<ReturnType<typeof db.snippet.findFirstOrThrow>>) {
  return {
    ...s,
    paths: Array.isArray(s.paths) ? (s.paths as string[]) : [],
    tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
  };
}

snippetsRouter.get('/', async (_req, res) => {
  const items = await db.snippet.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] });
  res.json({ items: items.map(describe) });
});

snippetsRouter.get('/export', async (_req, res) => {
  const items = await db.snippet.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] });
  res.setHeader('Content-Disposition', `attachment; filename="snippets-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ version: 1, snippets: items.map((s) => parse(snippetSchema, describe(s))) });
});

snippetsRouter.post('/', async (req, res) => {
  const input = parse(snippetSchema, req.body);
  validate(input.language, input.code);
  const snippet = await db.snippet.create({
    data: { ...input, paths: json(input.paths), tags: json(input.tags), createdById: req.user!.id },
  });
  logActivity(req, 'create', 'snippet', `Added snippet "${snippet.name}"`, snippet.id);
  res.status(201).json({ item: describe(snippet) });
});

snippetsRouter.post('/import', async (req, res) => {
  const { snippets } = parse(z.object({ snippets: z.array(snippetSchema).max(200) }), req.body);
  let created = 0;
  for (const input of snippets) {
    validate(input.language, input.code);
    await db.snippet.create({ data: { ...input, active: false, paths: json(input.paths), tags: json(input.tags), createdById: req.user!.id } });
    created += 1;
  }
  logActivity(req, 'create', 'snippet', `Imported ${created} snippet${created === 1 ? '' : 's'}`);
  res.status(201).json({ ok: true, created });
});

snippetsRouter.get('/:id', async (req, res) => {
  const snippet = await db.snippet.findUnique({ where: { id: String(req.params.id) } });
  if (!snippet) throw notFound('Snippet');
  res.json({ item: describe(snippet) });
});

snippetsRouter.patch('/:id', async (req, res) => {
  const existing = await db.snippet.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('Snippet');
  const input = parse(snippetSchema.partial(), req.body);
  if (input.code !== undefined || input.language !== undefined) {
    validate(input.language ?? existing.language, input.code ?? existing.code);
  }
  const snippet = await db.snippet.update({
    where: { id: existing.id },
    data: { ...input, paths: input.paths ? json(input.paths) : undefined, tags: input.tags ? json(input.tags) : undefined },
  });
  logActivity(req, 'update', 'snippet', `${input.active === true ? 'Activated' : input.active === false ? 'Deactivated' : 'Edited'} snippet "${snippet.name}"`, snippet.id);
  res.json({ item: describe(snippet) });
});

snippetsRouter.post('/:id/duplicate', async (req, res) => {
  const original = await db.snippet.findUnique({ where: { id: String(req.params.id) } });
  if (!original) throw notFound('Snippet');
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original;
  const snippet = await db.snippet.create({ data: { ...rest, name: `${original.name} (copy)`, active: false, paths: json(original.paths ?? []), tags: json(original.tags ?? []), createdById: req.user!.id } });
  logActivity(req, 'create', 'snippet', `Duplicated snippet "${original.name}"`, snippet.id);
  res.status(201).json({ item: describe(snippet) });
});

snippetsRouter.delete('/:id', async (req, res) => {
  const snippet = await db.snippet.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  if (snippet) logActivity(req, 'delete', 'snippet', `Deleted snippet "${snippet.name}"`, snippet.id);
  res.json({ ok: true });
});
