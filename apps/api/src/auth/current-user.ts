import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthContext } from './auth-context';
import { DbScope } from '../db/db.service';

/** Inject the verified AuthContext into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth) throw new Error('CurrentUser used on an unauthenticated route');
    return req.auth;
  },
);

/** Derive the database scope (tenant, and partner for partner users) from auth. */
export function scopeFor(auth: AuthContext): DbScope {
  return {
    tenantId: auth.tenantId,
    partnerId: auth.role === 'partner' ? auth.partnerId ?? null : null,
  };
}
