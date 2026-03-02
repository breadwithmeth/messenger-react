import Keycloak, { type KeycloakConfig, type KeycloakInitOptions } from 'keycloak-js';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'https://sec.naliv.kz';
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'naliv-prod';
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'messenger-frontend';
export const KEYCLOAK_SCOPE = import.meta.env.VITE_KEYCLOAK_SCOPE ?? 'openid profile email';

const getFrontendOrigin = () => {
  const envOrigin = import.meta.env.VITE_FRONTEND_ORIGIN;
  if (envOrigin) {
    return envOrigin;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'https://messenger.naliv.kz';
};

const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '');

const keycloakConfig: KeycloakConfig = {
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID,
};

const frontendOrigin = normalizeOrigin(getFrontendOrigin());

export const KEYCLOAK_REDIRECT_URI =
  import.meta.env.VITE_KEYCLOAK_REDIRECT_URI ?? `${frontendOrigin}/`;

export const KEYCLOAK_SILENT_CHECK_SSO_REDIRECT_URI =
  import.meta.env.VITE_KEYCLOAK_SILENT_CHECK_SSO_REDIRECT_URI ??
  `${frontendOrigin}/silent-check-sso.html`;

const initOptions: KeycloakInitOptions = {
  onLoad: 'login-required',
  flow: 'standard',
  pkceMethod: 'S256',
  scope: KEYCLOAK_SCOPE,
  checkLoginIframe: true,
  silentCheckSsoRedirectUri: KEYCLOAK_SILENT_CHECK_SSO_REDIRECT_URI,
};

export const keycloak = new Keycloak(keycloakConfig);

let initPromise: Promise<boolean> | null = null;

export const initKeycloak = () => {
  if (!initPromise) {
    initPromise = keycloak.init(initOptions);
  }

  return initPromise;
};

export const resetKeycloakInit = () => {
  initPromise = null;
};
