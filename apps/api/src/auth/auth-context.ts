/** The identity and scope derived from a verified JWT and attached to a request. */
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'analyst' | 'partner';
  /** Set only for partner users; constrains every query to that partner. */
  partnerId?: string | null;
  email: string;
}

declare module 'express' {
  interface Request {
    auth?: AuthContext;
  }
}
