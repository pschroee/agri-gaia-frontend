// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * Parses delimited text (CSV with ",", TSV with a tab) after RFC 4180: a field in double quotes may contain the
 * separator, line breaks and doubled quotes. Returns the first maxRows records and the total number of records.
 * A final line break does not start an empty record; a leading byte order mark is skipped. Pure logic for the file
 * preview (issue #74).
 */
export function parseDelimited(text: string, sep: string, maxRows: number): { rows: string[][]; total: number } {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows: string[][] = [];
    let total = 0;
    let record: string[] = [];
    let field = '';
    let quoted = false;
    let pending = false; // a record has started
    const endRecord = () => {
        record.push(field);
        total += 1;
        if (rows.length < maxRows) rows.push(record);
        record = [];
        field = '';
        pending = false;
    };
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (quoted) {
            if (c === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i += 2;
                } else {
                    quoted = false;
                    i += 1;
                }
            } else {
                field += c;
                i += 1;
            }
            continue;
        }
        if (c === '"' && field === '') {
            quoted = true;
            pending = true;
            i += 1;
        } else if (c === sep) {
            record.push(field);
            field = '';
            pending = true;
            i += 1;
        } else if (c === '\r' || c === '\n') {
            endRecord();
            i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
        } else {
            field += c;
            pending = true;
            i += 1;
        }
    }
    if (pending || field !== '' || record.length > 0) endRecord();
    return { rows, total };
}
