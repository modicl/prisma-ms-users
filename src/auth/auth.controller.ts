import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { CognitoAuthGuard } from "./guards/cognito-auth.guard";
import { UpdateMeDto } from "./dto/update-me.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Registrar docente" })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: "Docente registrado correctamente.",
  })
  register(@Req() request: Request, @Body() dto: RegisterDto) {
    return this.authService.register(dto, request.ip);
  }

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Iniciar sesión" })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: "Sesión iniciada correctamente." })
  login(@Req() request: Request, @Body() dto: LoginDto) {
    return this.authService.login(dto, request.ip);
  }

  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Renovar sesión" })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: "Sesión renovada correctamente." })
  refresh(@Req() request: Request, @Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto, request.ip);
  }

  @UseGuards(CognitoAuthGuard)
  @Post("logout")
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cerrar sesión" })
  @ApiResponse({ status: 200, description: "Sesión cerrada correctamente." })
  logout(
    @Req() request: Request,
    @Headers("authorization") authorization?: string,
  ) {
    return this.authService.logout(authorization, request.ip);
  }

  @UseGuards(CognitoAuthGuard)
  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Obtener perfil autenticado" })
  @ApiResponse({ status: 200, description: "Perfil obtenido correctamente." })
  me(@Req() request: Request) {
    return this.authService.me(
      request as Request & { user?: { id: string; email?: string } },
    );
  }

  @UseGuards(CognitoAuthGuard)
  @Patch("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Actualizar perfil autenticado" })
  @ApiBody({ type: UpdateMeDto })
  @ApiResponse({
    status: 200,
    description: "Perfil actualizado correctamente.",
  })
  updateMe(@Req() request: Request, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(
      request as Request & { user?: { id: string; email?: string } },
      dto,
      request.ip,
    );
  }
}
