import { PrismaClient } from '@prisma/client';
import { env } from '../src/lib/env';
import { createDemoProducts, demoProductSource } from '../src/lib/demoCatalog';

const prisma = new PrismaClient();

async function seedDemoCatalog() {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed synthetic demo products in production');
  }

  if (!process.argv.includes('--confirm-demo-seed')) {
    throw new Error('Pass --confirm-demo-seed to seed or replace the demo catalogue');
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed the demo catalogue');
  }

  const products = createDemoProducts();
  const result = await prisma.$transaction(async (transaction) => {
    const deleted = await transaction.product.deleteMany({
      where: { source: demoProductSource },
    });
    const created = await transaction.product.createMany({ data: products });
    return { deleted: deleted.count, created: created.count };
  });

  console.log(
    `Seeded ${result.created} fictional demo products (${result.deleted} previous demo records replaced).`,
  );
}

seedDemoCatalog()
  .catch((error: unknown) => {
    console.error('Demo catalogue seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
