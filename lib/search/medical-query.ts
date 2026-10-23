export function normalizeMedicalSearchQuery(value: string) {
  const query = value.trim().replace(/\s+/g, ' ');
  if (/^(هايبر\s*كاليما|hyper\s*kaliema|hyperkaliema)$/iu.test(query)) return 'hyperkalemia';
  return query.slice(0, 120);
}
