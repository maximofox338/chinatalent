import express, { type Request, type Response } from 'express';
import type { ApiResponse, User } from '@chinatalent/shared';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);

// Health check.
app.get('/health', (_req: Request, res: Response) => {
  const body: ApiResponse<{ status: 'ok' }> = {
    success: true,
    data: { status: 'ok' },
  };
  res.json(body);
});

// Placeholder for the auth "me" endpoint (see API_CONTRACT.md).
app.get('/api/auth/me', (_req: Request, res: Response) => {
  const body: ApiResponse<User> = {
    success: false,
    error: 'Not implemented',
    code: 'SERVER_ERROR',
  };
  res.status(501).json(body);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`China Talent Bridge API listening on :${PORT}`);
});

export default app;
