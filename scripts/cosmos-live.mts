// 실계정 COSMOS 연결 테스트 — 서버 수집 경로 전체를 실제로 실행한다.
// 실행: node --experimental-transform-types scripts/cosmos-live.mts
// 학번/비밀번호는 프롬프트로 입력 (인자/파일로 저장되지 않음).
// 성공 시 lms-data.json이 생성된다 (gitignore 처리됨 — 개인정보).
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { connectSchool } from '../lib/server/school.ts';
import { pendingTasks, dueSoon } from '../lib/data/lms.ts';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) =>
  new Promise<string>((res) => rl.question(q, (a) => res(a.trim())));

const studentId = await ask('학번: ');
const password = await ask('비밀번호(화면에 보입니다): ');
rl.close();
if (!studentId || !password) {
  console.error('학번과 비밀번호가 필요합니다.');
  process.exit(1);
}

console.log('\n학교 포털 + COSMOS 연결 중… (수십 초 걸릴 수 있음)');
const t0 = Date.now();
const snap = await connectSchool(studentId, password);
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

console.log(`포털: ${snap.portal}`);
console.log(`COSMOS: ${snap.lms}`);
console.log(`수강 과목: ${snap.courses.length}개`);
for (const c of snap.courses) console.log(`  - [${c.id}] ${c.name}`);

if (snap.lmsData) {
  const lms = snap.lmsData;
  let vods = 0,
    attended = 0,
    assigns = 0,
    unsubA = 0,
    quizzes = 0,
    unsubQ = 0;
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
