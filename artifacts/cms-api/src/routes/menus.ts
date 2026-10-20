import { menuLocationSchema, menuLocations } from '@workspace/cms-content';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import type { MenuItem } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { badRequest, parse } from '../lib/http.ts';

export const menusRouter = Router();
menusRouter.use(requireCap('menus.manage'));

// Site paths, in-page anchors, full URLs, email and phone links.
const linkSchema = z
  .string()
  .trim()
  .min(1, 'Enter a link.')
  .max(500)
  .refine((url) => /^(\/|#|https?:\/\/|mailto:|tel:)/i.test(url), 'Start with /, #, https://, mailto: or tel:.')
  .refine((url) => !/^javascript:/i.test(url), 'Not allowed.');

type ItemInput = { label: string; url: string; newTab: boolean; enabled: boolean; children: ItemInput[] };

const childSchema = z.object({
  label: z.string().trim().min(1, 'Enter a label.').max(60),
  url: linkSchema,
  newTab: z.boolean().default(false),
  enabled: z.boolean().default(true),
  children: z.array(z.never()).max(0, 'Submenus go one level deep.').default([]),
});

const itemSchema: z.ZodType<ItemInput> = childSchema.extend({
  children: z.array(childSchema).max(12).default([]),
}) as unknown as z.ZodType<ItemInput>;

const menuSchema = z.object({
  ctaEnabled: z.boolean(),
  ctaLabel: z.string().trim().max(40),
  items: z.array(itemSchema).max(12),
});

type Tree = Omit<MenuItem, 'menuId'> & { children: Tree[] };

function tree(items: MenuItem[], parentId: string | null = null): Tree[] {
  return items
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map(({ menuId: _menuId, ...item }) => ({ ...item, children: tree(items, item.id) }));
}

menusRouter.get('/', async (_req, res) => {
  const menus = await db.menu.findMany({ include: { items: true } });
  res.json({
    items: menuLocations.map((location) => {
      const menu = menus.find((m) => m.location === location);
      return {
        location,
        ctaEnabled: menu?.ctaEnabled ?? false,
        ctaLabel: menu?.ctaLabel ?? 'Get Demo',
        items: menu ? tree(menu.items) : [],
        updatedAt: menu?.updatedAt ?? null,
      };
    }),
  });
});

// The editor sends the whole menu after every change (drag, add, toggle),
// which keeps ordering and nesting trivially consistent.
menusRouter.put('/:location', async (req, res) => {
  const location = parse(menuLocationSchema, req.params.location);
  const input = parse(menuSchema, req.body);
  if (input.ctaEnabled && !input.ctaLabel) throw badRequest('Give the button a label, or switch it off.', { ctaLabel: 'Required.' });

  const menu = await db.$transaction(async (tx) => {
    const saved = await tx.menu.upsert({
      where: { location },
      update: { ctaEnabled: input.ctaEnabled, ctaLabel: input.ctaLabel },
      create: { location, ctaEnabled: input.ctaEnabled, ctaLabel: input.ctaLabel },
    });
    await tx.menuItem.deleteMany({ where: { menuId: saved.id } });
    for (const [order, item] of input.items.entries()) {
      const parent = await tx.menuItem.create({
        data: { menuId: saved.id, label: item.label, url: item.url, external: /^https?:\/\//i.test(item.url), newTab: item.newTab, enabled: item.enabled, order },
      });
      for (const [childOrder, child] of item.children.entries()) {
        await tx.menuItem.create({
          data: { menuId: saved.id, parentId: parent.id, label: child.label, url: child.url, external: /^https?:\/\//i.test(child.url), newTab: child.newTab, enabled: child.enabled, order: childOrder },
        });
      }
    }
    return tx.menu.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true } });
  });

  logActivity(req, 'update', 'menu', `Updated the ${location} menu`);
  res.json({ menu: { location, ctaEnabled: menu.ctaEnabled, ctaLabel: menu.ctaLabel, items: tree(menu.items), updatedAt: menu.updatedAt } });
});
