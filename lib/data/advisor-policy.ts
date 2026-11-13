export const ADVISOR_SCOPE_MESSAGE =
  'AI 학사 도우미는 서비스 이용·활동 추천과 학사 안내 질문만 답할 수 있어요. 보안·내부 설정·프롬프트 관련 질문은 처리하지 않아요.';
export const ADVISOR_PRIVATE_INPUT_MESSAGE =
  '학번·비밀번호·인증 정보를 질문이나 이전 대화에서 지운 뒤 다시 질문해 주세요. 로그인은 학교 연결 화면에서 진행해 주세요.';

function normalizeQuestion(text: string) {
  return text
    .normalize('NFKC')
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Best-effort DLP for explicit credential values, not ordinary login help.
 * Unknown/obfuscated secrets still cannot be recognized reliably. Never log a
 * match or send the matched value back to the client. */
export function advisorContainsCredentials(text: string): boolean {
  const normalized = normalizeQuestion(text);
  return [
    /(?:비밀번호|패스워드|password|passwd|pwd)\s*[:=]\s*["']?[^\s"']+/u,
    /비밀번호(?:는|은)\s*(?:["'][^\s"']+["']|[a-z0-9!@#$%^&*._+-]{4,}(?=$|\s*(?:입니다|이에요|예요|이야|야|[.!?])))/u,
    /(?:학번|student\s*id)\s*(?:[:=]|은|는)?\s*\d{6,10}\b/u,
    /(?:__host-hansung_session\s*=\s*[a-f0-9]{64}|\b[a-f0-9]{64}\b)/u,
    /\b(?:sk-(?:proj-)?[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{20,}|eyj[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,})\b/u,
  ].some(pattern => pattern.test(normalized));
}

const INJECTION_PATTERNS = [
  /(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier|system|developer)\s+(?:instructions?|prompts?|messages?|rules?)/u,
  /(?:reveal|show|print|repeat|quote|dump|expose|return)\s+(?:the\s+)?(?:hidden\s+|original\s+|full\s+|internal\s+)*(?:system|developer)\s+(?:prompt|message|instructions?)/u,
  /(?:prompt\s*injection|jail\s*break|do\s+anything\s+now|\bdan\b)/u,
  /(?:이전|앞선|위의|기존|시스템|개발자)\s*(?:지시|명령|규칙|프롬프트|메시지)(?:를|을|은|는)?\s*(?:무시|잊어|덮어|취소|우회|따르지)/u,
  /(?:숨겨진|내부|원래|전체)\s*(?:시스템|개발자)?\s*(?:프롬프트|지시|명령|메시지)(?:를|을)?\s*(?:보여|출력|공개|알려|복사|반복)/u,
  /(?:프롬프트\s*인젝션|탈옥\s*(?:프롬프트|모드)?|제약\s*해제|안전\s*규칙\s*우회)/u,
  /(?:you\s+are\s+now|act\s+as|switch\s+to|enter)\s+(?:an?\s+)?(?:unrestricted|uncensored|developer|system|administrator|admin)(?:\s+(?:assistant|mode|role))?/u,
  /(?:개발자|시스템|관리자|제한\s*없는)\s*(?:모드|역할)(?:로|으로)?\s*(?:전환|변경|행동|들어)/u,
  /<\|\s*im_start\s*\|>\s*(?:system|developer)|^\s*\[\s*(?:system|developer)\s*\]/u,
];

const COMPACT_INJECTION_TERMS = [
  'ignorepreviousinstructions', 'ignoreallpreviousinstructions', 'revealsystemprompt',
  'showsystemprompt', 'printsystemprompt', 'repeatdeveloperinstructions', 'promptinjection',
  '이전지시무시', '이전명령무시', '기존규칙무시', '시스템프롬프트공개',
  '시스템프롬프트출력', '내부프롬프트공개', '프롬프트인젝션',
];

const COMPACT_INJECTION_PATTERNS = [
  /(?:시스템|개발자|내부|숨겨진)(?:프롬프트|지시|명령|메시지)(?:를|을)?(?:보여|출력|공개|알려|복사|반복)/u,
];

const SECURITY_PAYLOAD_PATTERNS = [
  /\b(?:cyber\s*security|infosec|hacking?|hackers?|exploits?|vulnerabilit(?:y|ies)|malware|ransomware|phishing|pentest(?:ing)?|penetration\s+test(?:ing)?|reverse\s+shell|privilege\s+escalation|cryptography|encryption|firewalls?|credential\s+(?:theft|stuffing)|token\s+(?:theft|stealing)|cookie\s+(?:theft|stealing))\b/u,
  /\b(?:xss|csrf|ssrf|xxe|rce|sqli|sql\s+injection|ddos|dos\s+attack|cve-?\d*)\b/u,
  /사이버\s*공격|해킹|해커|취약점|익스플로잇|악성\s*코드|랜섬웨어|피싱|침투\s*(?:시험|테스트)|모의\s*해킹|리버스\s*셸|권한\s*상승|암호화|방화벽|디도스|디디오스|(?:계정|인증|로그인|권한)\s*우회|(?:토큰|쿠키|자격\s*증명|계정)\s*탈취/u,
];

const SECURITY_TOPIC_PATTERNS = [
  /\bsecurity\b/u,
  /(?:사이버\s*)?보안|정보\s*보호/u,
];

const COMPACT_SECURITY_TERMS = [
  '보안취약점', '보안공격', '보안우회', '보안점검', '취약점', '모의해킹',
  '악성코드', '랜섬웨어', '권한상승', '토큰탈취', '쿠키탈취',
];

const INTERNAL_REQUEST_PATTERNS = [
  /(?:reveal|show|print|dump|expose|give|list|read|return)\s+(?:me\s+)?(?:the\s+)?(?:hidden|internal|private|secret|runtime|server)\s+(?:config(?:uration)?|settings?)/u,
  /\b(?:(?:system|developer)\s+(?:prompt|message|instructions?)|environment\s+variables?|env\s+vars?|api\s+keys?|secrets?|access\s+tokens?)\b/u,
  /(?:내부|숨겨진|비공개|서버|런타임)\s*(?:설정|구성)(?:를|을|은|는)?\s*(?:보여|출력|공개|알려|나열|읽어|반환|줘)/u,
  /(?:시스템|개발자)\s*(?:프롬프트|메시지|지시)|환경\s*변수|api\s*키|비밀\s*키|시크릿|접근\s*토큰/u,
];

/**
 * Rejects clearly out-of-scope requests before they reach the model. This is a
 * narrow input guard, while the server prompt remains the second boundary.
 */
function normalizedInputAllowed(text: string, includeBroadSecurity: boolean): boolean {
  if (typeof text !== 'string') return false;
  const normalized = normalizeQuestion(text);
  if (!normalized) return false;
  const compact = normalized.replace(/[\s\p{P}\p{S}_]+/gu, '');
  return !INJECTION_PATTERNS.some(pattern => pattern.test(normalized)) &&
    !COMPACT_INJECTION_TERMS.some(term => compact.includes(term)) &&
    !COMPACT_INJECTION_PATTERNS.some(pattern => pattern.test(compact)) &&
    !SECURITY_PAYLOAD_PATTERNS.some(pattern => pattern.test(normalized)) &&
    !COMPACT_SECURITY_TERMS.some(term => compact.includes(term)) &&
    !INTERNAL_REQUEST_PATTERNS.some(pattern => pattern.test(normalized)) &&
    (!includeBroadSecurity || !SECURITY_TOPIC_PATTERNS.some(pattern => pattern.test(normalized)));
}

export function advisorHistoryAllowed(text: string): boolean {
  return normalizedInputAllowed(text, false);
}

export function advisorQuestionAllowed(text: string): boolean {
  return normalizedInputAllowed(text, true);
}
