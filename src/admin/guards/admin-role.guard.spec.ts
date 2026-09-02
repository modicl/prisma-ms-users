import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminRoleGuard } from './admin-role.guard';
import { UsersService } from '../../users/users.service';

describe('AdminRoleGuard', () => {
  let guard: AdminRoleGuard;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(() => {
    usersService = {
      findByIdentity: jest.fn(),
    } as any;

    // El guard ya NO valida el token: eso lo hace CognitoAuthGuard, declarado
    // antes en el mismo @UseGuards. Este solo lee el request.user que aquel dejo.
    guard = new AdminRoleGuard(usersService);
  });

  const contextWith = (user?: { id?: string; email?: string }) => {
    const request: any = { headers: {}, user };
    return {
      request,
      context: { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext,
    };
  };

  it('rechaza si CognitoAuthGuard no dejo un usuario en el request', async () => {
    const { context } = contextWith(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(usersService.findByIdentity).not.toHaveBeenCalled();
  });

  it('resuelve el perfil por sub y email, no solo por sub', async () => {
    const { context } = contextWith({ id: 'cognito-sub-1', email: 'super@test.cl' });
    usersService.findByIdentity.mockResolvedValue({ id: 'u1', role: 'ADMIN' } as any);

    await guard.canActivate(context);

    // El email es el puente durante la migracion: las filas viejas tienen el
    // UUID de Supabase en id_supabase, que no coincide con el sub de Cognito.
    expect(usersService.findByIdentity).toHaveBeenCalledWith({
      sub: 'cognito-sub-1',
      email: 'super@test.cl',
    });
  });

  it('rechaza si el rol de la BD no alcanza', async () => {
    const { context } = contextWith({ id: 'cognito-sub-1', email: 'x@test.cl' });
    usersService.findByIdentity.mockResolvedValue({ id: 'u1', role: 'TEACHER' } as any);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('deja pasar y adjunta el perfil al request', async () => {
    const { request, context } = contextWith({ id: 'cognito-sub-1', email: 'super@test.cl' });
    usersService.findByIdentity.mockResolvedValue({
      id: 'u1',
      role: 'ADMIN',
      email: 'super@test.cl',
    } as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.adminUser.role).toBe('ADMIN');
  });

  it('acepta tambien SUPERADMIN', async () => {
    const { context } = contextWith({ id: 'cognito-sub-1', email: 'super@test.cl' });
    usersService.findByIdentity.mockResolvedValue({ id: 'u1', role: 'SUPERADMIN' } as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
