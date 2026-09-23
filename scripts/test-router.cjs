const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test what router does for jrt/gpt-5.6-luna
async function test() {
  const norm = {
    rawModel: 'jrt/gpt-5.6-luna',
    cleanModel: 'gpt-5.6-luna',
    upstreamModel: 'jrt/gpt-5.6-luna',
    providerId: null,
  };

  const targetProvider = norm.providerId || undefined;
  console.log('targetProvider:', targetProvider);

  const whereClause = {
    isActive: true,
    OR: [
      { cooldownUntil: null },
      { cooldownUntil: { lt: new Date() } }
    ]
  };

  const connections = await prisma.providerConnection.findMany({
    where: whereClause,
    orderBy: [
      { priority: 'asc' },
      { weight: 'desc' }
    ]
  });

  console.log('Found connections:', connections.length);
  for (const c of connections) {
    console.log(`- ${c.name} (${c.provider}), apiKeyEncrypted: ${Boolean(c.apiKeyEncrypted)}, accessTokenEnc: ${Boolean(c.accessTokenEnc)}`);
  }
}

test().finally(() => prisma.$disconnect());
