import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminRoleGuard } from "./guards/admin-role.guard";
import { UsersModule } from "../users/users.module";
import { SupabaseModule } from "../infrastructure/supabase/supabase.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { AuditModule } from "../infrastructure/audit/audit.module";
import { CognitoAuthGuard } from "../auth/guards/cognito-auth.guard";

@Module({
  imports: [UsersModule, SupabaseModule, PrismaModule, AuditModule],
  controllers: [AdminController],
  providers: [CognitoAuthGuard, AdminRoleGuard],
})
export class AdminModule {}
