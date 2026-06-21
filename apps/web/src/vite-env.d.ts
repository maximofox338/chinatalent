/// <reference types="vite/client" />

// Typed environment variables exposed to the browser by Vite.
// Only VITE_* variables are available client-side.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Base URL of the backend API, e.g. http://localhost:3000 */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
