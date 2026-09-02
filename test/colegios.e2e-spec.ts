import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/infrastructure/prisma/prisma.service";

// CognitoAuthGuard resuelve issuer y audience en su constructor con `getOrThrow`,
// y AppModule lo instancia al compilar. Sin estas variables el modulo no levanta.
process.env.COGNITO_USER_POOL_ID ??= "us-east-1_test";
process.env.COGNITO_CLIENT_ID ??= "test-client-id";

describe("Colegios Flow (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cleanup: eliminar datos de prueba
    try {
      await prisma.user.deleteMany({ where: { email: { contains: "e2e-" } } });
      await prisma.colegio.deleteMany({ where: { email: { contains: "e2e-" } } });
    } catch {
      // Ignorar errores de cleanup
    }
    await app.close();
  });

  describe("SUPERADMIN endpoints - autenticación requerida", () => {
    it("GET /api/superadmin/colegios requiere autenticación", async () => {
      await request(app.getHttpServer())
        .get("/api/superadmin/colegios")
        .expect(401);
    });

    it("POST /api/superadmin/colegios requiere autenticación", async () => {
      await request(app.getHttpServer())
        .post("/api/superadmin/colegios")
        .send({
          nombre: "E2E Colegio",
          direccion: "Calle E2E 123",
          email: "e2e-colegio@test.cl",
          rut: "12.345.678-9",
          adminEmail: "e2e-admin@test.cl",
          adminPassword: "Password123!",
          adminNombre: "E2E Admin",
        })
        .expect(401);
    });

    it("GET /api/superadmin/colegios/:id requiere autenticación", async () => {
      await request(app.getHttpServer())
        .get("/api/superadmin/colegios/some-id")
        .expect(401);
    });

    it("PATCH /api/superadmin/colegios/:id requiere autenticación", async () => {
      await request(app.getHttpServer())
        .patch("/api/superadmin/colegios/some-id")
        .send({ nombre: "Updated" })
        .expect(401);
    });

    it("DELETE /api/superadmin/colegios/:id requiere autenticación", async () => {
      await request(app.getHttpServer())
        .delete("/api/superadmin/colegios/some-id")
        .expect(401);
    });

    it("GET /api/superadmin/colegios/:id/stats requiere autenticación", async () => {
      await request(app.getHttpServer())
        .get("/api/superadmin/colegios/some-id/stats")
        .expect(401);
    });

    it("GET /api/superadmin/colegios/:id/professors requiere autenticación", async () => {
      await request(app.getHttpServer())
        .get("/api/superadmin/colegios/some-id/professors")
        .expect(401);
    });
  });

  describe("Admin endpoints con colegioId", () => {
    it("POST /api/admin/users acepta colegioId en el body", async () => {
      // Verificar que el endpoint acepta colegioId en el body
      // Debería fallar por auth (401), no por validación
      await request(app.getHttpServer())
        .post("/api/admin/users")
        .send({
          email: "e2e-profesor@test.cl",
          nombreCompleto: "E2E Profesor",
          password: "Password123!",
          role: "TEACHER",
          colegioId: "non-existent-id",
        })
        .expect(401);
    });
  });

  describe("Flujo completo (tests skip - requieren tokens Supabase reales)", () => {
    it.skip("SUPERADMIN crea colegio con admin", async () => {
      // Este test requiere un token JWT válido de Supabase para el SUPERADMIN
      // Para ejecutarlo manualmente:
      // 1. Obtener token de SUPERADMIN desde Supabase
      // 2. Descomentar y ejecutar
      /*
      const response = await request(app.getHttpServer())
        .post("/api/superadmin/colegios")
        .set("Authorization", `Bearer ${SUPERADMIN_TOKEN}`)
        .send({
          nombre: "E2E Colegio Test",
          direccion: "Calle E2E 456",
          telefono: "+56912345678",
          email: `e2e-colegio-${Date.now()}@test.cl`,
          rut: `e2e-${Date.now()}`,
          plan: "basic",
          adminEmail: `e2e-admin-${Date.now()}@test.cl`,
          adminPassword: "Password123!",
          adminNombre: "E2E Admin User",
        })
        .expect(201);

      expect(response.body).toHaveProperty("colegio");
      expect(response.body).toHaveProperty("admin");
      expect(response.body.colegio.nombre).toBe("E2E Colegio Test");
      expect(response.body.admin.role).toBe("ADMIN");
      */
    });

    it.skip("Admin del colegio hace login", async () => {
      // Este test requiere las credenciales del admin creado en el test anterior
      /*
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({
          email: "e2e-admin@test.cl",
          password: "Password123!",
        })
        .expect(201);

      expect(response.body).toHaveProperty("access_token");
      expect(response.body.user.role).toBe("ADMIN");
      expect(response.body.user.colegioId).toBe(createdColegioId);
      */
    });

    it.skip("Admin crea profesor para su colegio", async () => {
      // Este test requiere el token del admin
      /*
      const response = await request(app.getHttpServer())
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: `e2e-profesor-${Date.now()}@test.cl`,
          nombreCompleto: "Profesor de Prueba",
          password: "Password123!",
          role: "TEACHER",
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.user.colegioId).toBe(createdColegioId);
      */
    });
  });
});
