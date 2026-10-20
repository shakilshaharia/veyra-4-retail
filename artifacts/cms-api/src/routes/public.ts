import { Router } from 'express';
import { z } from 'zod';
import { userCan } from '../lib/auth.ts';
import { getSiteBootstrap } from '../lib/content.ts';
import { assertFormOpen, saveSubmission, spamVerdict, verifyRecaptcha } from '../lib/forms.ts';
import { notFound, parse } from '../lib/http.ts';
import { getPublicResource, getPublicResources } from '../lib/posts.ts';
import { limiter } from '../lib/rate.ts';

export const publicRouter = Router();

// Short shared caching: content changes show up within a minute even through
// a CDN, and the browser revalidates rather than re-downloading.
function publicCache(seconds: number) {
  return `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`;
}

publicRouter.get('/bootstrap', async (req, res) => {
  const query = parse(
    z.object({
      path: z.string().max(300).default('/'),
      preview: z.enum(['0', '1']).optional(),
    }),
    req.query,
  );
  // Drafts are only ever shown to signed-in editors.
  const preview = query.preview === '1' && userCan(req, 'pages.edit');
  const bootstrap = await getSiteBootstrap(query.path, { preview });
  res.setHeader('Cache-Control', preview ? 'no-store' : publicCache(30));
  res.json(bootstrap);
});

// ---------------------------------------------------------------------------
// Resources (blogs, use cases, events)
// ---------------------------------------------------------------------------

// The whole published set; the site filters, sorts and paginates in the
// browser. The list is small, so this stays one cheap, cacheable response.
publicRouter.get('/resources', async (_req, res) => {
  const items = await getPublicResources();
  res.setHeader('Cache-Control', publicCache(60));
  res.json({ items });
});

publicRouter.get('/resources/:segment/:slug', async (req, res) => {
  const preview = req.query.preview === '1' && userCan(req, 'posts.editOwn');
  const resource = await getPublicResource(String(req.params.segment), String(req.params.slug), { preview });
  if (!resource) throw notFound('Resource');
  res.setHeader('Cache-Control', preview ? 'no-store' : publicCache(60));
  res.json({ resource, preview });
});

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const formLimiter = limiter({
  windowMinutes: 10,
  limit: 6,
  message: 'You have sent several messages in a short time. Please wait a few minutes and try again.',
});

const email = z.string().trim().toLowerCase().max(200).email('Enter a valid email address, like name@company.com.');
const antiSpam = {
  website: z.string().max(200).optional(),
  startedAt: z.number().int().optional(),
  recaptchaToken: z.string().max(4000).optional(),
};

publicRouter.post('/forms/demo', formLimiter, async (req, res) => {
  await assertFormOpen('DEMO');
  const input = parse(
    z.object({
      name: z.string().trim().min(1, 'Enter your full name.').max(120),
      email,
      company: z.string().trim().min(1, 'Enter your company name.').max(160),
      interest: z.string().trim().max(80).default(''),
      message: z.string().trim().max(3000).default(''),
      ...antiSpam,
    }),
    req.body,
  );
  const verdict = spamVerdict(input);
  if (verdict.silent) return void res.json({ ok: true });
  await verifyRecaptcha(input.recaptchaToken, req);
  await saveSubmission(req, 'DEMO', { name: input.name, email: input.email, company: input.company, data: { interest: input.interest, message: input.message } }, verdict);
  res.status(201).json({ ok: true });
});

publicRouter.post('/forms/contact', formLimiter, async (req, res) => {
  await assertFormOpen('CONTACT');
  const input = parse(
    z.object({
      fullName: z.string().trim().min(1, 'Enter your full name.').max(120),
      email,
      company: z.string().trim().max(160).default(''),
      inquiryType: z.string().trim().min(1, 'Choose an inquiry type.').max(80),
      solution: z.string().trim().max(80).default(''),
      message: z.string().trim().min(1, 'Tell us a little about what you need.').max(5000, 'Keep the message under 5,000 characters.'),
      ...antiSpam,
    }),
    req.body,
  );
  const verdict = spamVerdict(input);
  if (verdict.silent) return void res.json({ ok: true });
  await verifyRecaptcha(input.recaptchaToken, req);
  await saveSubmission(
    req,
    'CONTACT',
    { name: input.fullName, email: input.email, company: input.company, data: { inquiryType: input.inquiryType, solution: input.solution, message: input.message } },
    verdict,
  );
  res.status(201).json({ ok: true });
});
