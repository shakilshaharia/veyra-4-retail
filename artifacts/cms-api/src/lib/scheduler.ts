// Publishes scheduled pages and posts when their time comes, and clears out
// expired sessions. Runs inside the API process once a minute.

import { db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { invalidateContent, snapshotOf } from './content.ts';

export async function publishDue(now = new Date()) {
  let changed = 0;

  const pages = await db.page.findMany({ where: { status: 'SCHEDULED', publishAt: { lte: now } } });
  for (const page of pages) {
    await db.page.update({
      where: { id: page.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: page.publishAt ?? now,
        published: snapshotOf(page) as unknown as Prisma.InputJsonValue,
        hasChanges: false,
      },
    });
    await db.activityLog.create({
      data: { action: 'publish', entityType: 'page', entityId: page.id, summary: `Scheduled page "${page.title}" went live` },
    });
    changed += 1;
  }

  const posts = await db.post.findMany({ where: { status: 'SCHEDULED', publishAt: { lte: now } } });
  for (const post of posts) {
    await db.post.update({
      where: { id: post.id },
      data: { status: 'PUBLISHED', publishedAt: post.publishAt ?? now },
    });
    await db.activityLog.create({
      data: { action: 'publish', entityType: 'post', entityId: post.id, summary: `Scheduled post "${post.title}" went live` },
    });
    changed += 1;
  }

  if (changed) invalidateContent();
  return changed;
}

async function housekeeping(now = new Date()) {
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
}

export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const published = await publishDue();
      if (published) console.log(`[scheduler] published ${published} scheduled item(s)`);
      await housekeeping();
    } catch (error) {
      console.error('[scheduler]', (error as Error).message);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
