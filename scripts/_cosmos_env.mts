// cosmos-live.mts의 비대화형 래퍼 — COSMOS_ID/COSMOS_PW 환경변수로 자격증명 전달.
import { writeFileSync } from 'node:fs';
import { connectSchool } from '../lib/server/school.ts';
import { pendingTasks, dueSoon } from '../lib/data/lms.ts';

const studentId = process.env.COSMOS_ID ?? '';
const password = process.env.COSMOS_PW ?? '';
if (!studentId || !password) {
  console.error('COSMOS_ID/COSMOS_PW 환경변수가 필요합니다.');
  process.exit(1);
}

console.log('학교 포털 + COSMOS 연결 중…');
const t0 = Date.now();
const snap = await connectSchool(studentId, password);
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

console.log(`포털: ${snap.portal}`);
console.log(`COSMOS: ${snap.lms}`);
console.log(`수강 과목: ${snap.courses.length}개`);
for (const c of snap.courses) console.log(`  - [${c.id}] ${c.name}`);

if (snap.lmsData) {
  const lms = snap.lmsData;
  let vods = 0, attended = 0, assigns = 0, unsubA = 0, quizzes = 0, unsubQ = 0;
  for (const c of lms.courses) {
    vods += c.vods.length;
    attended += c.vods.filter((v) => v.attended).length;
    assigns += c.assigns.length;
    unsubA += c.assigns.filter((a) => !a.submitted).length;
    quizzes += c.quizzes.length;
    unsubQ += c.quizzes.filter((q) => !q.submitted).length;
    if (c.errors?.length)
      console.log(`  ⚠ ${c.title}: 부분 수집 실패 (${c.errors.join(', ')})`);
  }
  console.log(`\n수집 상세 (${lms.courses.length}개 과목):`);
  console.log(`  강의 ${attended}/${vods} 수강 완료`);
  console.log(`  과제 ${assigns - unsubA}/${assigns} 제출`);
  console.log(`  퀴즈 ${quizzes - unsubQ}/${quizzes} 응시`);
  const pending = pendingTasks(lms);
  const soon = dueSoon(lms, Date.now(), 7);
  console.log(`  미완료 항목 ${pending.length}개 · 7일 내 마감 ${soon.length}개`);
  writeFileSync('lms-data.json', JSON.stringify(lms, null, 2));
  console.log('\n→ lms-data.json 저장됨 (개인정보 — 공유/커밋 금지)');
} else {
  console.log('\nlmsData 없음 — COSMOS 연결 실패 또는 과목 파싱 불일치');
}
