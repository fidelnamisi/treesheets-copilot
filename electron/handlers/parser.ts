
import { ipcMain } from 'electron';
import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';

const inflate = promisify(zlib.inflate);

export const IPC_CHANNELS_PARSER = {
    PARSE_CTS_FILE: 'parse-cts-file',
};

const TSFF_MAGIC = 'TSFF';

/**
 * Find all zlib streams in the file buffer.
 */
async function findAllZlibStreams(fileBuffer: Buffer, headerSize: number): Promise<Buffer[]> {
    const results: { data: Buffer; textScore: number }[] = [];

    for (let i = headerSize; i < fileBuffer.length - 2; i++) {
        if (fileBuffer[i] === 0x78 && (fileBuffer[i + 1] === 0xda || fileBuffer[i + 1] === 0x9c || fileBuffer[i + 1] === 0x01 || fileBuffer[i + 1] === 0x5e)) {
            try {
                const inflated = await inflate(fileBuffer.slice(i));
                if (inflated.length > 50) {
                    // Score by readable text content
                    const text = inflated.toString('utf-8');
                    const meaningful = text.match(/[A-Za-z][A-Za-z0-9 ,.!?'":;\-()\/]{5,}/g);
                    const score = meaningful ? meaningful.length : 0;
                    results.push({ data: inflated, textScore: score });
                }
                i += 50; // Skip ahead past this stream
            } catch {
                // Not a valid zlib stream
            }
        }
    }

    results.sort((a, b) => b.textScore - a.textScore);
    return results.map(r => r.data);
}

/**
 * Extract clean text from inflated binary data using a two-pass approach:
 * Pass 1: Scan for contiguous runs of printable characters
 * Pass 2: Clean and de-duplicate the extracted segments
 * 
 * This avoids the length-prefix heuristic which is fragile and gives
 * corrupted text when it lands on the wrong offset.
 */
function extractCleanText(data: Buffer): string[] {
    const segments: string[] = [];
    let i = 0;

    while (i < data.length) {
        // Look for the start of a printable text run
        let textStart = -1;
        let printableRun = 0;

        while (i < data.length) {
            const b = data[i];
            const isPrintable = (b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9;
            // UTF-8 multi-byte sequences (e.g. smart quotes, accented chars)
            const isUtf8Start = (b >= 0xC2 && b <= 0xF4);

            if (isPrintable) {
                if (textStart < 0) textStart = i;
                printableRun++;
                i++;
            } else if (isUtf8Start && i + 1 < data.length) {
                // Could be valid UTF-8 — check continuation bytes
                let bytesNeeded = 0;
                if (b < 0xE0) bytesNeeded = 2;
                else if (b < 0xF0) bytesNeeded = 3;
                else bytesNeeded = 4;

                let valid = true;
                for (let j = 1; j < bytesNeeded && i + j < data.length; j++) {
                    if ((data[i + j] & 0xC0) !== 0x80) { valid = false; break; }
                }

                if (valid && i + bytesNeeded <= data.length) {
                    if (textStart < 0) textStart = i;
                    printableRun += bytesNeeded;
                    i += bytesNeeded;
                } else {
                    // End of text run
                    if (printableRun >= 2 && textStart >= 0) {
                        const raw = data.slice(textStart, i).toString('utf-8').trim();
                        if (raw.length >= 2) {
                            segments.push(raw);
                        }
                    }
                    textStart = -1;
                    printableRun = 0;
                    i++;
                }
            } else {
                // Non-printable character — end of text run
                if (printableRun >= 2 && textStart >= 0) {
                    const raw = data.slice(textStart, i).toString('utf-8').trim();
                    if (raw.length >= 2) {
                        segments.push(raw);
                    }
                }
                textStart = -1;
                printableRun = 0;
                i++;
            }
        }

        // Handle final segment
        if (printableRun >= 2 && textStart >= 0) {
            const raw = data.slice(textStart, i).toString('utf-8').trim();
            if (raw.length >= 2) {
                segments.push(raw);
            }
        }
        break;
    }

    return segments;
}

/**
 * Post-process extracted text segments:
 * - Remove pure binary/formatting noise
 * - Deduplicate
 * - Merge fragments that belong together
 */
function cleanAndFilterSegments(segments: string[]): string[] {
    const cleaned: string[] = [];
    const seenExact = new Set<string>();

    for (const seg of segments) {
        // Strip any remaining non-printable Unicode characters
        const stripped = seg.replace(/[\x00-\x1f\x7f-\x9f\ufffd]/g, '').trim();

        if (stripped.length < 2) continue;

        // Skip pure formatting/noise patterns
        if (/^[A-Z][?][A-Z]$/.test(stripped)) continue;  // "h?X" style noise
        if (/^[a-z][A-Z]$/.test(stripped)) continue;      // "jZ" style noise
        if (/^[0-9A-Fa-f]{2,6}$/.test(stripped)) continue; // hex values
        if (/^[A-Z]{1,3}$/.test(stripped) && stripped.length <= 2) continue; // short codes
        // Short random-looking strings (not real words)
        if (stripped.length <= 4 && !/^[A-Za-z]+$/.test(stripped)) continue;
        if (stripped.length <= 3 && /[^A-Za-z0-9 ]/.test(stripped)) continue;

        // Skip if it's just a single weird character repeated
        if (/^(.)\1+$/.test(stripped)) continue;

        // Deduplicate exact matches
        if (seenExact.has(stripped)) continue;
        seenExact.add(stripped);

        cleaned.push(stripped);
    }

    return cleaned;
}

/**
 * Deduplicate by checking if a string is a substring of a later, longer string.
 * This handles cases where the same text appears both as a fragment and 
 * as part of a longer passage.
 */
function deduplicateSubstrings(texts: string[]): string[] {
    const result: string[] = [];

    for (let i = 0; i < texts.length; i++) {
        const current = texts[i];
        let isSubstring = false;

        // Check if this text is a substring of any other (longer) text
        for (let j = 0; j < texts.length; j++) {
            if (i === j) continue;
            if (texts[j].length > current.length && texts[j].includes(current)) {
                isSubstring = true;
                break;
            }
        }

        if (!isSubstring) {
            result.push(current);
        }
    }

    return result;
}

/**
 * Format extracted texts into a structured, readable document.
 * Uses indentation to preserve TreeSheets grid hierarchy.
 */
function formatAsDocument(texts: string[], fileName: string): string {
    if (texts.length === 0) return '(No text content found)';

    let result = `# ${fileName}\n\n`;

    for (const text of texts) {
        // Detect section headers (ALL CAPS, reasonable length)
        const isHeader = /^[A-Z][A-Z0-9 :,\/\-&']{2,}$/.test(text) && text.length <= 80;
        // Detect labels like "EP 3: JOURNEY TO FATHERHOOD"
        const isEpisodeHeader = /^EP\s+\d/i.test(text) || /^(CHAPTER|PART|ACT|SCENE)\s+\d/i.test(text);

        if (isHeader || isEpisodeHeader) {
            result += `\n## ${text}\n\n`;
        } else if (text.startsWith('- ') || text.startsWith('* ')) {
            // Bullet points — preserve as-is
            result += `${text}\n\n`;
        } else {
            result += `${text}\n\n`;
        }
    }

    return result;
}

export const registerParserHandlers = () => {
    ipcMain.handle(IPC_CHANNELS_PARSER.PARSE_CTS_FILE, async (_, filePath: string) => {
        try {
            // 1. Read file
            const fileBuffer = await fs.readFile(filePath);

            // 2. Verify TSFF magic
            const magic = fileBuffer.slice(0, 4).toString('ascii');
            if (magic !== TSFF_MAGIC) {
                return {
                    success: false,
                    error: `Not a valid TreeSheets file (expected TSFF header, got "${magic}")`
                };
            }

            // 3. Find and inflate all zlib data streams (sorted by text score)
            const streams = await findAllZlibStreams(fileBuffer, 4);
            if (streams.length === 0) {
                return {
                    success: false,
                    error: 'Could not find compressed data in the TreeSheets file'
                };
            }

            // 4. Extract text from the best stream using clean text extraction
            const rawSegments = extractCleanText(streams[0]);

            // 5. Clean and filter
            let texts = cleanAndFilterSegments(rawSegments);

            // 6. Deduplicate substrings (remove fragments that are part of longer passages)
            texts = deduplicateSubstrings(texts);

            if (texts.length === 0) {
                return {
                    success: false,
                    error: 'TreeSheets file parsed but no text content found'
                };
            }

            // 7. Format into a readable document
            const fileName = filePath.split('/').pop() || filePath;
            const content = formatAsDocument(texts, fileName);

            console.log(`[Parser] Successfully parsed ${fileName}: ${texts.length} text items extracted (clean)`);

            return { success: true, content };

        } catch (error: any) {
            console.error('[Parser] Error parsing .cts file:', error);
            return { success: false, error: error.message };
        }
    });
};
