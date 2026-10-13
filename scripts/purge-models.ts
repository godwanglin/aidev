import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Checking models in database...");
  const beforeCount = await prisma.aiModel.count();
  console.log("Total AiModel before:", beforeCount);

  const deleted = await prisma.aiModel.deleteMany({
    where: {
      OR: [
        { provider: "CUSTOM_STUDENT_PREMIUM" },
        { provider: "STUDENT_PREMIUM" },
        { provider: "GEMINI_CLI" },
        { modelId: { startsWith: "stdprm/" } },
        { modelId: { startsWith: "bzl/" } },
      ],
    },
  });

  console.log("Deleted AiModel count:", deleted.count);
  const afterCount = await prisma.aiModel.count();
  console.log("Total AiModel after:", afterCount);

  const models = await prisma.aiModel.findMany({ select: { provider: true, modelId: true } });
  const byProv: Record<string, number> = {};
  for (const m of models) {
    byProv[m.provider] = (byProv[m.provider] || 0) + 1;
  }
  console.log("Remaining models per provider in DB:", JSON.stringify(byProv, null, 2));
}

main()
  .catch((e) => {
    console.error("Error purging models:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
