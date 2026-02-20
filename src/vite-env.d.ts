/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AI_API_BASE_URL?: string;
	readonly VITE_SIP_WS_SERVER_URL?: string;
	readonly VITE_SIP_DOMAIN?: string;
	readonly VITE_SIP_URI_PREFIX?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
