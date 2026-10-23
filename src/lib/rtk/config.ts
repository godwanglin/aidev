import { prisma } from "@/lib/prisma";

export interface RtkSettings {
  rtkCompressionActive: boolean;
  autoCompressActive: boolean;
  autoCompressThresholdPct: number;
}

let cachedSettings: RtkSettings | null = null;
let cacheExpiresAt = 0;

/**
 * Returns complete RTK & Auto Context Compression settings globally.
 * Uses a 15-second in-memory cache to prevent database load on every AI request.
 */
export async function getRtkSettings(): Promise<RtkSettings> {
  const now = Date.now();
  if (cachedSettings !== null && now < cacheExpiresAt) {
    return cachedSettings;
  }

  const defaults: RtkSettings = {
    rtkCompressionActive: true,
    autoCompressActive: true,
    autoCompressThresholdPct: 50,
  };

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { id: "global_config" },
      select: {
        rtkCompressionActive: true,
        autoCompressActive: true,
        autoCompressThresholdPct: true,
      },
    });

    if (setting) {
      cachedSettings = {
        rtkCompressionActive: setting.rtkCompressionActive ?? true,
        autoCompressActive: setting.autoCompressActive ?? true,
        autoCompressThresholdPct:
          typeof setting.autoCompressThresholdPct === "number"
            ? setting.autoCompressThresholdPct
            : 50,
      };
    } else {
      cachedSettings = defaults;
    }
  } catch {
    try {
      const rows: any = await prisma.$queryRawUnsafe(
        `SELECT rtkCompressionActive, autoCompressActive, autoCompressThresholdPct FROM SystemSetting WHERE id = 'global_config' LIMIT 1`
      );
      if (rows && rows.length > 0) {
        cachedSettings = {
          rtkCompressionActive:
            rows[0].rtkCompressionActive !== null && rows[0].rtkCompressionActive !== undefined
              ? Boolean(rows[0].rtkCompressionActive)
              : true,
          autoCompressActive:
            rows[0].autoCompressActive !== null && rows[0].autoCompressActive !== undefined
              ? Boolean(rows[0].autoCompressActive)
              : true,
          autoCompressThresholdPct:
            rows[0].autoCompressThresholdPct !== null && rows[0].autoCompressThresholdPct !== undefined
              ? Number(rows[0].autoCompressThresholdPct)
              : 50,
        };
      } else {
        cachedSettings = defaults;
      }
    } catch {
      cachedSettings = defaults;
    }
  }

  cacheExpiresAt = now + 15000;
  return cachedSettings;
}

/**
 * Returns whether RTK Token Saver is enabled globally.
 */
export async function isRtkEnabled(): Promise<boolean> {
  const settings = await getRtkSettings();
  return settings.rtkCompressionActive;
}

/**
 * Returns whether Auto Context Compression (Context Guard) is enabled globally
 * and its configured threshold percentage.
 */
export async function isAutoCompressEnabled(): Promise<{ active: boolean; thresholdPct: number }> {
  const settings = await getRtkSettings();
  return {
    active: settings.autoCompressActive,
    thresholdPct: settings.autoCompressThresholdPct,
  };
}

/**
 * Updates RTK and Auto Context Compression settings in the database and updates cache.
 */
export async function setRtkSettings(partial: Partial<RtkSettings>): Promise<RtkSettings> {
  const current = await getRtkSettings();
  const next: RtkSettings = {
    rtkCompressionActive:
      partial.rtkCompressionActive !== undefined
        ? Boolean(partial.rtkCompressionActive)
        : current.rtkCompressionActive,
    autoCompressActive:
      partial.autoCompressActive !== undefined
        ? Boolean(partial.autoCompressActive)
        : current.autoCompressActive,
    autoCompressThresholdPct:
      partial.autoCompressThresholdPct !== undefined
        ? Math.max(10, Math.min(95, Number(partial.autoCompressThresholdPct)))
        : current.autoCompressThresholdPct,
  };

  try {
    await prisma.systemSetting.upsert({
      where: { id: "global_config" },
      create: {
        id: "global_config",
        rtkCompressionActive: next.rtkCompressionActive,
        autoCompressActive: next.autoCompressActive,
        autoCompressThresholdPct: next.autoCompressThresholdPct,
      },
      update: {
        rtkCompressionActive: next.rtkCompressionActive,
        autoCompressActive: next.autoCompressActive,
        autoCompressThresholdPct: next.autoCompressThresholdPct,
      },
    });
  } catch {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO SystemSetting (id, rtkCompressionActive, autoCompressActive, autoCompressThresholdPct, updatedAt) 
         VALUES ('global_config', ${next.rtkCompressionActive ? 1 : 0}, ${next.autoCompressActive ? 1 : 0}, ${next.autoCompressThresholdPct}, NOW()) 
         ON DUPLICATE KEY UPDATE 
           rtkCompressionActive = ${next.rtkCompressionActive ? 1 : 0}, 
           autoCompressActive = ${next.autoCompressActive ? 1 : 0}, 
           autoCompressThresholdPct = ${next.autoCompressThresholdPct}, 
           updatedAt = NOW()`
      );
    } catch (e: any) {
      console.error("[RTK] Failed to save settings to database:", e);
    }
  }

  cachedSettings = next;
  cacheExpiresAt = Date.now() + 15000;
  return next;
}

/**
 * Updates the global RTK Token Saver toggle in the database and updates the in-memory cache.
 */
export async function setRtkEnabled(enabled: boolean): Promise<void> {
  await setRtkSettings({ rtkCompressionActive: enabled });
}

/**
 * Invalidates the in-memory cache for RTK toggle.
 */
export function invalidateRtkCache(): void {
  cachedSettings = null;
  cacheExpiresAt = 0;
}
