import { prisma } from "@/lib/prisma";

let cachedRtkActive: boolean | null = null;
let cacheExpiresAt = 0;

/**
 * Returns whether RTK Token Saver is enabled globally.
 * Uses a 15-second in-memory cache to prevent database load on every AI request.
 */
export async function isRtkEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedRtkActive !== null && now < cacheExpiresAt) {
    return cachedRtkActive;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { id: "global_config" },
      select: { rtkCompressionActive: true },
    });

    // Default to true if not explicitly set
    cachedRtkActive = setting?.rtkCompressionActive ?? true;
  } catch {
    try {
      const rows: any = await prisma.$queryRawUnsafe(
        `SELECT rtkCompressionActive FROM SystemSetting WHERE id = 'global_config' LIMIT 1`
      );
      if (rows && rows.length > 0) {
        cachedRtkActive = Boolean(rows[0].rtkCompressionActive);
      } else {
        cachedRtkActive = true;
      }
    } catch {
      cachedRtkActive = true;
    }
  }

  cacheExpiresAt = now + 15000;
  return cachedRtkActive;
}

/**
 * Updates the global RTK Token Saver toggle in the database and updates the in-memory cache.
 */
export async function setRtkEnabled(enabled: boolean): Promise<void> {
  try {
    await prisma.systemSetting.upsert({
      where: { id: "global_config" },
      create: {
        id: "global_config",
        rtkCompressionActive: enabled,
      },
      update: {
        rtkCompressionActive: enabled,
      },
    });
  } catch (err: any) {
    // If in-memory Prisma client was booted before schema update, execute raw SQL directly
    await prisma.$executeRawUnsafe(
      `INSERT INTO SystemSetting (id, rtkCompressionActive, updatedAt) 
       VALUES ('global_config', ${enabled ? 1 : 0}, NOW()) 
       ON DUPLICATE KEY UPDATE rtkCompressionActive = ${enabled ? 1 : 0}, updatedAt = NOW()`
    );
  }

  cachedRtkActive = enabled;
  cacheExpiresAt = Date.now() + 15000;
}

/**
 * Invalidates the in-memory cache for RTK toggle.
 */
export function invalidateRtkCache(): void {
  cachedRtkActive = null;
  cacheExpiresAt = 0;
}
