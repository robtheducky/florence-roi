// Module registry. To add a buyer module: create js/modules/<name>.js with the
// same shape as population.js, import it here, and replace its roadmap stub.

import population from './population.js';

export const MODULES = [
  population,
  {
    id: 'ma',
    label: 'Medicare Advantage',
    disabled: true,
    roadmapAnchor: '1-medicare-advantage',
    teaser: 'Star Ratings impact on the Part D adherence measures and Controlling Blood Pressure, plus quality bonus and rebate dollars at stake.',
  },
  {
    id: 'aco',
    label: 'ACO (MSSP/REACH)',
    disabled: true,
    roadmapAnchor: '2-aco-mssp--aco-reach',
    teaser: 'Gross savings flowed through shared savings rate, minimum savings rate, and the quality performance standard.',
  },
  {
    id: 'commercial',
    label: 'Commercial / self-insured',
    disabled: true,
    roadmapAnchor: '3-commercial--self-insured',
    teaser: 'PEPM pricing, commercial unit costs, and medical trend. Productivity impact optional.',
  },
];

export const DEFAULT_MODULE = 'population';

export function getModule(id) {
  return MODULES.find((m) => m.id === id && !m.disabled) ?? MODULES.find((m) => m.id === DEFAULT_MODULE);
}
