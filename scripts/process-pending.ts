import prisma from '@/lib/db/prisma';
import { processCrawlJobById } from '@/services/crawl/processJob';

async function main() {
  const pending = await prisma.crawlJob.findMany({
    where: { status: 'pending' },
    include: { source: true },
  });

  console.log(`Found ${pending.length} pending job(s)`);

  for (const job of pending) {
    const log = await prisma.crawlLog.findFirst({
      where: { sourceId: job.sourceId, status: 'running' },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`Processing job ${job.id} (${job.url})...`);
    await processCrawlJobById({ jobId: job.id, logId: log?.id });
  }

  const count = await prisma.article.count();
  console.log(`Done. Total articles: ${count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
