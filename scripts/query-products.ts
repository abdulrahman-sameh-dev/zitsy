import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/zitsy_store',
  max: 1
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error'] });

async function main() {
  try {
    const products = await prisma.product.findMany({
      where: { visible: true },
      include: {
        images: { orderBy: [{ isDefault: 'desc' }, { position: 'asc' }] },
        variants: { orderBy: { title: 'asc' } },
        categories: true,
      },
      orderBy: { title: 'asc' },
    });
    console.log('Total products:', products.length);
    for (const p of products) {
      console.log('  -', p.slug, '|', p.title, '| GBP', p.minPriceMinor, '|', p.printifyId, '|', p.createdAt);
    }
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}

main();
