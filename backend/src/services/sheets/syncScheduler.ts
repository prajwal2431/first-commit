import { DataSource, IDataSource } from '../../models/DataSource';
import { fetchSheetCsv } from './fetchSheetCsv';
import { ingestCsvContent } from './ingestCsvContent';
import { computeAllMonitors } from '../monitors/computeAll';

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let syncTimer: NodeJS.Timeout | null = null;

/**
 * Sync a single sheets-type data source.
 * Fetches fresh CSV from Google Sheets, auto-detects data type,
 * replaces existing records, and returns the result.
 */
export async function syncSingleSheetSource(
    source: IDataSource
): Promise<{ inserted: number; dataType: string } | null> {
    if (!source.sheetsUrl) {
        console.warn(`[sheets-sync] Source ${source._id} has no sheetsUrl, skipping`);
        return null;
    }

    const sourceId = String(source._id);
    const orgId = source.organizationId;

    try {
        // Mark as syncing
        await DataSource.updateOne({ _id: source._id }, { status: 'syncing' });

        console.log(`[sheets-sync] Fetching CSV for source=${sourceId} org=${orgId}`);
        const csvContent = await fetchSheetCsv(source.sheetsUrl);

        console.log(`[sheets-sync] Ingesting CSV (${csvContent.length} bytes) for source=${sourceId}`);
        const result = await ingestCsvContent(csvContent, sourceId, orgId, {
            replaceExisting: true, // Always replace for clean sync
        });

        // Update source metadata
        await DataSource.updateOne(
            { _id: source._id },
            {
                status: 'connected',
                recordCount: result.inserted,
                lastSyncAt: new Date(),
                errorMessage: undefined,
            }
        );

        console.log(
            `[sheets-sync] ✓ source=${sourceId} type=${result.dataType} inserted=${result.inserted} skipped=${result.skipped}`
        );

        return { inserted: result.inserted, dataType: result.dataType };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        console.error(`[sheets-sync] ✗ source=${sourceId}: ${message}`);

        await DataSource.updateOne(
            { _id: source._id },
            { status: 'failed', errorMessage: message }
        );

        return null;
    }
}

/**
 * Run a full sync cycle:
 * 1. Find all sheets-type data sources across all organizations
 * 2. Fetch & ingest each one
 * 3. Recompute monitors for each affected organization
 */
export async function runSyncCycle(): Promise<void> {
    console.log('[sheets-sync] ── Starting sync cycle ──');
    const start = Date.now();

    // Find all sheet sources that have a URL
    const sheetSources = await DataSource.find({
        sheetsUrl: { $exists: true, $ne: '' },
        status: { $ne: 'disconnected' },
    }).lean();

    if (sheetSources.length === 0) {
        console.log('[sheets-sync] No sheet sources found, skipping cycle');
        return;
    }

    console.log(`[sheets-sync] Found ${sheetSources.length} sheet source(s) to sync`);

    // Track which orgs need monitor recompute
    const affectedOrgs = new Set<string>();
    let totalInserted = 0;

    for (const source of sheetSources) {
        const result = await syncSingleSheetSource(source as unknown as IDataSource);
        if (result && result.inserted > 0) {
            affectedOrgs.add(source.organizationId);
            totalInserted += result.inserted;
        }
    }

    // Recompute monitors for all affected organizations
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

/**
 * Start the periodic sync scheduler.
 * Runs an initial sync immediately, then every SYNC_INTERVAL_MS.
 */
export function startSyncScheduler(): void {
    if (syncTimer) {
        console.warn('[sheets-sync] Scheduler already running');
        return;
    }

    console.log(`[sheets-sync] Starting scheduler (interval: ${SYNC_INTERVAL_MS / 1000}s)`);

    // Run first sync after a short delay (let DB connections settle)
    setTimeout(() => {
        runSyncCycle().catch(err => {
            console.error('[sheets-sync] Initial sync cycle error:', err);
        });
    }, 5_000);

    // Then run periodically
    syncTimer = setInterval(() => {
        runSyncCycle().catch(err => {
            console.error('[sheets-sync] Periodic sync cycle error:', err);
        });
    }, SYNC_INTERVAL_MS);
}

/**
 * Stop the periodic sync scheduler.
 */
export function stopSyncScheduler(): void {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
        console.log('[sheets-sync] Scheduler stopped');
    }
}
