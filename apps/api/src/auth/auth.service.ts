import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { AuthContext } from './auth-context';

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: AuthContext['role'];
  partner_id: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Verify credentials against the user record. The lookup uses the admin pool
   * because it must run before any tenant context exists; the result is scoped
   * to the requested tenant slug so a user cannot authenticate into another.
   */
  async login(tenantSlug: string, email: string, password: string) {
    const row = await this.db.runAdmin(async (q) => {
      const res = await q.query<UserRow>(
        `SELECT u.* FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE t.slug = $1 AND u.email = $2`,
        [tenantSlug, email],
      );
      return res.rows[0];
    });
    if (!row) throw new UnauthorizedException('invalid credentials');

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    const ctx: AuthContext = {
      userId: row.id,
      tenantId: row.tenant_id,
      role: row.role,
      partnerId: row.partner_id,
      email: row.email,
    };
    const token = await this.jwt.signAsync(ctx);
    return { token, user: { ...ctx, name: row.name } };
  }

  async verify(token: string): Promise<AuthContext> {
    try {
      const payload = await this.jwt.verifyAsync<AuthContext>(token);
      return payload;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}
