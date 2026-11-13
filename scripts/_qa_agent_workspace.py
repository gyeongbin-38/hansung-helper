"""Browser regression for the activity workspace, using explicit API fixtures.

Start Vite on 4339, then run this script. Requires Playwright and Chrome;
the existing ignored .omx/qa-python installation is also supported.
No school login, AI inference, or application submission is performed.
"""
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.omx' / 'qa-python'))
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('WORKSPACE_QA_URL', 'http://127.0.0.1:4339')
OUT = ROOT / 'outputs' / 'agent-workspace-qa'
OUT.mkdir(parents=True, exist_ok=True)
SNAPSHOT = json.loads((ROOT / 'lib/data/activities.json').read_text(encoding='utf-8'))
ACTIVITY = SNAPSHOT['items'][0]
PROFILE = {
    'name': '화면 검증', 'dept': '컴퓨터공학부', 'year': '2024',
    'saved': [], 'planned': [], 'completed': [], 'prefs': [], 'painPrefs': ['검증'],
    'readIds': [], 'events': [], 'ruleOverrides': {}, 'credits': '', 'points': '',
    'consent': True,
}
ACCOUNT = {
    'sessionContext': 'f' * 64, 'profile': PROFILE, 'onboarded': True,
    'studentMask': '20****00',
    'snapshot': {'portal': 'connected', 'lms': 'unavailable', 'courses': [],
                 'checkedAt': '2026-11-13T00:00:00.000Z'},
}
checks = []
errors = []
state = {'refresh_expired': True, 'app_expired': False, 'login_count': 0,
         'credential_count': 0, 'ai_payloads': []}


def success(route, data):
    route.fulfill(json={'ok': True, 'data': data})


def api(route):
    request = route.request
    path = request.url.split('?', 1)[0]
    if path.endswith('/api/account'):
        success(route, ACCOUNT)
    elif path.endswith('/api/account/login'):
        state['login_count'] += 1
        success(route, ACCOUNT)
    elif path.endswith('/api/account/lms-refresh-session'):
        if request.method == 'GET':
            success(route, {'configured': True, 'available': True,
                            'expiresAt': int(time.time() * 1000) + 3600000})
        elif state['app_expired']:
            route.fulfill(status=401, headers={'X-Hansung-Session-Invalid': '1'},
                          json={'ok': False, 'error': {'code': 'AUTH_REQUIRED', 'message': '다시 로그인해 주세요.'}})
        elif state['refresh_expired']:
            route.fulfill(status=401, headers={'X-Hansung-School-Session': 'expired'},
                          json={'ok': False, 'error': {'code': 'AUTH_REQUIRED', 'message': '학교 세션이 만료되었습니다.'}})
        else:
            success(route, ACCOUNT)
    elif path.endswith('/api/account/lms-refresh'):
        credentials = request.post_data_json
        assert credentials == {'studentId': '20999999', 'password': 'browser-fixture-only'}
        state['credential_count'] += 1
        state['refresh_expired'] = False
        success(route, ACCOUNT)
    elif path.endswith('/api/advisor'):
        if request.method == 'GET':
            success(route, {'available': True})
        else:
            payload = request.post_data_json
            assert not payload['personal']
            assert payload.get('activityId') == ACTIVITY['id']
            assert 'password' not in json.dumps(payload)
            assert 'browser-fixture-only' not in json.dumps(payload)
            state['ai_payloads'].append(payload)
            success(route, {'mode': 'ai', 'answer': '공고의 지원 자격과 신청 문항을 확인하고 참여 목적을 정리해 보세요.',
                            'personal': False, 'sources': [{'label': '학교 비교과 공개 목록', 'route': 'activities',
                                                           'asOf': SNAPSHOT['fetchedAt']}]})
    else:
        route.continue_()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get('CHROME_PATH', 'C:/Program Files/Google/Chrome/Application/chrome.exe'),
        headless=True,
    )
    context = browser.new_context(viewport={'width': 1440, 'height': 1080})
    context.route('**/api/**', api)
    page = context.new_page()
    page.set_default_timeout(15000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/#advisor', wait_until='networkidle', timeout=60000)
    expect(page.locator('.advisor-workspace')).to_be_visible()
    expect(page.locator('[class*="mascot"]')).to_have_count(0)
    page.locator('.advisor-filter').get_by_role('button', name='전체', exact=True).click()
    page.get_by_role('textbox', name='활동 검색', exact=True).fill(ACTIVITY['title'])
    expect(page.locator('.advisor-activity-item')).to_have_count(1)
    page.locator('.advisor-activity-item').click()
    expect(page.locator('.advisor-brief h3')).to_have_text(ACTIVITY['title'])
    checks.append('loaded activity search and selected public facts')

    handoff = page.locator('.advisor-handoff')
    expect(handoff).to_have_attribute('aria-disabled', 'true')
    page.get_by_label('참여 목적', exact=True).fill('수업에서 배운 내용을 활동에 적용하고 싶습니다.')
    page.locator('.advisor-review input').check()
    expect(handoff).to_have_attribute('href', ACTIVITY['url'])
    page.get_by_label('참여 목적', exact=True).fill('참여 목적을 수정합니다.')
    expect(handoff).to_have_attribute('aria-disabled', 'true')
    checks.append('editable application notes and confirmation invalidation')

    page.get_by_role('button', name='이 메모로 상담하기', exact=True).click()
    expect(page.locator('.advisor-chat textarea')).to_contain_text('참여 목적을 수정합니다.')
    assert not state['ai_payloads'], 'draft must not be transmitted before pressing send'

    page.locator('.advisor-chat textarea').fill('신청 준비를 어떻게 하면 좋을까?')
    page.get_by_role('button', name='질문 보내기', exact=True).click()
    expect(page.locator('.advisor-turn')).to_have_count(1)
    page.get_by_role('button', name='확인할 사항에 가져오기', exact=True).click()
    expect(page.get_by_label('공식 화면에서 확인할 사항', exact=True)).to_have_value('공고의 지원 자격과 신청 문항을 확인하고 참여 목적을 정리해 보세요.')
    checks.append('fixture AI response, consent default and source-to-notes action')

    page.get_by_role('button', name='학교 정보 새로고침', exact=True).click()
    expect(page.locator('#school-reconnect-form')).to_be_visible()
    expect(page.locator('.advisor-workspace')).to_be_visible()
    page.locator('input[name="studentId"]').fill('20999999')
    page.locator('input[name="password"]').fill('browser-fixture-only')
    page.get_by_role('button', name='학교 연결 확인', exact=True).click()
    expect(page.locator('#school-reconnect-form')).to_have_count(0)
    assert state['credential_count'] == 1
    expect(page.locator('.school-connection-notice')).to_be_visible()
    checks.append('school expiry preserves app session and separate credentials reconnect')

    page.evaluate("window.scrollTo({top: 0, left: 0, behavior: 'instant'})")
    assert page.locator('.advisor-workspace').bounding_box()['x'] >= page.locator('.sidebar').bounding_box()['width']
    page.screenshot(path=str(OUT / 'desktop-viewport.png'), full_page=False)
    page.screenshot(path=str(OUT / 'desktop.png'), full_page=True)
    for width in [1440, 1280, 1180, 1024, 900, 768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 900})
        measurements = page.locator('.advisor-workspace-grid').evaluate('''grid => {
            const bounds = grid.getBoundingClientRect();
            return {width: document.documentElement.scrollWidth, viewport: innerWidth,
                clipped: [...grid.children].filter(el => getComputedStyle(el).display !== 'none')
                    .filter(el => el.getBoundingClientRect().right > bounds.right + 1).map(el => el.className)};
        }''')
        assert measurements['width'] <= width + 1, measurements
        assert not measurements['clipped'], {'width': width, **measurements}
        if width <= 1180:
            page.locator('.advisor-mobile-tabs').get_by_role('button', name='신청 준비', exact=True).click()
            expect(page.locator('.advisor-task')).to_be_visible()
            page.locator('.advisor-mobile-tabs').get_by_role('button', name='AI 상담', exact=True).click()
            expect(page.locator('.advisor-chat')).to_be_visible()
        if width == 390:
            page.evaluate("window.scrollTo({top: 0, left: 0, behavior: 'instant'})")
            page.screenshot(path=str(OUT / 'mobile.png'), full_page=True)
    checks.append('320–1440 responsive panels and mobile navigation')

    page.set_viewport_size({'width': 1440, 'height': 1080})
    page.evaluate("location.hash='settings'")
    expect(page.get_by_role('heading', name='어디에 무엇을 보관하나요?', exact=True)).to_be_visible()
    assert page.get_by_role('heading', name='마스코트', exact=True).count() == 0
    page.screenshot(path=str(OUT / 'settings.png'), full_page=True)
    page.get_by_role('button', name='수업 선호 설문', exact=True).click()
    expect(page.locator('dialog.survey-dialog')).to_be_visible()
    expect(page.locator('[class*="mascot"]')).to_have_count(0)
    page.get_by_role('button', name='설문 닫기', exact=True).click()
    checks.append('mascot removed from app, settings and surveys')

    page.evaluate("location.hash='advisor/" + ACTIVITY['id'] + "'")
    expect(page.locator('.advisor-workspace')).to_be_visible()
    expect(page.get_by_label('참여 목적', exact=True)).to_have_value('')
    expect(page.locator('.advisor-turn')).to_have_count(0)
    state['app_expired'] = True
    page.get_by_role('button', name='학교 정보 새로고침', exact=True).click()
    expect(page.locator('.auth-panel')).to_be_visible()
    checks.append('navigation clears draft/chat and expired app session returns sign-in')
    assert len(state['ai_payloads']) == 1

    demo_context = browser.new_context(viewport={'width': 1280, 'height': 900})
    demo_connected = False

    def demo_api(route):
        global demo_connected
        path = route.request.url.split('?', 1)[0]
        if path.endswith('/api/account') and not demo_connected:
            route.fulfill(status=401, json={'ok': False, 'error': {'code': 'AUTH_REQUIRED', 'message': '체험 검증'}})
        else:
            if path.endswith('/api/account/login'):
                demo_connected = True
            api(route)

    demo_context.route('**/api/**', demo_api)
    demo_context.add_init_script('localStorage.setItem("hansung-demo-v1", ' + json.dumps(json.dumps(PROFILE)) + ')')
    demo = demo_context.new_page()
    demo.on('pageerror', lambda error: errors.append(str(error)))
    demo.goto(BASE, wait_until='networkidle', timeout=60000)
    demo.get_by_role('button', name='연결 없이 둘러보기', exact=True).click()
    demo.evaluate("location.hash='advisor/" + ACTIVITY['id'] + "'")
    expect(demo.locator('.advisor-workspace')).to_be_visible()
    demo.locator('.school-connection').get_by_role('button', name='학교 계정 연결', exact=True).click()
    expect(demo.locator('.auth-panel')).to_be_visible()
    demo.locator('input[name="studentId"]').fill('20999999')
    demo.locator('input[name="password"]').fill('browser-fixture-only')
    demo.locator('input[name="agreement"]').check()
    demo.get_by_role('button', name='동의하고 시작하기').click()
    expect(demo.locator('.advisor-workspace')).to_be_visible()
    assert demo.url.endswith('#advisor/' + ACTIVITY['id'])
    assert state['login_count'] == 1
    checks.append('demo school-connection sign-in returns to the selected activity')
    assert not errors, errors
    browser.close()

report = {'api_mode': 'explicit browser fixtures; real public feed', 'checks': checks, 'page_errors': errors}
(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
