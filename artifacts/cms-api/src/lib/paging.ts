import { z } from 'zod';

export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageArgs({ page, pageSize }: { page: number; pageSize: number }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, { page, pageSize }: { page: number; pageSize: number }) {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

// Express query strings arrive as strings; treat "" as absent.
export const optionalText = z
  .string()
  .max(200)
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));
