import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EndUserGuard, JwtAuthGuard } from './guards';
import { UserTokenService } from './user-token.service';
import { UserTokensController } from './user-tokens.controller';

/** Global so the guards can be used from any module without re-importing. */
@Global()
@Module({
  imports: [JwtModule.register({}), UsersModule, ApiKeysModule],
  controllers: [AuthController, UserTokensController],
  providers: [AuthService, UserTokenService, JwtAuthGuard, EndUserGuard],
  exports: [AuthService, UserTokenService, JwtAuthGuard, EndUserGuard],
})
export class AuthModule {}
