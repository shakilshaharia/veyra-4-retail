import { Router } from 'express';
import { requireAuth } from '../lib/auth.ts';
import { invalidateContent } from '../lib/content.ts';
import { HttpError } from '../lib/http.ts';
import { getSetting } from '../lib/settings.ts';
import { collectionsRouter } from './collections.ts';
import { dashboardRouter } from './dashboard.ts';
import { mediaRouter } from './media.ts';
import { menusRouter } from './menus.ts';
import { monitor404Router } from './monitor404.ts';
import { pagesRouter } from './pages.ts';
import { postsRouter, taxonomyRouter } from './posts.ts';
import { profileRouter } from './profile.ts';
import { redirectsRouter } from './redirects.ts';
import { settingsRouter } from './settings.ts';
import { snippetsRouter } from './snippets.ts';
import { submissionsRouter } from './submissions.ts';
import { usersRouter } from './users.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth);

// When 2FA is required site-wide, an admin who has not enrolled can reach only
// the endpoints needed to enrol (and their profile); everything else waits.
adminRouter.use(async (req, _res, next) => {
  if (req.user!.twoFactorEnabled) return next();
  if (req.path === '/profile' || req.path.startsWith('/profile/')) return next();
  const { requireTwoFactor } = await getSetting('security');
  if (!requireTwoFactor) return next();
  next(new HttpError(403, 'Set up two-factor authentication to continue.', 'mfa_enrollment_required'));
});

// Any successful write in the admin may change what the public site shows, so
// drop the public content cache once the response has gone out.
adminRouter.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateContent();
    });
  }
  next();
});

adminRouter.use('/', dashboardRouter);
adminRouter.use('/profile', profileRouter);
adminRouter.use('/users', usersRouter);
adminRouter.use('/pages', pagesRouter);
adminRouter.use('/posts', postsRouter);
adminRouter.use('/', taxonomyRouter);
adminRouter.use('/collections', collectionsRouter);
adminRouter.use('/media', mediaRouter);
adminRouter.use('/menus', menusRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/redirects', redirectsRouter);
adminRouter.use('/monitor-404', monitor404Router);
adminRouter.use('/snippets', snippetsRouter);
adminRouter.use('/submissions', submissionsRouter);
