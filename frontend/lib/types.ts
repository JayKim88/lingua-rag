export interface Message {
  id: string;
  backendId?: string;         // DB UUID from SSE "done" event (used for feedback API calls)
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  isTruncated?: boolean;
  isSummary?: boolean;        // AI response that is a session summary
  isSummaryRequest?: boolean; // user message that triggered the summary
  feedback?: "up" | "down" | null;
  createdAt?: string; // ISO 8601 string
}

export interface SavedSummary {
  id: string;
  unitId: string;
  unitTitle: string;
  content: string;
  savedAt: string; // ISO 8601
}

export interface SavedNote {
  id: string;
  unitId: string;
  unitTitle: string;
  content: string;
  savedAt: string; // ISO 8601
}

export interface Unit {
  id: string;
  title: string;
  band: number;
  band_name: string;
  type: string;
  topics: string[];
}

// Static unit list for sidebar — must stay in sync with backend/app/data/units.py
export const UNITS: Unit[] = [
  // Band 1 — 알파벳과 자기소개
  { id: "A1-1",  title: "알파벳과 발음 익히기",                              band: 1, band_name: "알파벳과 자기소개",          type: "vocabulary",   topics: ["독일어 알파벳", "Umlaut 발음", "이중자음 발음"] },
  { id: "A1-2",  title: "자기소개 1 – 인사하기",                              band: 1, band_name: "알파벳과 자기소개",          type: "conversation", topics: ["인사말", "이름 말하기", "sein 동사"] },
  { id: "A1-3",  title: "자기소개 2 – 안부",                                  band: 1, band_name: "알파벳과 자기소개",          type: "conversation", topics: ["안부 묻기", "Wie geht es Ihnen?", "감사 표현"] },
  { id: "A1-4",  title: "자기소개 3 – 이름",                                  band: 1, band_name: "알파벳과 자기소개",          type: "conversation", topics: ["이름 묻기/답하기", "heißen 동사", "격식/비격식"] },
  { id: "A1-5",  title: "자기소개 4 – 국적",                                  band: 1, band_name: "알파벳과 자기소개",          type: "conversation", topics: ["나라 이름", "국적 표현", "kommen aus"] },
  { id: "A1-6",  title: "자기소개 5 – 직업",                                  band: 1, band_name: "알파벳과 자기소개",          type: "vocabulary",   topics: ["직업 어휘", "직업 표현", "성별 직업명"] },
  { id: "A1-7",  title: "자기소개 6 – 취미",                                  band: 1, band_name: "알파벳과 자기소개",          type: "vocabulary",   topics: ["취미 어휘", "gern + 동사", "취미 말하기"] },
  // Band 2 — 숫자·시간·동사·약속
  { id: "A1-8",  title: "숫자",                                              band: 2, band_name: "숫자·시간·동사·약속",        type: "vocabulary",   topics: ["기수 0-100", "큰 숫자", "숫자 활용"] },
  { id: "A1-9",  title: "시간/시각",                                          band: 2, band_name: "숫자·시간·동사·약속",        type: "vocabulary",   topics: ["시계 읽기", "Wie spät ist es?", "halb/Viertel"] },
  { id: "A1-10", title: "동사 sprechen 말하다",                                band: 2, band_name: "숫자·시간·동사·약속",        type: "grammar",      topics: ["sprechen 어간 변화", "e→i 변화 동사", "언어 표현"] },
  { id: "A1-11", title: "이동을 나타내는 동사 gehen fahren fliegen",             band: 2, band_name: "숫자·시간·동사·약속",        type: "grammar",      topics: ["이동 동사", "fahren 어간 변화", "교통수단과 동사"] },
  { id: "A1-12", title: "동사 essen 먹다",                                     band: 2, band_name: "숫자·시간·동사·약속",        type: "grammar",      topics: ["essen 어간 변화", "e→i 변화", "음식 표현"] },
  { id: "A1-13", title: "약속하기",                                            band: 2, band_name: "숫자·시간·동사·약속",        type: "conversation", topics: ["약속 제안", "시간 확인", "약속 수락/거절"] },
  { id: "A1-14", title: "위치 찾기",                                           band: 2, band_name: "숫자·시간·동사·약속",        type: "conversation", topics: ["위치 묻기", "Wo ist...?", "방향 안내"] },
  // Band 3 — 주문·쇼핑·의문문·분리동사
  { id: "A1-15", title: "주문하기",                                            band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "conversation", topics: ["음료/음식 주문", "möchten 활용", "가격 묻기"] },
  { id: "A1-16", title: "물건사기",                                            band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "conversation", topics: ["쇼핑 어휘", "Akkusativ 관사", "가격 표현"] },
  { id: "A1-17", title: "수량/양을 묻는 의문문 Wie viel(e)~",                   band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "grammar",      topics: ["Wie viel/Wie viele", "수량 표현", "단위 어휘"] },
  { id: "A1-18", title: "기간을 묻는 의문문 Wie lange~",                         band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "grammar",      topics: ["Wie lange?", "기간 표현", "seit 전치사"] },
  { id: "A1-19", title: "능력과 가능성을 나타내는 화법조동사 können",               band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "grammar",      topics: ["können 변화", "능력/가능성 표현", "정중한 요청"] },
  { id: "A1-20", title: "부탁 및 요청하기",                                      band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "conversation", topics: ["부탁 표현", "bitte 활용", "요청 수락/거절"] },
  { id: "A1-21", title: "분리동사",                                              band: 3, band_name: "주문·쇼핑·의문문·분리동사",   type: "grammar",      topics: ["분리동사 개념", "접두사 위치", "주요 분리동사"] },
  // Band 4 — 명령법·교통·전치사·방묘사
  { id: "A1-22", title: "명령법",                                               band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "grammar",      topics: ["du형 명령", "Sie형 명령", "Bitte 정중 표현"] },
  { id: "A1-23", title: "교통수단",                                              band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "vocabulary",   topics: ["교통수단 어휘", "mit + Dativ", "이동 동사 선택"] },
  { id: "A1-24", title: "길묻기",                                                band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "conversation", topics: ["길 묻기", "방향 지시", "좌/우/직진"] },
  { id: "A1-25", title: "위치를 나타내는 전치사",                                   band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "grammar",      topics: ["Wo? + Dativ", "위치 전치사 9개", "정관사 Dativ 변화"] },
  { id: "A1-26", title: "위치의 이동을 나타내는 전치사",                              band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "grammar",      topics: ["Wohin? + Akkusativ", "이중 전치사", "liegen/legen 구분"] },
  { id: "A1-27", title: "방 묘사하기",                                             band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "vocabulary",   topics: ["집/방 어휘", "가구 어휘", "es gibt 구문"] },
  { id: "A1-28", title: "도움 요청하기",                                            band: 4, band_name: "명령법·교통·전치사·방묘사",   type: "conversation", topics: ["도움 요청 표현", "können 활용", "감사 표현"] },
  // Band 5 — 약속·날짜·날씨·의사표현
  { id: "A1-29", title: "약속 취소 및 연기",                                       band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "conversation", topics: ["약속 취소", "weil 접속사", "새 약속 제안"] },
  { id: "A1-30", title: "날짜",                                                    band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "vocabulary",   topics: ["서수 읽기", "날짜 표현", "am + 날짜"] },
  { id: "A1-31", title: "편지/이메일 쓰기",                                          band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "writing",      topics: ["편지 형식", "인사말/마무리말", "격식/비격식"] },
  { id: "A1-32", title: "시간전치사",                                               band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "grammar",      topics: ["um/am/im 구분", "vor/nach/seit/bis", "시간 전치사 체계"] },
  { id: "A1-33", title: "날씨",                                                     band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "vocabulary",   topics: ["날씨 어휘", "비인칭 es", "계절별 날씨"] },
  { id: "A1-34", title: "찬성/반대 의견 말하기",                                      band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "conversation", topics: ["찬성 표현", "반대 표현", "의견 말하기"] },
  { id: "A1-35", title: "W-의문문 만들기",                                            band: 5, band_name: "약속·날짜·날씨·의사표현",   type: "grammar",      topics: ["W-Fragen 8개", "의문사 정리", "의문문 어순"] },
  // Band 6 — 화법조동사
  { id: "A1-36", title: "의지와 바람을 나타내는 화법조동사 wollen/möchten",             band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["wollen/möchten 변화", "의지 vs 바람", "뉘앙스 비교"] },
  { id: "A1-37", title: "의무와 당위를 나타내는 화법조동사 müssen",                      band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["müssen 변화", "의무 표현", "nicht müssen vs nicht dürfen"] },
  { id: "A1-38", title: "허락/허가를 나타내는 화법조동사 dürfen",                        band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["dürfen 변화", "허가/금지 표현", "Darf ich...?"] },
  { id: "A1-39", title: "제3자 요청/요구를 나타내는 화법조동사 sollen",                   band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["sollen 변화", "외부 지시 표현", "sollen vs müssen"] },
  { id: "A1-40", title: "화법조동사 연습 1",                                           band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["wollen/möchten 연습", "müssen 연습", "상황별 선택"] },
  { id: "A1-41", title: "화법조동사 연습 2",                                           band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["dürfen/sollen 연습", "können 재확인", "조동사 비교"] },
  { id: "A1-42", title: "화법조동사 연습 3",                                           band: 6, band_name: "화법조동사",              type: "grammar",      topics: ["6개 조동사 종합", "조동사 부정 비교", "실전 대화 연습"] },
  // Band 7 — 과거 표현
  { id: "A1-43", title: "과거 표현(규칙변화)",                                          band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["규칙동사 Perfekt", "ge-...-t 형성", "haben + 과거분사"] },
  { id: "A1-44", title: "과거 표현(불규칙변화)",                                         band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["불규칙동사 Perfekt", "ge-...-en 형성", "주요 불규칙 목록"] },
  { id: "A1-45", title: "과거 표현(혼합변화)",                                           band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["혼합변화 동사", "sein + 과거분사", "이동/상태 변화 동사"] },
  { id: "A1-46", title: "과거 표현(분리동사)",                                           band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["분리동사 Perfekt", "ge- 삽입 위치", "auf-ge-macht"] },
  { id: "A1-47", title: "과거표현연습 1",                                                band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["규칙/불규칙 복습", "haben vs sein 연습", "과거 이야기"] },
  { id: "A1-48", title: "과거표현연습 2",                                                band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["과거 시간 부사", "Perfekt 실전 활용", "과거 대화"] },
  { id: "A1-49", title: "과거표현연습 3",                                                band: 7, band_name: "과거 표현",              type: "grammar",      topics: ["Perfekt 종합 연습", "과거 이야기 구성", "haben/sein 종합"] },
  // Band 8 — 경험·신체·묘사·소유
  { id: "A1-50", title: "경험 말하기",                                                   band: 8, band_name: "경험·신체·묘사·소유",    type: "conversation", topics: ["경험 표현", "schon mal/noch nie", "Hast du schon mal...?"] },
  { id: "A1-51", title: "축하하기",                                                      band: 8, band_name: "경험·신체·묘사·소유",    type: "conversation", topics: ["축하 표현", "Herzlichen Glückwunsch", "특별한 날 어휘"] },
  { id: "A1-52", title: "몸",                                                            band: 8, band_name: "경험·신체·묘사·소유",    type: "vocabulary",   topics: ["신체 부위 어휘", "명사 성별", "신체 표현"] },
  { id: "A1-53", title: "통증",                                                          band: 8, band_name: "경험·신체·묘사·소유",    type: "conversation", topics: ["통증 표현", "Kopfschmerzen", "weh tun 동사"] },
  { id: "A1-54", title: "사람묘사",                                                       band: 8, band_name: "경험·신체·묘사·소유",    type: "vocabulary",   topics: ["외모 형용사", "성격 형용사", "사람 묘사하기"] },
  { id: "A1-55", title: "색깔",                                                           band: 8, band_name: "경험·신체·묘사·소유",    type: "vocabulary",   topics: ["색깔 어휘", "색깔 형용사 활용", "쇼핑에서 색깔"] },
  { id: "A1-56", title: "소유 표현하기",                                                   band: 8, band_name: "경험·신체·묘사·소유",    type: "grammar",      topics: ["소유관사 전체", "격변화 표", "소유 의문사 Wessen?"] },
];
