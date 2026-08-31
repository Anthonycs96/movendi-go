import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

const envSchema = z.object({
  BOOTSTRAP_TENANT_SLUG: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  BOOTSTRAP_TENANT_NAME: z.string().trim().min(2),
  BOOTSTRAP_TENANT_TYPE: z.enum(["BARBERSHOP", "RESTAURANT", "TRANSPORT"]),
  BOOTSTRAP_BRANCH_NAME: z.string().trim().min(2),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12),
});

const prisma = new PrismaClient();

async function main() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Faltan variables BOOTSTRAP_* válidas:", parsed.error.flatten().fieldErrors);
    process.exitCode = 1;
    return;
  }

  const env = parsed.data;
  const bootstrapPlan = await prisma.platformPlan.upsert({
    where: { key: "PROFESSIONAL" },
    update: { active: true },
    create: {
      key: "PROFESSIONAL",
      name: "Profesional",
      description: "Plan recomendado para operar el negocio en producción.",
      monthlyPriceCents: 19900,
      maxUsers: 20,
      maxMonthlyOperations: 3000,
      features: JSON.stringify(["Sucursales", "Auditoría", "Soporte prioritario"]),
    },
  });
  const existingTenant = await prisma.tenant.findUnique({ where: { slug: env.BOOTSTRAP_TENANT_SLUG } });
  const tenant = existingTenant ?? await prisma.tenant.create({
    data: {
      slug: env.BOOTSTRAP_TENANT_SLUG,
      name: env.BOOTSTRAP_TENANT_NAME,
      shortName: env.BOOTSTRAP_TENANT_NAME,
      type: env.BOOTSTRAP_TENANT_TYPE,
      planId: bootstrapPlan.id,
      subscriptionStatus: "ACTIVE",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: env.BOOTSTRAP_BRANCH_NAME } },
    update: { active: true },
    create: { tenantId: tenant.id, name: env.BOOTSTRAP_BRANCH_NAME },
  });
  const role = await prisma.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "ADMIN" } },
    update: { name: "Administrador", permissions: JSON.stringify(["*"]) },
    create: { tenantId: tenant.id, key: "ADMIN", name: "Administrador", permissions: JSON.stringify(["*"]) },
  });

  const existingAdmin = await prisma.user.findFirst({
    where: { email: env.BOOTSTRAP_ADMIN_EMAIL, platformRole: "SUPER_ADMIN" },
  });
  const admin = existingAdmin ?? await prisma.user.create({
    data: {
      name: env.BOOTSTRAP_ADMIN_NAME,
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      passwordHash: await hash(env.BOOTSTRAP_ADMIN_PASSWORD, 12),
      platformRole: "SUPER_ADMIN",
    },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: { roleId: role.id, branchId: branch.id, active: true },
    create: { tenantId: tenant.id, userId: admin.id, roleId: role.id, branchId: branch.id },
  });

  console.log(`Bootstrap listo para ${tenant.slug}; no se borró ni reemplazó información existente.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
