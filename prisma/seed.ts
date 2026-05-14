import { PrismaClient } from './generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenants = await Promise.all([
    prisma.tenant.create({
      data: { name: 'Tenant A', ncGroupId: 'tenant-a' },
    }),
    prisma.tenant.create({
      data: { name: 'Tenant B', ncGroupId: 'tenant-b' },
    }),
  ]);

  const hash = await bcrypt.hash('password123', 10);

  const users = [
    {
      email: 'user-a1@datco.kr',
      ncUserId: 'user-a1',
      role: 'admin',
      tenantId: tenants[0].tenantId,
    },
    {
      email: 'user-a2@datco.kr',
      ncUserId: 'user-a2',
      role: 'user',
      tenantId: tenants[0].tenantId,
    },
    {
      email: 'user-a3@datco.kr',
      ncUserId: 'user-a3',
      role: 'user',
      tenantId: tenants[0].tenantId,
    },
    {
      email: 'user-b1@datco.kr',
      ncUserId: 'user-b1',
      role: 'admin',
      tenantId: tenants[1].tenantId,
    },
    {
      email: 'user-b2@datco.kr',
      ncUserId: 'user-b2',
      role: 'user',
      tenantId: tenants[1].tenantId,
    },
    {
      email: 'user-b3@datco.kr',
      ncUserId: 'user-b3',
      role: 'user',
      tenantId: tenants[1].tenantId,
    },
  ];

  for (const u of users) {
    await prisma.user.create({
      data: { ...u, passwordHash: hash },
    });
  }

  console.log('Seed complete: 2 tenants, 6 users');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
