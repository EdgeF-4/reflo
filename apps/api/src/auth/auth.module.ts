import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadConfig } from '../config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles';

const cfg = loadConfig();

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: cfg.jwtSecret,
      signOptions: { expiresIn: cfg.jwtTtlSeconds },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, RolesGuard],
  exports: [AuthService, JwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
