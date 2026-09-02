import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { UsersService } from "../../users/users.service";

/**
 * Verifica que el usuario autenticado tenga rol ADMIN o SUPERADMIN.
 *
 * NO valida el token: eso lo hace `CognitoAuthGuard`, que debe declararse ANTES
 * en el mismo `@UseGuards(...)` -los guards corren en orden y este lee el
 * `request.user` que aquel deja.
 *
 * El rol se toma de la BASE DE DATOS, no del token. Es a proposito: un cambio de
 * rol surte efecto de inmediato, sin esperar a que el usuario renueve su token.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id?: string; email?: string }; adminUser?: unknown }>();

    if (!request.user?.id) {
      throw new UnauthorizedException("Authorization header is required.");
    }

    const profile = await this.usersService.findByIdentity({
      sub: request.user.id,
      email: request.user.email,
    });

    if (profile.role !== "ADMIN" && profile.role !== "SUPERADMIN") {
      throw new UnauthorizedException("Admin role required.");
    }

    request.adminUser = profile;
    return true;
  }
}
