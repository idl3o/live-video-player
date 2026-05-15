/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_API_TARGET?: string;
  readonly VITE_FLV_BASE?: string;
  readonly VITE_PAYMENT_SUPER_TOKEN?: string;
  readonly VITE_EAS_STREAMER_ENDORSEMENT_SCHEMA?: string;
  readonly VITE_EAS_CLIP_PRAISE_SCHEMA?: string;
  readonly VITE_LIVE_STREAM_CONTRACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
