import c from '../lib/data/catalog-2026-2.json' with { type: 'json' };
const s = new Set(c.sections.map((x) => x.section));
console.log([...s].sort().join(','));
const profs = c.sections.filter((x) => x.professor).length;
console.log('with prof:', profs, '/', c.sections.length);
