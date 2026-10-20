// Shapes returned by the admin API.

import type { Section, Seo } from '@workspace/cms-content';

export type Role = 'SUPER_ADMIN' | 'EDITOR' | 'AUTHOR';
export type Status = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';

export type Me = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string;
  capabilities: string[];
  twoFactorEnabled: boolean;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; pages: number };

export type PageSummary = {
  id: string;
  slug: string;
  path: string;
  title: string;
  excerpt: string;
  template: string;
  isSystem: boolean;
  status: Status;
  publishAt: string | null;
  publishedAt: string | null;
  hasPublishedVersion: boolean;
  hasChanges: boolean;
  updatedBy: string | null;
  updatedAt: string;
  liveUrl: string;
  previewUrl: string;
};

export type PageDetail = PageSummary & {
  featuredImage: string;
  sections: Section[];
  seo: Seo;
  author: string | null;
  allowedSections: Section['type'][];
};

export type Term = { id: string; name: string; slug: string; description?: string; postCount?: number };

export type ResourceType = 'BLOG' | 'USE_CASE' | 'EVENT';
export type SolutionName = 'Veyra Online' | 'Veyra In-Person' | 'Cerin';
export type EventFormat = 'Virtual' | 'In person' | 'Hybrid';
export type RegistrationStatus = 'open' | 'closed' | 'cancelled';

export type UseCaseDetails = {
  industry: string;
  challenge: string;
  approach: string[];
  benefits: string[];
  verifiedOutcomes: string[];
  customerStory: boolean;
};

export type EventDetails = {
  startsAt: string;
  endsAt?: string;
  durationMinutes?: number;
  timeZone: string;
  format: EventFormat;
  location: string;
  audience: string;
  learn: string[];
  agenda: { time: string; title: string }[];
  speakers: { name: string; role: string }[];
  registrationStatus: RegistrationStatus;
  registrationUrl: string;
  recordingUrl: string;
  attendanceUrl: string;
  venueAddress: string;
};

export type PostSummary = {
  id: string;
  slug: string;
  type: ResourceType;
  path: string;
  title: string;
  excerpt: string;
  featuredImage: string;
  featuredImageAlt: string;
  readingMinutes: number;
  status: Status;
  featured: boolean;
  solutions: SolutionName[];
  details: Record<string, unknown> | null;
  publishAt: string | null;
  publishedAt: string | null;
  seo: Seo;
  relatedIds: string[];
  author: { id: string; name: string; avatarUrl: string };
  categories: Term[];
  tags: Term[];
  updatedAt: string;
  liveUrl: string;
  previewUrl: string;
};

export type PostDetail = PostSummary & { contentJson: Record<string, unknown>; contentHtml: string };

export type MediaItem = {
  id: string;
  filename: string;
  url: string;
  driver: string;
  mimeType: string;
  kind: 'image' | 'video' | 'document';
  sizeBytes: number;
  width: number | null;
  height: number | null;
  title: string;
  alt: string;
  caption: string;
  description: string;
  variants: { width: number; url: string; sizeBytes: number }[];
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  builtIn: boolean;
};

export type MediaUsage = { type: string; id: string; label: string; href: string };

export type MenuItemNode = {
  id?: string;
  label: string;
  url: string;
  newTab: boolean;
  enabled: boolean;
  children: MenuItemNode[];
};

export type MenuData = { location: string; ctaEnabled: boolean; ctaLabel: string; items: MenuItemNode[]; updatedAt: string | null };

export type Submission = {
  id: string;
  type: 'DEMO' | 'CONTACT';
  status: 'NEW' | 'CONTACTED' | 'COMPLETED' | 'SPAM';
  name: string;
  email: string;
  company: string;
  data: Record<string, string>;
  notes: string;
  emailed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string;
  active: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  totpEnabledAt: string | null;
  emailOtpEnabled: boolean;
  createdAt: string;
  _count: { posts: number };
};

export type Activity = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  user: string;
  createdAt: string;
};

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
};
