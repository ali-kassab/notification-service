/**
 * notification-service-sdk
 *
 * - `NotificationClient`  - server-side, secret API key: send, broadcast, manage inboxes, issue user tokens.
 * - `NotificationInbox`   - browser-side, user token: read the current user's inbox + real-time updates.
 *   (also available from "notification-service-sdk/browser" without the server client)
 */
export { NotificationClient } from './server.js';
export type { NotificationClientOptions } from './server.js';
export { NotificationInbox } from './browser.js';
export type { NotificationInboxOptions, SubscribeHandlers, TokenSource } from './browser.js';
export { NotificationServiceError } from './http.js';
export type * from './types.js';
