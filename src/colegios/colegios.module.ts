import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { ColegiosController } from "./colegios.controller";
import { ColegiosService } from "./colegios.service";
import { SuperAdminRoleGuard } from "./guards/superadmin-role.guard";
import { CognitoAuthGuard } from "../auth/guards/cognito-auth.guard";

@Module({
  imports: [UsersModule],
  controllers: [ColegiosController],
  providers: [CognitoAuthGuard, ColegiosService, SuperAdminRoleGuard],
  exports: [ColegiosService],
})
export class ColegiosModule {}
