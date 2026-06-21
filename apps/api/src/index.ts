import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`China Talent Bridge API listening on :${PORT}`);
});

export default app;
