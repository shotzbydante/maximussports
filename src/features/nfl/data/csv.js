/**
 * Minimal RFC 4180 CSV reader. No dependencies, handles quoted fields,
 * escaped quotes and CRLF. Returns one object per row keyed by the header.
 *
 * `pick` limits the columns kept, which matters for the nflverse player
 * file (several megabytes, 100+ columns, of which the engine reads ten).
 */
export function parseCsv(text, { pick = null, filter = null } = {}) {
  const rows = [];
  if (typeof text !== 'string' || text.length === 0) return rows;

  let header = null;
  let keep = null;
  let field = '';
  let record = [];
  let inQuotes = false;

  const endRecord = () => {
    record.push(field);
    field = '';
    if (!header) {
      header = record.map((h) => h.trim());
      keep = pick ? header.map((h) => pick.includes(h)) : null;
    } else if (record.length > 1 || record[0] !== '') {
      const obj = {};
      for (let i = 0; i < header.length; i++) {
        if (keep && !keep[i]) continue;
        obj[header[i]] = record[i] ?? '';
      }
      if (!filter || filter(obj)) rows.push(obj);
    }
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n') endRecord();
    else if (c !== '\r') field += c;
  }
  if (field !== '' || record.length > 0) endRecord();
  return rows;
}

/** nflverse writes missing values as '' or 'NA'. */
export function csvNum(v) {
  if (v == null || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
