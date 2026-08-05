import prisma from '@/lib/db/prisma';

async function main() {
  const result = await prisma.article.updateMany({
    where: { isDuplicate: true },
    data: { isDuplicate: false, duplicateOf: null },
  });
  const visible = await prisma.article.count({ where: { isDuplicate: false } });
  console.log(`Reset ${result.count} articles. Visible now: ${visible}`);
}

main().finally(() => prisma.$disconnect());
