const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function backup() {
  const tables = ['User', 'RequestLog', 'Order', 'ComboModel', 'SubscriptionTierConfig', 'ModelPricing'];
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_before_usd_${timestamp}.json`);
  const backupData = {};

  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM \`${table}\``);
    // Convert BigInt to string for JSON serialization
    const serialized = JSON.parse(JSON.stringify(rows, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    backupData[table] = serialized;
    console.log(`- Backed up ${rows.length} rows from ${table}`);
  }

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\n✅ Backup successfully saved to: ${backupFile}`);
}

backup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
