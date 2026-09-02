import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { SupabaseService } from "../infrastructure/supabase/supabase.service";
import { AuditService } from "../infrastructure/audit/audit.service";
import { AdminRoleGuard } from "./guards/admin-role.guard";
import { CognitoAuthGuard } from "../auth/guards/cognito-auth.guard";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(CognitoAuthGuard, AdminRoleGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  @Get("users/stats")
  @ApiOperation({ summary: "Estadísticas de usuarios para el panel admin" })
  async usersStats() {
    const [totalUsers, activeUsers, superadmins, admins, teachers] = await Promise.all([
      this.prismaService.user.count(),
      this.prismaService.user.count({ where: { active: true } }),
      this.prismaService.user.count({ where: { role: "SUPERADMIN" } }),
      this.prismaService.user.count({ where: { role: "ADMIN" } }),
      this.prismaService.user.count({ where: { role: "TEACHER" } }),
    ]);

    return { totalUsers, activeUsers, superadmins, admins, teachers };
  }

  @Get("users")
  @ApiOperation({ summary: "Listar todos los usuarios" })
  async listUsers() {
    return this.prismaService.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        active: true,
        colegioId: true,
        createdAt: true,
      },
    });
  }

  @Post("users")
  @ApiOperation({ summary: "Crear usuario completo (profesor/admin)" })
  async createUser(
    @Body()
    body: {
      email: string;
      nombreCompleto: string;
      password: string;
      role?: "SUPERADMIN" | "ADMIN" | "TEACHER";
      rut?: string;
      colegioId?: string;
    },
    @Req() request: Request & { adminUser?: any },
  ) {
    const existing = await this.prismaService.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      return { ok: false, message: "El email ya está registrado" };
    }

    const colegioId = body.colegioId || request.adminUser?.colegioId;

    if (colegioId) {
      const colegio = await this.prismaService.colegio.findUnique({
        where: { id: colegioId },
      });
      if (!colegio) {
        return { ok: false, message: "El colegio especificado no existe" };
      }
    }

    const supabaseResult = await this.supabaseService.createUserWithPasswordAndMetadata(
      body.email,
      body.password,
      {
        role: body.role ?? "TEACHER",
        nombreCompleto: body.nombreCompleto,
        colegioId: colegioId ?? null,
      },
      // app_metadata: fuente segura del tenant leida por perfil-alumno/docs.
      {
        role: body.role ?? "TEACHER",
        colegioId: colegioId ?? null,
      },
    );
    if (!supabaseResult?.id) {
      return { ok: false, message: "Error creando usuario en Supabase" };
    }

    const user = await this.prismaService.user.create({
      data: {
        email: body.email,
        supabaseUserId: supabaseResult.id,
        rut:
          body.rut ||
          `${Date.now()
            .toString()
            .slice(-8)
            .replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3")}-0`,
        nombreCompleto: body.nombreCompleto,
        role: body.role ?? "TEACHER",
        colegioId: colegioId,
        active: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        colegioId: true,
      },
    });

    if (body.role === "ADMIN") {
      await this.auditService.registrarEvento({
        tipoEvento: "admin_create",
        userId: request.adminUser?.id ?? null,
        ipOrigen: request.ip ?? null,
        resultado: "success",
        mensaje: `ADMIN creado: ${user.email} (id=${user.id}) para colegio ${colegioId ?? "sin colegio"}`,
      });
    }

    return { ok: true, user };
  }

  @Patch("users/:id/role")
  @ApiOperation({ summary: "Cambiar rol de un usuario" })
  async updateUserRole(
    @Param("id") id: string,
    @Body() body: { role: "SUPERADMIN" | "ADMIN" | "TEACHER"; colegioId?: string },
    @Req() request: Request & { adminUser?: any },
  ) {
    const previous = await this.prismaService.user.findUnique({ where: { id } });
    if (!previous) {
      return { ok: false, message: "Usuario no encontrado" };
    }

    const user = await this.prismaService.user.update({
      where: { id },
      data: {
        role: body.role,
        ...(body.colegioId !== undefined ? { colegioId: body.colegioId } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        colegioId: true,
        supabaseUserId: true,
      },
    });

    // Propagar rol/colegio al app_metadata de Supabase para que el proximo
    // token del usuario lleve el tenant correcto (perfil-alumno/docs lo leen).
    if (user.supabaseUserId) {
      await this.supabaseService.updateUserAppMetadata(user.supabaseUserId, {
        role: user.role,
        colegioId: user.colegioId ?? null,
      });
    }

    if (previous.role === "ADMIN" || user.role === "ADMIN") {
      await this.auditService.registrarEvento({
        tipoEvento: "admin_update",
        userId: request.adminUser?.id ?? null,
        ipOrigen: request.ip ?? null,
        resultado: "success",
        mensaje: `ADMIN actualizado: ${user.email} (id=${user.id}) rol=${previous.role}->${user.role} colegio=${previous.colegioId ?? "null"}->${user.colegioId ?? "null"}`,
      });
    }

    return { ok: true, user };
  }

  @Patch("users/:id/active")
  @ApiOperation({ summary: "Activar o desactivar un usuario" })
  async setUserActive(
    @Param("id") id: string,
    @Body() body: { active: boolean },
    @Req() request: Request & { adminUser?: any },
  ) {
    if (typeof body.active !== "boolean") {
      throw new BadRequestException("El campo 'active' debe ser boolean");
    }

    const previous = await this.prismaService.user.findUnique({ where: { id } });
    if (!previous) {
      return { ok: false, message: "Usuario no encontrado" };
    }

    if (previous.active === body.active) {
      return { ok: true, user: previous, message: "Sin cambios" };
    }

    const user = await this.prismaService.user.update({
      where: { id },
      data: { active: body.active },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        active: true,
        colegioId: true,
      },
    });

    if (previous.role === "ADMIN") {
      await this.auditService.registrarEvento({
        tipoEvento: body.active ? "admin_reactivate" : "admin_deactivate",
        userId: request.adminUser?.id ?? null,
        ipOrigen: request.ip ?? null,
        resultado: "success",
        mensaje: `ADMIN ${body.active ? "reactivado" : "desactivado"}: ${user.email} (id=${user.id})`,
      });
    }

    return { ok: true, user };
  }

  @Post("users/:id/reset-password")
  @ApiOperation({ summary: "Resetear password de un usuario (genera uno temporal)" })
  async resetUserPassword(
    @Param("id") id: string,
    @Body() body: { newPassword?: string },
    @Req() request: Request & { adminUser?: any },
  ) {
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) {
      return { ok: false, message: "Usuario no encontrado" };
    }

    const newPassword =
      body.newPassword && body.newPassword.length >= 8
        ? body.newPassword
        : this.generateTemporaryPassword();

    await this.supabaseService.resetUserPassword(user.supabaseUserId, newPassword);

    if (user.role === "ADMIN") {
      await this.auditService.registrarEvento({
        tipoEvento: "admin_password_reset",
        userId: request.adminUser?.id ?? null,
        ipOrigen: request.ip ?? null,
        resultado: "success",
        mensaje: `Password reseteado para ADMIN: ${user.email} (id=${user.id})`,
      });
    }

    return {
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
      temporaryPassword: newPassword,
    };
  }

  private generateTemporaryPassword(): string {
    const length = 12;
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
}
