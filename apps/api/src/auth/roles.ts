import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthContext } from './auth-context';

export const ROLES_KEY = 'roles';
/** Restrict a handler to the given roles. Used together with JwtGuard. */
export const Roles = (...roles: AuthContext['role'][]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthContext['role'][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const role = req.auth?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException(
        `requires role: ${required.join(' or ')}. Next: sign in with one of those roles or use a route allowed for the current account.`,
      );
    }
    return true;
  }
}
