export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  isTruncated?: boolean;
  createdAt?: string; // ISO 8601 string
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
  // Band 1 — 자기소개 시리즈
  { id: "A1-1",  title: "안녕하세요! 자기소개 기초",            band: 1, band_name: "자기소개 시리즈",    type: "conversation", topics: ["인사하기", "이름 말하기", "국적 소개"] },
  { id: "A1-2",  title: "직업 소개",                          band: 1, band_name: "자기소개 시리즈",    type: "vocabulary",   topics: ["직업 어휘", "직업 말하기", "부정관사"] },
  { id: "A1-3",  title: "거주지와 출신",                       band: 1, band_name: "자기소개 시리즈",    type: "conversation", topics: ["도시/나라 이름", "거주지 표현", "출신 묻기"] },
  { id: "A1-4",  title: "가족 소개",                          band: 1, band_name: "자기소개 시리즈",    type: "vocabulary",   topics: ["가족 어휘", "가족 관계 표현", "소유관사"] },
  { id: "A1-5",  title: "취미와 관심사",                       band: 1, band_name: "자기소개 시리즈",    type: "vocabulary",   topics: ["취미 어휘", "좋아하는 것 말하기", "동사 활용"] },
  { id: "A1-6",  title: "나이와 생일",                         band: 1, band_name: "자기소개 시리즈",    type: "vocabulary",   topics: ["나이 묻기/답하기", "생일 표현", "기수 1-100"] },
  { id: "A1-7",  title: "연락처와 이메일",                      band: 1, band_name: "자기소개 시리즈",    type: "vocabulary",   topics: ["전화번호 말하기", "이메일 주소 표현", "철자 읽기"] },
  // Band 2 — 숫자/시간/동사/약속
  { id: "A1-8",  title: "시간 표현",                          band: 2, band_name: "숫자/시간/동사/약속", type: "vocabulary",   topics: ["시계 읽기", "시간 묻기/답하기", "일상 일정"] },
  { id: "A1-9",  title: "요일과 날짜",                         band: 2, band_name: "숫자/시간/동사/약속", type: "vocabulary",   topics: ["요일 어휘", "날짜 표현", "달력 읽기"] },
  { id: "A1-10", title: "일상 동사 활용",                       band: 2, band_name: "숫자/시간/동사/약속", type: "grammar",      topics: ["규칙 동사 변화", "불규칙 동사 소개", "일상 동작 표현"] },
  { id: "A1-11", title: "일과 표현",                          band: 2, band_name: "숫자/시간/동사/약속", type: "conversation", topics: ["하루 일과 묘사", "시간 부사", "순서 접속사"] },
  { id: "A1-12", title: "약속 잡기",                          band: 2, band_name: "숫자/시간/동사/약속", type: "conversation", topics: ["약속 제안", "시간 확인", "약속 수락/거절"] },
  { id: "A1-13", title: "장소 표현",                          band: 2, band_name: "숫자/시간/동사/약속", type: "vocabulary",   topics: ["장소 어휘", "위치 표현", "방향 묻기"] },
  { id: "A1-14", title: "교통수단",                           band: 2, band_name: "숫자/시간/동사/약속", type: "vocabulary",   topics: ["교통수단 어휘", "이동 방법 표현", "mit + 교통수단"] },
  // Band 3 — 주문/쇼핑/조동사
  { id: "A1-15", title: "카페에서 주문하기",                    band: 3, band_name: "주문/쇼핑/조동사",   type: "conversation", topics: ["음료/음식 어휘", "주문 표현", "가격 묻기"] },
  { id: "A1-16", title: "식료품점 쇼핑",                       band: 3, band_name: "주문/쇼핑/조동사",   type: "conversation", topics: ["식료품 어휘", "수량 표현", "포장 단위"] },
  { id: "A1-17", title: "의류 쇼핑",                          band: 3, band_name: "주문/쇼핑/조동사",   type: "conversation", topics: ["의류 어휘", "색상 표현", "치수/사이즈"] },
  { id: "A1-18", title: "조동사 können",                      band: 3, band_name: "주문/쇼핑/조동사",   type: "grammar",      topics: ["können 의미와 활용", "능력/가능성 표현", "정중한 요청"] },
  { id: "A1-19", title: "조동사 müssen",                      band: 3, band_name: "주문/쇼핑/조동사",   type: "grammar",      topics: ["müssen 의미와 활용", "의무/필요 표현", "부정 형태"] },
  { id: "A1-20", title: "조동사 wollen",                      band: 3, band_name: "주문/쇼핑/조동사",   type: "grammar",      topics: ["wollen 의미와 활용", "의지/의도 표현", "möchten과 비교"] },
  { id: "A1-21", title: "조동사 dürfen",                      band: 3, band_name: "주문/쇼핑/조동사",   type: "grammar",      topics: ["dürfen 의미와 활용", "허가/금지 표현", "규칙 표현"] },
  // Band 4 — 명령법/교통/전치사
  { id: "A1-22", title: "명령법 (Imperativ)",                  band: 4, band_name: "명령법/교통/전치사",  type: "grammar",      topics: ["명령문 만들기", "정중한 명령", "일상 명령 표현"] },
  { id: "A1-23", title: "대중교통 이용",                       band: 4, band_name: "명령법/교통/전치사",  type: "conversation", topics: ["티켓 구매", "노선 확인", "환승 표현"] },
  { id: "A1-24", title: "장소 전치사 (Wechselpräpositionen)",  band: 4, band_name: "명령법/교통/전치사",  type: "grammar",      topics: ["이중 전치사 개념", "정지 vs 이동", "Dativ vs Akkusativ"] },
  { id: "A1-25", title: "집 묘사와 방 이름",                    band: 4, band_name: "명령법/교통/전치사",  type: "vocabulary",   topics: ["집 구조 어휘", "가구 어휘", "방 위치 표현"] },
  { id: "A1-26", title: "길 안내",                            band: 4, band_name: "명령법/교통/전치사",  type: "conversation", topics: ["길 묻기", "방향 지시", "랜드마크 활용"] },
  { id: "A1-27", title: "시간 전치사",                         band: 4, band_name: "명령법/교통/전치사",  type: "grammar",      topics: ["시간 전치사 용법", "과거/현재/미래 표현", "빈도 부사"] },
  { id: "A1-28", title: "숫자와 가격",                         band: 4, band_name: "명령법/교통/전치사",  type: "vocabulary",   topics: ["큰 숫자 읽기", "가격 표현", "계산하기"] },
  // Band 5 — 약속취소/날짜/날씨
  { id: "A1-29", title: "약속 취소와 변경",                     band: 5, band_name: "약속취소/날짜/날씨",  type: "conversation", topics: ["사과 표현", "약속 취소 이유", "새 약속 제안"] },
  { id: "A1-30", title: "날씨 표현",                          band: 5, band_name: "약속취소/날짜/날씨",  type: "conversation", topics: ["날씨 어휘", "날씨 묻기/답하기", "계절별 날씨"] },
  { id: "A1-31", title: "감정 표현",                          band: 5, band_name: "약속취소/날짜/날씨",  type: "vocabulary",   topics: ["감정 어휘", "기분 묻기", "이유 표현"] },
  { id: "A1-32", title: "요리와 음식",                         band: 5, band_name: "약속취소/날짜/날씨",  type: "vocabulary",   topics: ["음식 어휘", "요리 동사", "식사 표현"] },
  { id: "A1-33", title: "건강과 신체",                         band: 5, band_name: "약속취소/날짜/날씨",  type: "vocabulary",   topics: ["신체 부위 어휘", "아픔 표현", "병원 표현"] },
  { id: "A1-34", title: "휴가와 여행 계획",                     band: 5, band_name: "약속취소/날짜/날씨",  type: "conversation", topics: ["여행지 어휘", "계획 표현", "미래 표현 (werden)"] },
  { id: "A1-35", title: "초대와 파티",                         band: 5, band_name: "약속취소/날짜/날씨",  type: "conversation", topics: ["초대 표현", "선물 어휘", "파티 대화"] },
  // Band 6 — 화법조동사 5개
  { id: "A1-36", title: "조동사 sollen",                      band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["sollen 의미와 활용", "지시/의무 표현", "간접 명령"] },
  { id: "A1-37", title: "조동사 mögen",                       band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["mögen 의미와 활용", "좋아하는 것 표현", "möchten과 관계"] },
  { id: "A1-38", title: "조동사 총정리",                       band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["5개 조동사 비교", "상황별 선택", "조동사 부정"] },
  { id: "A1-39", title: "분리동사 심화",                       band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["주요 분리동사 목록", "문장 구조", "의문문/명령문에서의 분리동사"] },
  { id: "A1-40", title: "부정 표현",                          band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["nicht vs. kein", "부정 대명사", "부정 응답"] },
  { id: "A1-41", title: "의문문 심화",                         band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["W-Fragen 심화", "예/아니오 질문", "간접 의문문 소개"] },
  { id: "A1-42", title: "접속사 (und/aber/oder/denn)",         band: 6, band_name: "화법조동사 5개",     type: "grammar",      topics: ["등위접속사 4개", "문장 연결", "대조 표현"] },
  // Band 7 — 과거표현(Perfekt)
  { id: "A1-43", title: "Perfekt 소개 (haben + 과거분사)",     band: 7, band_name: "과거표현(Perfekt)",  type: "grammar",      topics: ["Perfekt 개념", "haben과 결합", "규칙 동사 과거분사"] },
  { id: "A1-44", title: "Perfekt (sein + 과거분사)",           band: 7, band_name: "과거표현(Perfekt)",  type: "grammar",      topics: ["sein과 결합하는 동사", "이동/상태 변화 동사", "불규칙 과거분사"] },
  { id: "A1-45", title: "Perfekt 불규칙 동사",                 band: 7, band_name: "과거표현(Perfekt)",  type: "grammar",      topics: ["주요 불규칙 과거분사", "강변화 동사", "혼합 변화 동사"] },
  { id: "A1-46", title: "Präteritum 소개 (sein/haben)",       band: 7, band_name: "과거표현(Perfekt)",  type: "grammar",      topics: ["Präteritum 개념", "sein/haben Präteritum", "구어 vs 문어"] },
  { id: "A1-47", title: "과거 시간 표현",                       band: 7, band_name: "과거표현(Perfekt)",  type: "vocabulary",   topics: ["과거 시간 부사", "어제/지난주 표현", "과거 이야기하기"] },
  { id: "A1-48", title: "분리동사 Perfekt",                    band: 7, band_name: "과거표현(Perfekt)",  type: "grammar",      topics: ["분리동사 과거분사 형성", "ge- 위치", "복합 과거 구조"] },
  { id: "A1-49", title: "Perfekt 종합 연습",                   band: 7, band_name: "과거표현(Perfekt)",  type: "grammar",      topics: ["haben vs sein 선택", "과거 이야기 쓰기", "대화 연습"] },
  // Band 8 — 경험/신체/묘사/소유
  { id: "A1-50", title: "경험 표현",                          band: 8, band_name: "경험/신체/묘사/소유", type: "conversation", topics: ["경험 묻기", "Perfekt로 경험 표현", "noch nie / schon mal"] },
  { id: "A1-51", title: "외모 묘사",                          band: 8, band_name: "경험/신체/묘사/소유", type: "vocabulary",   topics: ["외모 어휘", "형용사 사용", "사람 묘사"] },
  { id: "A1-52", title: "성격 묘사",                          band: 8, band_name: "경험/신체/묘사/소유", type: "vocabulary",   topics: ["성격 어휘", "성격 표현하기", "비교 표현 소개"] },
  { id: "A1-53", title: "소유 표현 심화",                       band: 8, band_name: "경험/신체/묘사/소유", type: "grammar",      topics: ["소유관사 전체 변화표", "Dativ 소유관사", "소유 의문사"] },
  { id: "A1-54", title: "건강 문제와 조언",                     band: 8, band_name: "경험/신체/묘사/소유", type: "conversation", topics: ["건강 조언 표현", "sollen/müssen 활용", "병원 대화"] },
  { id: "A1-55", title: "A1 문법 총정리",                      band: 8, band_name: "경험/신체/묘사/소유", type: "grammar",      topics: ["A1 핵심 문법 복습", "격 체계 정리", "동사 변화 총정리"] },
  { id: "A1-56", title: "A1 → A2 다리 단원",                   band: 8, band_name: "경험/신체/묘사/소유", type: "grammar",      topics: ["A2 예고", "A1 성취 확인", "다음 단계 안내"] },
];
