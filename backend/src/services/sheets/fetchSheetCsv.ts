import https from 'https';
import http from 'http';

/**
 * Extract the spreadsheet ID from a Google Sheets URL.
 * Supports formats:
 *   https://docs.google.com/spreadsheets/d/{ID}/edit?...
 *   https://docs.google.com/spreadsheets/d/{ID}/export?...
 *   {ID} (raw ID)
 */
export function extractSheetId(url: string): string | null {
    // Already a raw ID (no slashes)
    if (!url.includes('/')) return url.trim() || null;

    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
}

/**
 * Build the CSV export URL for a public Google Sheet.
 * Uses /gviz/tq endpoint which is faster and doesn't require redirect handling
 * for "anyone with the link" sheets.
 * @param sheetId - The Google Sheets document ID
 * @param gid - The sheet tab GID (default: first sheet)
 */
export function buildCsvExportUrl(sheetId: string, gid?: string): string {
    const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    return gid ? `${base}&gid=${gid}` : base;
}

/**
 * Fetch CSV content from a public Google Sheet.
 * Uses the /gviz/tq endpoint which works without authentication
 * for sheets with "anyone with the link" access.
 *
 * Handles up to 5 redirects.
 */
export async function fetchSheetCsv(
    sheetsUrl: string,
    gid?: string
): Promise<string> {
    const sheetId = extractSheetId(sheetsUrl);
    if (!sheetId) {
        throw new Error(`Invalid Google Sheets URL: ${sheetsUrl}`);
    }

    const csvUrl = buildCsvExportUrl(sheetId, gid);
    return fetchWithRedirects(csvUrl, 5);
}

function fetchWithRedirects(url: string, maxRedirects: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, { headers: { 'User-Agent': 'NexusIntelligence/1.0' } }, (res) => {
            // Handle redirects (Google export URLs do 302 → final CSV)
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (maxRedirects <= 0) {
                    reject(new Error('Too many redirects'));
                    return;
                }
                resolve(fetchWithRedirects(res.headers.location, maxRedirects - 1));
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`Google Sheets returned HTTP ${res.statusCode}. Is the sheet shared as "Anyone with the link"?`));
                return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            res.on('error', reject);
        }).on('error', reject);
    });
}
