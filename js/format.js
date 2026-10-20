// Number formatting shared by modules and the UI. Pure, no DOM.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Unicode minus reads better than a hyphen in large figures.
const signed = (s) => s.replace('-', '−');

export function fmt(value, format) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  switch (format) {
    case 'currency0': return signed(usd0.format(value));
    case 'currency2': return signed(usd2.format(value));
    case 'number0': return signed(int.format(value));
    case 'number1': return signed(one.format(value));
    case 'percent0': return `${signed(int.format(value * 100))}%`;
    case 'percent1': return `${signed(one.format(value * 100))}%`;
    case 'multiple': return `${signed(one.format(value))}×`;
    case 'currencyCompact': return compactCurrency(value);
    case 'odds': return value.toFixed(2);
    case 'prob3': return value.toFixed(3);
    default: return String(value);
  }
}

// $1.2M, -$350K, $900: for axis ticks and dense labels.
function compactCurrency(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '\u2212' : '';
  if (a >= 1e9) return `${sign}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

const trim = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ''));
