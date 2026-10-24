// Mencegah CSV formula injection: sel yang diawali = + - @ tab/CR diberi prefiks apostrof.
function safeCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(columns, rows) {
  const header = columns.map((c) => safeCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => safeCell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

module.exports = { toCsv, safeCell };
