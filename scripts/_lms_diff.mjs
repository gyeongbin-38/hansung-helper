import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../lms-data.json', import.meta.url), 'utf8'));
for (const c of d.courses)
  console.log(c.id, c.title.slice(0, 34), 'vods:' + c.vods.length, 'assigns:' + c.assigns.length, 'quizzes:' + c.quizzes.length, 'ranges:' + (c.ranges?.length ?? '-'), 'errors:' + JSON.stringify(c.errors));
