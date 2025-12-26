/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LITELLM_API_BASE: string;
  readonly VITE_LITELLM_API_KEY: string;
  readonly VITE_LITELLM_MODEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
