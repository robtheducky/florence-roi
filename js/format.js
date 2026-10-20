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
    case 'odds': return value.toFixed(2);
    case 'prob3': return value.toFixed(3);
    default: return String(value);
  }
}
