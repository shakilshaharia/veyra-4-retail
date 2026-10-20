import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './env.ts';
import { loadSession } from './lib/auth.ts';
import { HttpError, errorHandler } from './lib/http.ts';
import { PERMISSIONS_POLICY } from './lib/security.ts';
import { adminRouter } from './routes/admin.ts';
import { authRouter } from './routes/auth.ts';
import { publicRouter } from './routes/public.ts';
import { mountSite } from './site.ts';

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const allowedOrigins = new Set(
  [env.siteUrl, env.adminUrl, ...env.corsOrigins].map(originOf).filter(Boolean),
);

// CSRF defence for cookie-authenticated writes. Browsers attach an Origin
// header to every cross-site POST/PUT/PATCH/DELETE; anything not from our own
// site or admin is refused. Requests without an Origin are non-browser
// clients, which cannot ride a visitor's cookies in the first place.
function originGuard(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const self = `${req.protocol}://${req.headers.host}`;
  if (allowedOrigins.has(origin) || origin === self) return next();
  next(new HttpError(403, 'Request blocked: it did not come from this site.', 'bad_origin'));
}

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
  }
  next();
}

export function createApp() {
  const app = express();

  // One proxy hop (nginx on loopback) in production.
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The Content-Security-Policy is set per response (site.ts / the admin
      // handler) because public pages carry a fresh script nonce each time;
      // helmet still supplies the static headers below.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      // One year, apply to subdomains. Only emitted on https responses.
      strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  // helmet has no Permissions-Policy; set the one the whole site shares.
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  });
  app.use(cookieParser());

  const api = express.Router();
  api.use(cors);
  api.use(express.json({ limit: '2mb' }));
  api.use(originGuard);
  api.use(loadSession);
  // Admin and auth responses must never be cached by a browser or CDN.
  api.use((req, res, next) => {
    if (!req.path.startsWith('/public/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });
  api.use('/auth', authRouter);
  api.use('/public', publicRouter);
  api.use('/admin', adminRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'No such API endpoint.', 'not_found')));
  api.use(errorHandler);

  app.use('/api', api);
  mountSite(app);
  app.use(errorHandler);
  return app;
}
