import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { get, run } from './db.ts';
import { HttpError, now } from './lib.ts';
import { csrfGuard, sessionMiddleware } from './http.ts';
import { auth, me } from './routes/auth.ts';
import { teen } from './routes/teen.ts';
import { parent } from './routes/parent.ts';
import { processAllowances } from './services.ts';
import { seedDemo } from './seed.ts';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  next();
});
app.use(express.json({ limit: '32kb' }));

const api = express.Router();
api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
api.use(sessionMiddleware, csrfGuard);
// Scheduled allowances are settled lazily on traffic as well as on the timer below.
api.use((req, _res, next) => { if (req.user) processAllowances(); next(); });
api.get('/health', (_req, res) => res.json({ ok: true, mode: 'simulation' }));
api.use('/auth', auth);
api.use('/me', me);
api.use('/parent', parent);
api.use('/', teen);
api.use((_req, _res) => { throw new HttpError(404, 'NOT_FOUND', 'No such endpoint.'); });
app.use('/api', api);

const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: { code: 'VALIDATION', message: first?.message ?? 'Check your input.', field: first?.path.join('.') } });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  if ((err as any)?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed request.' } });
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
});

if (process.argv[1]?.endsWith('index.ts')) {
  if (!get('SELECT 1 FROM users LIMIT 1')) seedDemo();
  setInterval(() => { try { processAllowances(); run('DELETE FROM sessions WHERE expires_at < ?', now()); } catch (e) { console.error(e); } }, 60_000).unref();
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => console.log(`LevelUp API (simulation mode) on http://localhost:${port}`));
}
