/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL?: string;
  readonly VITE_EXPOSE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
