import prisma from '@/lib/db/prisma';

async function main() {
  const total = await prisma.article.count();
  const nonDup = await prisma.article.count({ where: { isDuplicate: false } });
  const dup = await prisma.article.count({ where: { isDuplicate: true } });
  const nullUser = await prisma.article.count({ where: { userId: null } });
  const withUser = await prisma.article.count({ where: { userId: { not: null } } });

  const articles = await prisma.article.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      userId: true,
      isDuplicate: true,
      status: true,
      source: { select: { name: true, userId: true } },
    },
  });

  const jobs = await prisma.crawlJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, url: true, error: true, result: true },
  });

  const logs = await prisma.crawlLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { status: true, pagesCrawled: true, pagesTotal: true, error: true },
  });

  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  console.log('--- COUNTS ---');
  console.log({ total, nonDup, dup, nullUser, withUser });
  console.log('--- USERS ---', users);
  console.log('--- ARTICLES ---');
  articles.forEach((a) =>
    console.log(`  [dup=${a.isDuplicate}] userId=${a.userId ?? 'null'} src=${a.source.name} | ${a.title.slice(0, 50)}`)
  );
  console.log('--- JOBS ---', jobs);
  console.log('--- LOGS ---', logs);
}

main().finally(() => prisma.$disconnect());
