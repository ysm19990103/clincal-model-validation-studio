// Deterministic fictional observations only; no personal data files are committed.
export function fictionalCSV() {
  const lines = ['response,measurement,arm,case_code,constant,empty'];
  for (let i = 0; i < 120; i++) {
    const response = i === 118 ? 'NA' : i === 119 ? '' : i % 2 ? '1' : '01';
    const measurement = i === 5 ? 'invalid' : i === 8 ? 'NA' : String(10 + (i * 17) % 43);
    lines.push([response, measurement, i % 3 + 1, `fictional-row-${i}`, 'fixed', ''].join(','));
  }
  lines.push(lines[1]);
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
