const BACKEND_PORT = 3001;

/**
 * Backend deployed on Render for the GitHub Pages demo (no server-side code
 * runs on Pages itself, so the static site needs a real, separately-hosted
 * backend to talk to). Update this if the Render service is renamed/recreated.
 */
const DEPLOYED_BACKEND_URL = 'https://royal-table-backend.onrender.com';

function resolveBackendUrl(): string {
  if (window.location.hostname.endsWith('github.io')) {
    return DEPLOYED_BACKEND_URL;
  }
  // Derived from the page's own hostname (not hardcoded to localhost) so the
  // app works both for the host (http://localhost:4200) and for a friend
  // joining from another device on the LAN (http://192.168.x.x:4200) -
  // each browser reaches the backend on the same host it loaded the page from.
  return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
}

export const BACKEND_URL = resolveBackendUrl();
