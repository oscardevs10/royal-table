const BACKEND_PORT = 3001;

/**
 * Derived from the page's own hostname (not hardcoded to localhost) so the
 * app works both for the host (http://localhost:4200) and for a friend
 * joining from another device on the LAN (http://192.168.x.x:4200) -
 * each browser reaches the backend on the same host it loaded the page from.
 */
export const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
