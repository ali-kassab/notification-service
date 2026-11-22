import { Request } from 'express';

/** Dashboard account, set by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Project resolved from a secret API key, set by ApiKeyGuard. */
export interface ApiKeyProject {
  id: string;
  slug: string;
  apiKeyId: string;
}

/** End user of an integrating app, resolved from a user token, set by EndUserGuard. */
export interface EndUserPrincipal {
  projectId: string;
  userId: string;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  project?: ApiKeyProject;
  endUser?: EndUserPrincipal;
}

/** Every inbox operation is scoped by both project and recipient. */
export interface InboxScope {
  projectId: string;
  userId: string;
}
