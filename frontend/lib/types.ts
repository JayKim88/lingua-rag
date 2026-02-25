export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  isTruncated?: boolean;
}

export interface Unit {
  id: string;
  title: string;
  band: number;
  type: string;
  topics: string[];
}

// Static unit list for sidebar (matches backend data.py)
export const UNITS: Unit[] = [
  // Band 1
  { id: "A1-1", title: "알파벳과 발음 익히기", band: 1, type: "vocabulary", topics: ["알파벳 26자", "발음 규칙"] },
  { id: "A1-2", title: "자기소개1 - 인사하기", band: 1, type: "conversation", topics: ["Hallo", "Guten Tag", "Auf Wiedersehen"] },
  { id: "A1-3", title: "자기소개2 - 이름 묻고 답하기", band: 1, type: "conversation", topics: ["Wie heißen Sie?", "Ich heiße"] },
  { id: "A1-4", title: "숫자 1-100", band: 1, type: "vocabulary", topics: ["기수 체계", "합성 규칙"] },
  { id: "A1-5", title: "국적과 언어", band: 1, type: "vocabulary", topics: ["Woher kommen Sie?", "국가명"] },
  { id: "A1-6", title: "직업 묻고 답하기", band: 1, type: "vocabulary", topics: ["직업 명사", "성별형"] },
  { id: "A1-7", title: "정관사와 부정관사", band: 1, type: "grammar", topics: ["der/die/das", "ein/eine"] },
  { id: "A1-8", title: "동사 현재형 - sein", band: 1, type: "grammar", topics: ["ich bin", "du bist"] },
  { id: "A1-9", title: "동사 현재형 - haben", band: 1, type: "grammar", topics: ["ich habe", "du hast"] },
  { id: "A1-10", title: "색깔과 형용사 기초", band: 1, type: "vocabulary", topics: ["기본 색깔", "술어 형용사"] },
  // Band 2
  { id: "A1-11", title: "규칙동사 현재형", band: 2, type: "grammar", topics: ["어간+어미 규칙", "spielen/lernen"] },
  { id: "A1-12", title: "불규칙동사 현재형", band: 2, type: "grammar", topics: ["a→ä", "e→ie", "e→i"] },
  { id: "A1-13", title: "약속하기", band: 2, type: "conversation", topics: ["Wann passt es?", "시간 제안"] },
  { id: "A1-14", title: "요일과 시간", band: 2, type: "vocabulary", topics: ["Montag~Sonntag", "Um/Viertel/halb"] },
  { id: "A1-15", title: "Akkusativ (4격)", band: 2, type: "grammar", topics: ["목적격", "den/die/das 변화"] },
  { id: "A1-16", title: "음식과 식사", band: 2, type: "vocabulary", topics: ["음식 어휘", "gern"] },
  { id: "A1-17", title: "쇼핑 표현", band: 2, type: "conversation", topics: ["Was kostet das?", "가격"] },
  { id: "A1-18", title: "신체 부위", band: 2, type: "vocabulary", topics: ["신체 어휘", "Mein...tut weh"] },
  { id: "A1-19", title: "날씨 표현", band: 2, type: "conversation", topics: ["Wie ist das Wetter?", "sonnig"] },
  { id: "A1-20", title: "집과 방", band: 2, type: "vocabulary", topics: ["방 이름", "위치 전치사"] },
  // Band 3
  { id: "A1-21", title: "화법조동사 können", band: 3, type: "grammar", topics: ["능력/가능", "Können Sie?"] },
  { id: "A1-22", title: "화법조동사 müssen/dürfen", band: 3, type: "grammar", topics: ["의무", "허가"] },
  { id: "A1-23", title: "화법조동사 möchten/wollen", band: 3, type: "grammar", topics: ["희망", "의지"] },
  { id: "A1-24", title: "분리동사", band: 3, type: "grammar", topics: ["전철 분리", "aufstehen/anrufen"] },
  { id: "A1-25", title: "일상 루틴 표현", band: 3, type: "conversation", topics: ["하루 일과", "Dann/Danach"] },
  { id: "A1-26", title: "취미와 여가", band: 3, type: "vocabulary", topics: ["취미 어휘", "gern/nicht gern"] },
  { id: "A1-27", title: "가족 표현", band: 3, type: "vocabulary", topics: ["가족 어휘", "관계 설명"] },
  { id: "A1-28", title: "의문사 총정리", band: 3, type: "grammar", topics: ["Wer/Was/Wo/Wie/Wann/Warum"] },
  { id: "A1-29", title: "부정 표현 nicht/kein", band: 3, type: "grammar", topics: ["nicht", "kein 구분"] },
  { id: "A1-30", title: "전치사 - 장소", band: 3, type: "grammar", topics: ["in/an/auf/unter/über"] },
  // Band 4
  { id: "A1-31", title: "교통과 이동", band: 4, type: "conversation", topics: ["대중교통", "Wie komme ich?"] },
  { id: "A1-32", title: "길 찾기 표현", band: 4, type: "conversation", topics: ["방향", "geradeaus/links/rechts"] },
  { id: "A1-33", title: "레스토랑에서", band: 4, type: "conversation", topics: ["예약", "주문", "계산"] },
  { id: "A1-34", title: "전화 표현", band: 4, type: "conversation", topics: ["전화 기본", "메시지 남기기"] },
  { id: "A1-35", title: "날짜와 달", band: 4, type: "vocabulary", topics: ["Januar~Dezember", "서수"] },
  { id: "A1-36", title: "서수와 순서", band: 4, type: "grammar", topics: ["erste/zweite/dritte"] },
  { id: "A1-37", title: "비교 표현 기초", band: 4, type: "grammar", topics: ["비교급", "als/so...wie"] },
  { id: "A1-38", title: "형용사 어미변화 - 술어", band: 4, type: "grammar", topics: ["술어 형용사 무변화"] },
  { id: "A1-39", title: "쇼핑 심화", band: 4, type: "conversation", topics: ["옷 가게", "사이즈", "환불"] },
  { id: "A1-40", title: "학교와 공부", band: 4, type: "vocabulary", topics: ["학교 어휘", "과목 이름"] },
  // Band 5
  { id: "A1-41", title: "Nominativ/Akkusativ 총정리", band: 5, type: "grammar", topics: ["격 비교표"] },
  { id: "A1-42", title: "인칭대명사 격변화", band: 5, type: "grammar", topics: ["ich→mich", "du→dich"] },
  { id: "A1-43", title: "날씨와 계절 심화", band: 5, type: "conversation", topics: ["계절", "기온 표현"] },
  { id: "A1-44", title: "감정 표현", band: 5, type: "vocabulary", topics: ["감정 형용사", "froh/traurig"] },
  { id: "A1-45", title: "좋아요/싫어요 표현", band: 5, type: "conversation", topics: ["gefallen", "mögen"] },
  { id: "A1-46", title: "초대와 제안", band: 5, type: "conversation", topics: ["Möchtest du?", "수락/거절"] },
  { id: "A1-47", title: "은행과 우체국", band: 5, type: "conversation", topics: ["계좌", "송금", "우편"] },
  { id: "A1-48", title: "의사/약국 표현", band: 5, type: "conversation", topics: ["증상 표현", "처방"] },
  { id: "A1-49", title: "집 구하기", band: 5, type: "conversation", topics: ["임대 표현", "집 어휘"] },
  { id: "A1-50", title: "온라인 커뮤니케이션", band: 5, type: "vocabulary", topics: ["이메일 형식"] },
  // Band 6
  { id: "A1-51", title: "독일 문화 - 식사 예절", band: 6, type: "culture", topics: ["Mahlzeit", "팁 문화"] },
  { id: "A1-52", title: "독일 문화 - 시간관념", band: 6, type: "culture", topics: ["Pünktlichkeit"] },
  { id: "A1-53", title: "A1 문법 총정리 1", band: 6, type: "grammar", topics: ["동사변화", "관사", "격"] },
  { id: "A1-54", title: "A1 문법 총정리 2", band: 6, type: "grammar", topics: ["조동사", "분리동사"] },
  { id: "A1-55", title: "A1 어휘 총정리", band: 6, type: "vocabulary", topics: ["핵심 어휘 300"] },
  { id: "A1-56", title: "A1 시험 준비", band: 6, type: "test_prep", topics: ["듣기/읽기/쓰기/말하기"] },
];