import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { clientIp } from './http.ts';

export function limiter(options: { windowMinutes: number; limit: number; message: string }) {
  return rateLimit({
    windowMs: options.windowMinutes * 60 * 1000,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // ipKeyGenerator groups IPv6 addresses by /56 so one host cannot dodge the
    // limit by cycling through its own address block.
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
    message: { error: { message: options.message, code: 'rate_limited' } },
  });
}
