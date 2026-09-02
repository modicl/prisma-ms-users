import { BadRequestException, Injectable } from "@nestjs/common";
import { User } from "@prisma/client";
import { AuditService } from "../infrastructure/audit/audit.service";
import {
  SupabaseSessionResult,
  SupabaseService,
} from "../infrastructure/supabase/supabase.service";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { UpdateMeDto } from "./dto/update-me.dto";

type AuthenticatedRequest = {
  user?: {
    id: string;
    email?: string;
  };
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto, ipOrigen?: string) {
    let session: SupabaseSessionResult | null = null;

    try {
      session = await this.supabaseService.register(dto.email, dto.password, {
        role: "TEACHER",
        colegioId: dto.colegioId ?? null,
      });

      const profile = await this.usersService.createProfile({
        supabaseUserId: session.user.id,
        email: dto.email,
        rut: dto.rut,
        nombreCompleto: dto.nombreCompleto,
        establecimiento: dto.establecimiento,
        phone: dto.phone,
        specialty: dto.specialty,
        position: dto.position,
        active: true,
        role: "TEACHER",
        colegioId: dto.colegioId,
      });

      await this.auditService.registrarEvento({
        tipoEvento: "register",
        userId: profile.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Registro de docente completado correctamente.",
      });

      return this.mapSession(session, profile);
    } catch (error) {
      if (session) {
        await this.supabaseService.deleteUser(session.user.id);
      }

      await this.auditService.registrarEvento({
        tipoEvento: "register",
        userId: null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado en el registro.",
      });

      throw error;
    }
  }

  async login(dto: LoginDto, ipOrigen?: string) {
    try {
      const session = await this.supabaseService.login(dto.email, dto.password);
      const user = await this.usersService.findBySupabaseUserId(
        session.user.id,
      );

      await this.auditService.registrarEvento({
        tipoEvento: "login",
        userId: user.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Inicio de sesión exitoso.",
      });

      return this.mapSession(session, user);
    } catch (error) {
      const user = await this.usersService.findByEmail(dto.email);

      await this.auditService.registrarEvento({
        tipoEvento: "login",
        userId: user?.id ?? null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado en el inicio de sesión.",
      });

      throw error;
    }
  }

  async refresh(dto: RefreshTokenDto, ipOrigen?: string) {
    try {
      const session = await this.supabaseService.refresh(dto.refreshToken);
      const user = await this.usersService.findBySupabaseUserId(
        session.user.id,
      );

      await this.auditService.registrarEvento({
        tipoEvento: "refresh",
        userId: user.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Refresco de token ejecutado correctamente.",
      });

      return this.mapSession(session, user);
    } catch (error) {
      await this.auditService.registrarEvento({
        tipoEvento: "refresh",
        userId: null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado al refrescar la sesión.",
      });

      throw error;
    }
  }

  async logout(authorization?: string, ipOrigen?: string) {
    const accessToken = this.getBearerToken(authorization);
    const supabaseUser = await this.supabaseService.getUser(accessToken);

    try {
      await this.supabaseService.logout(accessToken);
      const user = await this.usersService.findBySupabaseUserId(
        supabaseUser.id,
      );

      await this.auditService.registrarEvento({
        tipoEvento: "logout",
        userId: user.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Cierre de sesión ejecutado correctamente.",
      });

      return { message: "Sesión cerrada correctamente" };
    } catch (error) {
      const userId = await (async () => {
        try {
          const accessToken = this.getBearerToken(authorization);
          const supabaseUser = await this.supabaseService.getUser(accessToken);
          const user = await this.usersService.findBySupabaseUserId(
            supabaseUser.id,
          );
          return user.id;
        } catch {
          return null;
        }
      })();

      await this.auditService.registrarEvento({
        tipoEvento: "logout",
        userId,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado al cerrar sesión.",
      });

      throw error;
    }
  }

  async me(request: AuthenticatedRequest) {
    const sub = request.user?.id;

    if (!sub) {
      throw new BadRequestException("Authenticated user not found.");
    }

    return this.usersService.findByIdentity({
      sub,
      email: request.user?.email,
    });
  }

  async updateMe(
    request: AuthenticatedRequest,
    dto: UpdateMeDto,
    ipOrigen?: string,
  ) {
    const supabaseUserId = request.user?.id;

    if (!supabaseUserId) {
      throw new BadRequestException("Authenticated user not found.");
    }

    return this.usersService.updateProfile(supabaseUserId, dto, ipOrigen);
  }

  private getBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new BadRequestException("Authorization header is required.");
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new BadRequestException("Invalid Authorization header.");
    }

    return token;
  }

  private mapSession(session: SupabaseSessionResult, profile?: User) {
    return {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      token_type: session.tokenType,
      expires_in: session.expiresIn,
      user: profile ?? session.user,
    };
  }
}
