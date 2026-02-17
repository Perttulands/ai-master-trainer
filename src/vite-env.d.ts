/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_RUNTIME: string;
  readonly VITE_LITELLM_API_BASE: string;
  readonly VITE_LITELLM_API_KEY: string;
  readonly VITE_LITELLM_MODEL: string;
  readonly VITE_ADK_RUNTIME_BASE: string;
  readonly VITE_ADK_RUNTIME_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
