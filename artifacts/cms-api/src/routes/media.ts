import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { MediaAsset, Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap, userCan } from '../lib/auth.ts';
import { HttpError, badRequest, forbidden, notFound, parse } from '../lib/http.ts';
import { findUsage, removeStoredFiles, replaceReferences, storeUpload, urlsOf, type Variant } from '../lib/media.ts';
import { getSetting } from '../lib/settings.ts';
import { optionalText, pageArgs, paged, pagingSchema } from '../lib/paging.ts';
import { limiter } from '../lib/rate.ts';
import { storage } from '../lib/storage.ts';

export const mediaRouter = Router();
mediaRouter.use(requireCap('media.upload'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 20 },
});

function describe(asset: MediaAsset & { uploadedBy?: { name: string } | null }) {
  return {
    id: asset.id,
    filename: asset.filename,
    url: asset.url,
    driver: asset.driver,
    mimeType: asset.mimeType,
    kind: asset.kind,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    title: asset.title,
    alt: asset.alt,
    caption: asset.caption,
    description: asset.description,
    variants: ((asset.variants as Variant[] | null) ?? []).map(({ width, url, sizeBytes }) => ({ width, url, sizeBytes })),
    uploadedBy: asset.uploadedBy?.name ?? null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    // Files bundled with the site build can be described and reused, but
    // their bytes are not stored by the CMS.
    builtIn: asset.driver === 'static',
  };
}

// Authors manage their own uploads; Editors and above manage everything.
function assertCanManage(req: Request, asset: MediaAsset) {
  if (userCan(req, 'media.manageAll')) return;
  if (asset.uploadedById !== req.user!.id) throw forbidden('You can only change files you uploaded.');
}

const include = { uploadedBy: { select: { name: true } } } as const;

mediaRouter.get('/', async (req, res) => {
  const query = parse(
    pagingSchema.extend({
      pageSize: z.coerce.number().int().min(1).max(200).default(48),
      q: optionalText,
      kind: z.enum(['image', 'video', 'document']).optional(),
    }),
    req.query,
  );
  const where: Prisma.MediaAssetWhereInput = {
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.q
      ? { OR: [{ filename: { contains: query.q } }, { title: { contains: query.q } }, { alt: { contains: query.q } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.mediaAsset.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
    db.mediaAsset.count({ where }),
  ]);
  res.json(paged(items.map(describe), total, query));
});

// Each request may carry up to 20 files, so this is generous for real work
// while capping how fast a compromised account could fill the disk.
const uploadLimiter = limiter({
  windowMinutes: 10,
  limit: 60,
  message: 'Too many uploads in a short time. Please wait a few minutes and try again.',
});

mediaRouter.post('/', uploadLimiter, upload.array('files', 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('Choose at least one file to upload.');
  // Image SEO: when enabled, a new image's alt text is derived from its name.
  const autoAlt = (await getSetting('seo')).autoImageAlt;
  const created = [];
  const failed: { filename: string; message: string }[] = [];
  for (const file of files) {
    try {
      const stored = await storeUpload(file.buffer, file.originalname);
      const title = file.originalname.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 200);
      const asset = await db.mediaAsset.create({
        data: {
          filename: file.originalname.slice(0, 200),
          driver: storage.driver,
          ...stored,
          variants: stored.variants as unknown as Prisma.InputJsonValue,
          title,
          alt: autoAlt && stored.kind === 'image' ? title.slice(0, 500) : '',
          uploadedById: req.user!.id,
        },
        include,
      });
      created.push(describe(asset));
    } catch (error) {
      failed.push({ filename: file.originalname, message: error instanceof HttpError ? error.message : 'Could not process this file.' });
      if (!(error instanceof HttpError)) console.error('[media] upload failed:', error);
    }
  }
  if (created.length) logActivity(req, 'upload', 'media', `Uploaded ${created.length} file${created.length === 1 ? '' : 's'}`);
  res.status(created.length ? 201 : 400).json({ items: created, failed, ...(created.length ? {} : { error: { message: failed[0]?.message ?? 'Upload failed.', code: 'invalid' } }) });
});

mediaRouter.get('/:id', async (req, res) => {
  const asset = await db.mediaAsset.findUnique({ where: { id: String(req.params.id) }, include });
  if (!asset) throw notFound('File');
  res.json({ item: describe(asset), usage: await findUsage(urlsOf(asset)) });
});

mediaRouter.patch('/:id', async (req, res) => {
  const asset = await db.mediaAsset.findUnique({ where: { id: String(req.params.id) } });
  if (!asset) throw notFound('File');
  assertCanManage(req, asset);
  const input = parse(
    z.object({
      title: z.string().max(200).optional(),
      alt: z.string().max(500).optional(),
      caption: z.string().max(500).optional(),
      description: z.string().max(2000).optional(),
    }),
    req.body,
  );
  const updated = await db.mediaAsset.update({ where: { id: asset.id }, data: input, include });
  res.json({ item: describe(updated) });
});

// Upload a new file and point every page, post and setting at it.
mediaRouter.post('/:id/replace', uploadLimiter, upload.single('file'), async (req, res) => {
  const asset = await db.mediaAsset.findUnique({ where: { id: String(req.params.id) } });
  if (!asset) throw notFound('File');
  assertCanManage(req, asset);
  const file = req.file;
  if (!file) throw badRequest('Choose a file to replace it with.');

  const stored = await storeUpload(file.buffer, file.originalname);
  if (stored.kind !== asset.kind) {
    await removeStoredFiles({ driver: storage.driver, storageKey: stored.storageKey, variants: stored.variants as unknown as Prisma.JsonValue });
    throw badRequest(`Replace a ${asset.kind} with another ${asset.kind}.`);
  }

  const previous = asset;
  const updated = await db.mediaAsset.update({
    where: { id: asset.id },
    data: {
      filename: file.originalname.slice(0, 200),
      driver: storage.driver,
      ...stored,
      variants: stored.variants as unknown as Prisma.InputJsonValue,
    },
    include,
  });
  const references = await replaceReferences(previous.url, updated.url);
  // Responsive sizes are derived from the original URL on the site, so only
  // the original needs swapping; old variant files are cleaned up below.
  await removeStoredFiles(previous).catch((error: unknown) => console.warn('[media] old file not removed:', (error as Error).message));
  logActivity(req, 'replace', 'media', `Replaced "${previous.filename}" with "${updated.filename}" (${references} reference${references === 1 ? '' : 's'} updated)`, asset.id);
  res.json({ item: describe(updated), referencesUpdated: references });
});

mediaRouter.delete('/:id', async (req, res) => {
  const asset = await db.mediaAsset.findUnique({ where: { id: String(req.params.id) } });
  if (!asset) throw notFound('File');
  assertCanManage(req, asset);
  const usage = await findUsage(urlsOf(asset));
  if (usage.length) {
    throw new HttpError(
      409,
      `This file is still used in ${usage.length} place${usage.length === 1 ? '' : 's'}. Replace or remove those references first.`,
      'in_use',
      Object.fromEntries(usage.map((use, index) => [`usage.${index}`, `${use.type}: ${use.label}`])),
    );
  }
  await removeStoredFiles(asset);
  await db.mediaAsset.delete({ where: { id: asset.id } });
  logActivity(req, 'delete', 'media', `Deleted file "${asset.filename}"`, asset.id);
  res.json({ ok: true });
});
