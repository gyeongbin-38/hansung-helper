/**
 * 한성 학사 도우미 — COSMOS 수집 확장 (content script, MAIN world)
 *
 * learn.hansung.ac.kr 페이지에 '학사도우미 수집' 버튼을 띄운다.
 * 클릭 시 현재 로그인 세션으로 수강 현황을 수집해 lms-data.json을
 * 다운로드한다. 셀렉터 계약은 public/lms-collect.js와 동일
 * (dotbugi 구조 기반). 데이터는 외부로 전송되지 않는다.
 */
(() => {
  if (window.__hsHelperInjected) return;
  window.__hsHelperInjected = true;

  const BASE = 'https://learn.hansung.ac.kr';
  const APP_URL = 'https://hansung-helper.gyeongbin-38.workers.dev/#lms';
  const NOT_SUBMITTED = ['미제출', 'Not submitted', '提出なし', '没有作业'];
  const BULK_APPROVED = ['일괄출석인정', 'Batch attendance'];
  const COL_WEEKLY_ATTENDANCE = ['주차 출석', 'Week attendance'];
  const COL_ATTENDANCE = ['출석', 'Attendance'];
  const COL_REQUIRED_TIME = ['출석인정 요구시간', 'Required'];

  const parser = new DOMParser();
  const fetchHtml = async (url) => {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return parser.parseFromString(await res.text(), 'text/html');
  };
  const text = (el, sel) => el.querySelector(sel)?.textContent?.trim() ?? '';
  const abs = (h) => (h.startsWith('http') ? h : BASE + h);
  const normDate = (raw) => {
    if (!raw) return null;
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    const m = s.match(
      /(\d{4})\s*[년年]\s*(\d{1,2})\s*[월月]\s*(\d{1,2})[일日]?[^\d]*(\d{1,2}:\d{2})/,
    );
    return m
      ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} ${m[4].padStart(5, '0')}`
      : s;
  };

  // ── 수강 과목 목록 (대시보드) ────────────────────────────────
  function listCourses() {
    return Array.from(
      document.querySelectorAll('.my-course-lists > li'),
    ).flatMap((li) => {
      const link = li.querySelector('a.course_link');
      const id = link?.getAttribute('href')?.match(/id=(\d+)/)?.[1];
      const titleEl = li.querySelector(
        '.course-title h1, .course-title h2, .course-title h3',
      );
      const title = titleEl?.textContent?.trim();
      if (!id || !title) return [];
      return {
        id,
        title,
        prof: text(li, '.course-title p') || undefined,
        community: !!li.querySelector('.course_label_ec'),
      };
    });
  }

  // ── 과제 목록 ────────────────────────────────────────────────
  const fetchAssigns = async (id) => {
    const doc = await fetchHtml(`${BASE}/mod/assign/index.php?id=${id}`);
    let week = '';
    return Array.from(
      doc.querySelectorAll('table.generaltable tbody tr'),
    ).flatMap((row) => {
      const w = text(row, '.cell.c0');
      if (w) week = w;
      const a = row.querySelector('.cell.c1 a');
      const title = a?.textContent?.trim();
      const h = a?.getAttribute('href');
      if (!title || !h) return [];
      const dueRaw = text(row, '.cell.c2');
      const status = text(row, '.cell.c3');
      return {
        title,
        url: abs(h),
        due: dueRaw && dueRaw !== '-' ? normDate(dueRaw) : null,
        submitted: !NOT_SUBMITTED.some((k) => status.includes(k)),
      };
    });
  };

  // ── 퀴즈 목록 (제출 여부는 상세 페이지의 quizattemptsummary) ─
  const quizSubmitted = async (url) => {
    try {
      const doc = await fetchHtml(url);
      return doc.querySelectorAll('table.quizattemptsummary tbody tr').length > 0;
    } catch {
      return false;
    }
  };
  const fetchQuizzes = async (id) => {
    const doc = await fetchHtml(`${BASE}/mod/quiz/index.php?id=${id}`);
    let week = '';
    const items = Array.from(
      doc.querySelectorAll('table.generaltable tbody tr'),
    ).flatMap((row) => {
      const w = text(row, '.cell.c0');
      if (w) week = w;
      const a = row.querySelector('.cell.c1 a');
      const title = a?.textContent?.trim();
      const h = a?.getAttribute('href');
      if (!title || !h) return [];
      const dueRaw = text(row, '.cell.c2');
      return {
        title,
        url: h.startsWith('http') ? h : `${BASE}/mod/quiz/${h}`,
        due: dueRaw && dueRaw !== '-' ? normDate(dueRaw) : null,
      };
    });
    return Promise.all(
      items.map(async (it) => ({
        ...it,
        submitted: await quizSubmitted(it.url),
      })),
    );
  };

  // ── 온라인 출석부 (thead 동적 컬럼 + rowspan 평탄화) ─────────
  const fetchVods = async (id, community) => {
    const urls = community
      ? [
          `${BASE}/report/ubcompletion/user_progress.php?id=${id}`,
          `${BASE}/report/ubcompletion/user_progress_a.php?id=${id}`,
        ]
      : [
          `${BASE}/report/ubcompletion/user_progress_a.php?id=${id}`,
          `${BASE}/report/ubcompletion/user_progress.php?id=${id}`,
        ];
    let doc = null;
    for (const u of urls) {
      try {
        doc = await fetchHtml(u);
        if (doc.querySelector('.user_progress_table')) break;
      } catch {
        /* 다음 URL 시도 */
      }
    }
    if (!doc?.querySelector('.user_progress_table')) return [];

    const headers = Array.from(
      doc.querySelectorAll('.user_progress_table > thead > tr > th'),
    ).map((th) => th.textContent?.trim() ?? '');
    if (headers.length < 5) return [];
    let att = -1,
      weekAtt = -1,
      req = null;
    const matched = new Set();
    headers.forEach((t, i) => {
      if (COL_WEEKLY_ATTENDANCE.some((k) => t.includes(k))) {
        weekAtt = i;
        matched.add(i);
      } else if (COL_REQUIRED_TIME.some((k) => t.includes(k))) {
        req = i;
        matched.add(i);
      }
    });
    headers.forEach((t, i) => {
      if (
        att === -1 &&
        !matched.has(i) &&
        COL_ATTENDANCE.some((k) => t.includes(k))
      )
        att = i;
    });
    if (att === -1 || weekAtt === -1) return [];

    const pending = [],
      spanVal = [];
    const flatten = (row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      const out = [];
      let col = 0;
      const consume = () => {
        while (pending[col] > 0) {
          out.push(spanVal[col] ?? null);
          pending[col] -= 1;
          col++;
        }
      };
      consume();
      for (const cell of cells) {
        consume();
        const rs = +(cell.getAttribute('rowspan') || 1);
        const cs = +(cell.getAttribute('colspan') || 1);
        const v = cell.textContent?.trim() ?? '';
        for (let i = 0; i < cs; i++) {
          out.push(v);
          if (rs > 1) {
            pending[col] = rs - 1;
            spanVal[col] = v;
          } else spanVal[col] = null;
          col++;
        }
      }
      while (col < pending.length) {
        if (pending[col] > 0) {
          out.push(spanVal[col] ?? null);
          pending[col] -= 1;
        } else out.push(null);
        col++;
      }
      return out;
    };

    let curWeek = 0,
      lastWeekly = '';
    return Array.from(
      doc.querySelectorAll('.user_progress_table > tbody > tr'),
    ).flatMap((row) => {
      const cells = flatten(row);
      const title = cells[1] ?? '';
      const status = cells[att] ?? '';
      let weekly = cells[weekAtt] ?? '';
      if (weekly) lastWeekly = weekly;
      else weekly = lastWeekly;
      if (BULK_APPROVED.some((k) => weekly.includes(k))) weekly = 'O';
      const w = parseInt(cells[0] ?? '', 10);
      if (!Number.isNaN(w)) curWeek = w;
      if (!title || !status) return [];
      return {
        title,
        week: curWeek,
        status,
        attended: /^[Oo]$/.test(status) || status.includes('출석'),
        weeklyStatus: weekly || undefined,
        required: req !== null ? cells[req] || undefined : undefined,
        watched: (cells[att - 1] ?? '').match(/^(\d{1,2}:\d{2}(:\d{2})?)/)?.[1],
      };
    });
  };

  // ── 강의 수강 기간/링크 (강좌 페이지) ───────────────────────
  const fetchVodRanges = async (id) => {
    try {
      const doc = await fetchHtml(`${BASE}/course/view.php?id=${id}`);
      const ranges = {};
      doc.querySelectorAll('li[id^="section-"]').forEach((sec) => {
        sec
          .querySelectorAll('li.modtype_vod:not(.dimmed) .activityinstance')
          .forEach((act) => {
            const name = act.querySelector('.instancename');
            if (!name) return;
            const clone = name.cloneNode(true);
            clone.querySelector('.accesshide')?.remove();
            const title = clone.textContent?.trim();
            const range = text(act, '.text-ubstrap');
            const url = act.querySelector('a')?.getAttribute('href');
            if (title)
              ranges[title] = {
                range: range ? range.replace(/\s+/g, ' ') : undefined,
                url: url ? abs(url) : undefined,
              };
          });
      });
      return ranges;
    } catch {
      return {};
    }
  };

  // ── 전체 수집 ───────────────────────────────────────────────
  async function collect(onProgress) {
    const courses = listCourses();
    if (!courses.length)
      throw new Error('수강 과목을 찾지 못했습니다 — 내 강의실 페이지에서 실행하세요.');
    const result = [];
    for (const c of courses) {
      onProgress?.(`수집 중: ${c.title} (${result.length + 1}/${courses.length})`);
      const [vods, assigns, quizzes, ranges] = await Promise.allSettled([
        fetchVods(c.id, c.community),
        fetchAssigns(c.id),
        fetchQuizzes(c.id),
        fetchVodRanges(c.id),
      ]);
      result.push({
        ...c,
        vods: (vods.value ?? []).map((v) => ({
          ...v,
          range: ranges.value?.[v.title]?.range,
          url: ranges.value?.[v.title]?.url,
        })),
        assigns: assigns.value ?? [],
        quizzes: quizzes.value ?? [],
        errors: [
          vods.status === 'rejected' && 'vod',
          assigns.status === 'rejected' && 'assign',
          quizzes.status === 'rejected' && 'quiz',
        ].filter(Boolean),
      });
    }
    return {
      source: 'cosmos-lms',
      fetchedAt: new Date().toISOString(),
      courses: result,
    };
  }

  // ── 플로팅 버튼 UI ──────────────────────────────────────────
  function injectButton() {
    if (!document.body || document.getElementById('hsu-helper-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'hsu-helper-btn';
    btn.textContent = '학사도우미 수집';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: 99999,
      padding: '11px 18px',
      borderRadius: '999px',
      border: 'none',
      background: '#1d4ed8',
      color: '#fff',
      fontWeight: 700,
      fontSize: '13px',
      boxShadow: '0 4px 14px rgba(0,0,0,.3)',
      cursor: 'pointer',
    });
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const payload = await collect((msg) => (btn.textContent = msg));
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'lms-data.json';
        a.click();
        const vods = payload.courses.flatMap((c) => c.vods);
        const done = vods.filter((v) => v.attended).length;
        const pending =
          vods.filter((v) => !v.attended).length +
          payload.courses.flatMap((c) => [...c.assigns, ...c.quizzes])
            .filter((t) => !t.submitted).length;
        btn.textContent = `완료 · 강의 ${done}/${vods.length} · 미완료 ${pending}`;
        if (confirm('다운로드 완료. 학사 도우미 수업 현황 페이지를 열까요?'))
          window.open(APP_URL, '_blank');
      } catch (e) {
        console.error('[학사도우미]', e);
        btn.textContent = '실패 — 내 강의실에서 실행';
      }
      btn.disabled = false;
      setTimeout(() => (btn.textContent = '학사도우미 수집'), 10000);
    };
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', injectButton);
  else injectButton();
})();
