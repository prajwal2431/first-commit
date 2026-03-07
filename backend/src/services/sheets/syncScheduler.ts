import { updateDataSource, listSheetSources } from '../../db/dataSourceRepo';
import type { IDataSource } from '../../models/DataSource';
import { fetchSheetCsv } from './fetchSheetCsv';
import { ingestCsvContent } from './ingestCsvContent';
import { computeAllMonitors } from '../monitors/computeAll';

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let syncTimer: NodeJS.Timeout | null = null;

export async function syncSingleSheetSource(
  source: IDataSource
): Promise<{ inserted: number; dataType: string } | null> {
  if (!source.sheetsUrl) {
    console.warn(`[sheets-sync] Source ${source.sourceId} has no sheetsUrl, skipping`);
    return null;
  }

  const sourceId = source.sourceId;
  const orgId = source.organizationId;

  try {
    await updateDataSource(orgId, sourceId, { status: 'syncing' });

    console.log(`[sheets-sync] Fetching CSV for source=${sourceId} org=${orgId}`);
    const csvContent = await fetchSheetCsv(source.sheetsUrl);

    console.log(`[sheets-sync] Ingesting CSV (${csvContent.length} bytes) for source=${sourceId}`);
    const result = await ingestCsvContent(csvContent, sourceId, orgId, {
      replaceExisting: true,
    });

    await updateDataSource(orgId, sourceId, {
      status: 'connected',
      recordCount: result.inserted,
      lastSyncAt: new Date().toISOString(),
      errorMessage: undefined,
    });

    console.log(
      `[sheets-sync] ✓ source=${sourceId} type=${result.dataType} inserted=${result.inserted} skipped=${result.skipped}`
    );

    return { inserted: result.inserted, dataType: result.dataType };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    console.error(`[sheets-sync] ✗ source=${sourceId}: ${message}`);

    await updateDataSource(orgId, sourceId, { status: 'failed', errorMessage: message });

    return null;
  }
}

export async function runSyncCycle(): Promise<void> {
  console.log('[sheets-sync] ── Starting sync cycle ──');
  const start = Date.now();

  const sheetSources = await listSheetSources();

  if (sheetSources.length === 0) {
    console.log('[sheets-sync] No sheet sources found, skipping cycle');
    return;
  }

  console.log(`[sheets-sync] Found ${sheetSources.length} sheet source(s) to sync`);

  const affectedOrgs = new Set<string>();
  let totalInserted = 0;

  for (const source of sheetSources) {
    const result = await syncSingleSheetSource(source);
    if (result && result.inserted > 0) {
      affectedOrgs.add(source.organizationId);
      totalInserted += result.inserted;
    }
  }

  for (const orgId of affectedOrgs) {
    try {
      console.log(`[sheets-sync] Recomputing monitors for org=${orgId}`);
      await computeAllMonitors(orgId);
    } catch (err) {
      console.error(`[sheets-sync] Monitor recompute failed for org=${orgId}:`, err);
    }
  }

  const elapsed = Date.now() - start;
  console.log(
    `[sheets-sync] ── Cycle complete: ${sheetSources.length} sources, ` +
      `${totalInserted} records, ${affectedOrgs.size} orgs recomputed in ${elapsed}ms ──`
  );
}

export function startSyncScheduler(): void {
  if (syncTimer) {
    console.warn('[sheets-sync] Scheduler already running');
    return;
  }

  console.log(`[sheets-sync] Starting scheduler (interval: ${SYNC_INTERVAL_MS / 1000}s)`);

  setTimeout(() => {
    runSyncCycle().catch((err) => {
      console.error('[sheets-sync] Initial sync cycle error:', err);
    });
  }, 5_000);

  syncTimer = setInterval(() => {
    runSyncCycle().catch((err) => {
      console.error('[sheets-sync] Periodic sync cycle error:', err);
    });
  }, SYNC_INTERVAL_MS);
}

export function stopSyncScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[sheets-sync] Scheduler stopped');
  }
}
