/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE_URL: string;
	readonly VITE_AI_API_BASE_URL?: string;
	readonly VITE_FRONTEND_ORIGIN?: string;
	readonly VITE_LOGOUT_REDIRECT_URI?: string;
	readonly VITE_KEYCLOAK_URL?: string;
	readonly VITE_KEYCLOAK_REALM?: string;
	readonly VITE_KEYCLOAK_CLIENT_ID?: string;
	readonly VITE_KEYCLOAK_SCOPE?: string;
	readonly VITE_KEYCLOAK_REDIRECT_URI?: string;
	readonly VITE_KEYCLOAK_SILENT_CHECK_SSO_REDIRECT_URI?: string;
	readonly VITE_SIP_WS_SERVER_URL?: string;
	readonly VITE_SIP_DOMAIN?: string;
	readonly VITE_SIP_URI_PREFIX?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
