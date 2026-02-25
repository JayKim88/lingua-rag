"""
DOKDOKDOK_A1 — All 56 units organized by band.

Structure per unit:
{
    "id": "A1-N",
    "band": N,
    "title": "Korean title",
    "topics": ["topic1", "topic2", ...],
    "grammar_focus": ["grammar point 1", ...],
    "context_prompt": "Additional context for system prompt",
}
"""

from typing import Any

# ---------------------------------------------------------------------------
# Band 1 (A1-1 to A1-7): 자기소개 시리즈
# ---------------------------------------------------------------------------

BAND_1 = {
    "A1-1": {
        "id": "A1-1",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "안녕하세요! 자기소개 기초",
        "topics": ["인사하기", "이름 말하기", "국적 소개"],
        "grammar_focus": ["sein 동사 현재형", "ich/Sie 인칭대명사", "Nominativ"],
        "context_prompt": (
            "이 단원은 독일어 첫 인사와 기초 자기소개를 다룹니다. "
            "Hallo, Guten Morgen, Guten Tag 등 기본 인사말과 "
            "Ich heiße... / Ich bin... 구문을 중심으로 설명하세요."
        ),
    },
    "A1-2": {
        "id": "A1-2",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "직업 소개",
        "topics": ["직업 어휘", "직업 말하기", "부정관사"],
        "grammar_focus": ["부정관사 ein/eine", "Ich bin + 직업", "직업 어휘 목록"],
        "context_prompt": (
            "직업을 소개할 때 사용하는 독일어 구문을 다룹니다. "
            "'Ich bin Lehrer.' (남성) vs 'Ich bin Lehrerin.' (여성) 처럼 "
            "직업 명사의 성별 변화를 반드시 포함하세요."
        ),
    },
    "A1-3": {
        "id": "A1-3",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "거주지와 출신",
        "topics": ["도시/나라 이름", "거주지 표현", "출신 묻기"],
        "grammar_focus": ["aus + Dativ (출신)", "in + Dativ (거주)", "Woher/Wo 의문문"],
        "context_prompt": (
            "거주지와 출신을 표현하는 전치사 aus와 in의 용법을 다룹니다. "
            "Ich komme aus Korea. / Ich wohne in Seoul. 예문을 활용하세요."
        ),
    },
    "A1-4": {
        "id": "A1-4",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "가족 소개",
        "topics": ["가족 어휘", "가족 관계 표현", "소유관사"],
        "grammar_focus": ["소유관사 mein/meine", "가족 명사 성별", "haben 동사"],
        "context_prompt": (
            "가족 어휘와 소유관사 mein/meine의 활용을 다룹니다. "
            "Ich habe einen Bruder. / Meine Mutter heißt... 구문을 중심으로 설명하세요."
        ),
    },
    "A1-5": {
        "id": "A1-5",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "취미와 관심사",
        "topics": ["취미 어휘", "좋아하는 것 말하기", "동사 활용"],
        "grammar_focus": ["mögen 동사", "spielen/lesen/kochen 동사", "gern 부사"],
        "context_prompt": (
            "취미를 표현하는 방법을 다룹니다. "
            "Ich spiele gern Fußball. / Ich lese gern Bücher. 처럼 "
            "gern과 동사의 조합으로 좋아하는 것을 표현하는 방법을 설명하세요."
        ),
    },
    "A1-6": {
        "id": "A1-6",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "나이와 생일",
        "topics": ["나이 묻기/답하기", "생일 표현", "기수 1-100"],
        "grammar_focus": ["Wie alt bist du?", "Ich bin ... Jahre alt.", "기수 1-100"],
        "context_prompt": (
            "나이와 생일을 표현하는 독일어를 다룹니다. "
            "기수 1-100 읽기와 Mein Geburtstag ist am + 서수 표현을 포함하세요."
        ),
    },
    "A1-7": {
        "id": "A1-7",
        "band": 1,
        "band_name": "자기소개 시리즈",
        "title": "연락처와 이메일",
        "topics": ["전화번호 말하기", "이메일 주소 표현", "철자 읽기"],
        "grammar_focus": ["알파벳 읽기", "전화번호 읽는 법", "Wie ist Ihre Telefonnummer?"],
        "context_prompt": (
            "연락처 정보를 교환하는 표현을 다룹니다. "
            "독일어 알파벳 발음과 전화번호를 숫자로 읽는 방법을 포함하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 2 (A1-8 to A1-14): 숫자/시간/동사/약속
# ---------------------------------------------------------------------------

BAND_2 = {
    "A1-8": {
        "id": "A1-8",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "시간 표현",
        "topics": ["시계 읽기", "시간 묻기/답하기", "일상 일정"],
        "grammar_focus": ["Wie spät ist es?", "Es ist ... Uhr.", "um + 시간 전치사"],
        "context_prompt": (
            "시간을 표현하는 독일어를 다룹니다. "
            "공식 시간(13:00 = dreizehn Uhr)과 일상 표현(halb, Viertel)을 모두 다루세요."
        ),
    },
    "A1-9": {
        "id": "A1-9",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "요일과 날짜",
        "topics": ["요일 어휘", "날짜 표현", "달력 읽기"],
        "grammar_focus": ["요일 명사 (der Montag...)", "am + 요일", "서수 (1. = erste...)"],
        "context_prompt": (
            "요일과 날짜를 표현하는 독일어를 다룹니다. "
            "am Montag (월요일에), am 3. März (3월 3일에) 등의 표현을 포함하세요."
        ),
    },
    "A1-10": {
        "id": "A1-10",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "일상 동사 활용",
        "topics": ["규칙 동사 변화", "불규칙 동사 소개", "일상 동작 표현"],
        "grammar_focus": [
            "규칙 동사 현재형 변화 (spielen, wohnen...)",
            "불규칙 동사 fahren/lesen/essen",
            "동사 어간 변화 규칙",
        ],
        "context_prompt": (
            "독일어 규칙/불규칙 동사 현재형을 다룹니다. "
            "어간 e→i, a→ä 변화 패턴을 표로 정리해서 설명하세요."
        ),
    },
    "A1-11": {
        "id": "A1-11",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "일과 표현",
        "topics": ["하루 일과 묘사", "시간 부사", "순서 접속사"],
        "grammar_focus": [
            "시간 부사 (morgens, abends...)",
            "zuerst/dann/danach/schließlich",
            "Trennbare Verben 소개 (aufstehen, einschlafen)",
        ],
        "context_prompt": (
            "하루 일과를 순서대로 표현하는 방법을 다룹니다. "
            "분리동사 aufstehen (ich stehe auf) 소개와 함께 "
            "시간 부사를 활용한 일과 묘사 예문을 제공하세요."
        ),
    },
    "A1-12": {
        "id": "A1-12",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "약속 잡기",
        "topics": ["약속 제안", "시간 확인", "약속 수락/거절"],
        "grammar_focus": [
            "Hast du Zeit am...?",
            "Wir können uns... treffen",
            "Ja, gern! / Leider nicht.",
        ],
        "context_prompt": (
            "약속을 잡는 대화 패턴을 다룹니다. "
            "제안(Haben Sie Zeit am Freitag?) → 수락/거절 → 장소와 시간 확정하는 "
            "대화 흐름 전체를 예문으로 보여주세요."
        ),
    },
    "A1-13": {
        "id": "A1-13",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "장소 표현",
        "topics": ["장소 어휘", "위치 표현", "방향 묻기"],
        "grammar_focus": [
            "in/an/auf + Dativ",
            "Wo ist...? / Wie komme ich zu...?",
            "links, rechts, geradeaus",
        ],
        "context_prompt": (
            "장소를 표현하고 길을 묻는 독일어를 다룹니다. "
            "전치사 in/an/auf의 Dativ 지배와 방향 어휘(links/rechts/geradeaus)를 "
            "지도 맥락에서 설명하세요."
        ),
    },
    "A1-14": {
        "id": "A1-14",
        "band": 2,
        "band_name": "숫자/시간/동사/약속",
        "title": "교통수단",
        "topics": ["교통수단 어휘", "이동 방법 표현", "mit + 교통수단"],
        "grammar_focus": [
            "mit + Dativ (mit dem Bus/der Bahn)",
            "fahren vs. gehen",
            "교통수단 어휘 (Bus, Zug, U-Bahn, Fahrrad...)",
        ],
        "context_prompt": (
            "교통수단을 이용해 이동하는 표현을 다룹니다. "
            "Ich fahre mit dem Bus. vs. Ich gehe zu Fuß. 의 차이와 "
            "mit + Dativ 구문을 명확히 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 3 (A1-15 to A1-21): 주문/쇼핑/조동사
# ---------------------------------------------------------------------------

BAND_3 = {
    "A1-15": {
        "id": "A1-15",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "카페에서 주문하기",
        "topics": ["음료/음식 어휘", "주문 표현", "가격 묻기"],
        "grammar_focus": [
            "Ich möchte... bestellen",
            "Was kostet...? / Das macht ... Euro.",
            "Akkusativ: einen/eine/ein",
        ],
        "context_prompt": (
            "카페나 레스토랑에서 주문하는 표현을 다룹니다. "
            "Ich möchte einen Kaffee bitte. 에서 Akkusativ 관사 변화(einen)를 "
            "명시적으로 설명하세요."
        ),
    },
    "A1-16": {
        "id": "A1-16",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "식료품점 쇼핑",
        "topics": ["식료품 어휘", "수량 표현", "포장 단위"],
        "grammar_focus": [
            "Akkusativ 관사 변화",
            "수량 표현 (ein Kilo, eine Flasche...)",
            "부정 관사 vs 정관사",
        ],
        "context_prompt": (
            "식료품 구입 시 사용하는 독일어를 다룹니다. "
            "ein Kilo Äpfel, eine Flasche Wasser 처럼 수량 단위 어휘와 "
            "Akkusativ 관사 변화를 함께 설명하세요."
        ),
    },
    "A1-17": {
        "id": "A1-17",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "의류 쇼핑",
        "topics": ["의류 어휘", "색상 표현", "치수/사이즈"],
        "grammar_focus": [
            "형용사 서술적 사용",
            "Akkusativ + 형용사",
            "Das steht Ihnen gut.",
        ],
        "context_prompt": (
            "의류를 구매하는 상황의 독일어 대화를 다룹니다. "
            "Ich suche einen Pullover in Blau. / Haben Sie das in Größe M? "
            "예문과 함께 색상 형용사를 설명하세요."
        ),
    },
    "A1-18": {
        "id": "A1-18",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "조동사 können",
        "topics": ["können 의미와 활용", "능력/가능성 표현", "정중한 요청"],
        "grammar_focus": [
            "können 현재형 변화 (kann/kannst/kann...)",
            "Kann ich...? (정중한 요청)",
            "조동사 + 부정사 어순",
        ],
        "context_prompt": (
            "조동사 können의 변화와 용법을 다룹니다. "
            "능력(Ich kann Deutsch sprechen.)과 가능성(Kann ich hier bezahlen?) "
            "두 가지 맥락을 모두 예문으로 보여주세요."
        ),
    },
    "A1-19": {
        "id": "A1-19",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "조동사 müssen",
        "topics": ["müssen 의미와 활용", "의무/필요 표현", "부정 형태"],
        "grammar_focus": [
            "müssen 현재형 변화",
            "nicht müssen vs. nicht dürfen 차이",
            "의무 표현",
        ],
        "context_prompt": (
            "조동사 müssen(~해야 한다)의 변화와 용법을 다룹니다. "
            "특히 nicht müssen(~할 필요 없다)과 nicht dürfen(~하면 안 된다)의 "
            "중요한 의미 차이를 명확한 예문으로 설명하세요."
        ),
    },
    "A1-20": {
        "id": "A1-20",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "조동사 wollen",
        "topics": ["wollen 의미와 활용", "의지/의도 표현", "möchten과 비교"],
        "grammar_focus": [
            "wollen 현재형 변화",
            "wollen vs. möchten 뉘앙스 차이",
            "계획/의도 표현",
        ],
        "context_prompt": (
            "조동사 wollen(~하려고 한다/~하고 싶다)의 변화와 용법을 다룹니다. "
            "Ich will Deutsch lernen.(강한 의지) vs. "
            "Ich möchte Deutsch lernen.(정중한 바람)의 뉘앙스 차이를 강조하세요."
        ),
    },
    "A1-21": {
        "id": "A1-21",
        "band": 3,
        "band_name": "주문/쇼핑/조동사",
        "title": "조동사 dürfen",
        "topics": ["dürfen 의미와 활용", "허가/금지 표현", "규칙 표현"],
        "grammar_focus": [
            "dürfen 현재형 변화",
            "Hier darf man nicht rauchen.",
            "허가 요청 Darf ich...?",
        ],
        "context_prompt": (
            "조동사 dürfen(허가/금지)의 변화와 용법을 다룹니다. "
            "Darf ich hier fotografieren?(허가 요청)과 "
            "Hier darf man nicht parken.(금지) 두 패턴을 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 4 (A1-22 to A1-28): 명령법/교통/전치사
# ---------------------------------------------------------------------------

BAND_4 = {
    "A1-22": {
        "id": "A1-22",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "명령법 (Imperativ)",
        "topics": ["명령문 만들기", "정중한 명령", "일상 명령 표현"],
        "grammar_focus": [
            "du-명령형 (Komm! / Trink!)",
            "Sie-명령형 (Kommen Sie! / Trinken Sie!)",
            "Bitte 사용으로 정중하게",
        ],
        "context_prompt": (
            "독일어 명령법(Imperativ)을 다룹니다. "
            "du형(Komm bitte!)과 Sie형(Kommen Sie bitte!) 형성 규칙을 "
            "표로 정리하고 일상 맥락 예문을 제공하세요."
        ),
    },
    "A1-23": {
        "id": "A1-23",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "대중교통 이용",
        "topics": ["티켓 구매", "노선 확인", "환승 표현"],
        "grammar_focus": [
            "Ich möchte eine Fahrkarte nach... kaufen.",
            "Wo muss ich umsteigen?",
            "Wann fährt der nächste Zug?",
        ],
        "context_prompt": (
            "대중교통(기차, 버스, 지하철) 이용 시 필요한 독일어 표현을 다룹니다. "
            "티켓 구매 대화부터 환승, 플랫폼 확인까지 단계별로 설명하세요."
        ),
    },
    "A1-24": {
        "id": "A1-24",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "장소 전치사 (Wechselpräpositionen)",
        "topics": ["이중 전치사 개념", "정지 vs 이동", "Dativ vs Akkusativ"],
        "grammar_focus": [
            "in/an/auf/unter/über/vor/hinter/neben/zwischen",
            "Wo? → Dativ / Wohin? → Akkusativ",
            "Das Buch liegt auf dem Tisch. / Leg das Buch auf den Tisch.",
        ],
        "context_prompt": (
            "이중 전치사(Wechselpräpositionen)를 다룹니다. "
            "Wo?(위치, Dativ) vs. Wohin?(방향, Akkusativ)의 구분이 핵심입니다. "
            "같은 전치사가 맥락에 따라 격이 달라지는 점을 표와 예문으로 명확히 설명하세요."
        ),
    },
    "A1-25": {
        "id": "A1-25",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "집 묘사와 방 이름",
        "topics": ["집 구조 어휘", "가구 어휘", "방 위치 표현"],
        "grammar_focus": [
            "집 관련 명사 성별",
            "es gibt + Akkusativ",
            "전치사 + Dativ로 위치 설명",
        ],
        "context_prompt": (
            "집과 방을 묘사하는 독일어를 다룹니다. "
            "Meine Wohnung hat zwei Zimmer. / Es gibt ein Sofa im Wohnzimmer. "
            "예문을 활용해 es gibt 구문을 설명하세요."
        ),
    },
    "A1-26": {
        "id": "A1-26",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "길 안내",
        "topics": ["길 묻기", "방향 지시", "랜드마크 활용"],
        "grammar_focus": [
            "Wie komme ich zum/zur...?",
            "Gehen Sie geradeaus / biegen Sie links ab",
            "bis zur / gegenüber von",
        ],
        "context_prompt": (
            "길을 묻고 안내하는 독일어 표현을 다룹니다. "
            "Entschuldigung, wie komme ich zum Bahnhof? 에서 시작해 "
            "방향 지시 표현(geradeaus, links abbiegen, rechts abbiegen)을 포함하세요."
        ),
    },
    "A1-27": {
        "id": "A1-27",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "시간 전치사",
        "topics": ["시간 전치사 용법", "과거/현재/미래 표현", "빈도 부사"],
        "grammar_focus": [
            "um (시각), am (요일/날짜), im (월/계절), an (날짜)",
            "vor, nach, seit, bis",
            "빈도: immer, oft, manchmal, selten, nie",
        ],
        "context_prompt": (
            "시간을 나타내는 전치사들을 체계적으로 다룹니다. "
            "um 8 Uhr / am Montag / im Januar / im Sommer 처럼 "
            "각 시간 단위별로 어떤 전치사를 쓰는지 표로 정리해 주세요."
        ),
    },
    "A1-28": {
        "id": "A1-28",
        "band": 4,
        "band_name": "명령법/교통/전치사",
        "title": "숫자와 가격",
        "topics": ["큰 숫자 읽기", "가격 표현", "계산하기"],
        "grammar_focus": [
            "100 이상 숫자 읽기",
            "Euro/Cent 표현",
            "Das kostet / Das macht",
        ],
        "context_prompt": (
            "큰 숫자와 가격을 표현하는 독일어를 다룹니다. "
            "einhundert, zweihundertfünfzig 등 복합 숫자 읽기와 "
            "쇼핑 상황에서의 가격 묻기/답하기를 포함하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 5 (A1-29 to A1-35): 약속취소/날짜/날씨
# ---------------------------------------------------------------------------

BAND_5 = {
    "A1-29": {
        "id": "A1-29",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "약속 취소와 변경",
        "topics": ["사과 표현", "약속 취소 이유", "새 약속 제안"],
        "grammar_focus": [
            "leider 유감 표현",
            "Ich kann leider nicht kommen, weil...",
            "weil 인과 접속사 (동사 후치)",
        ],
        "context_prompt": (
            "약속을 취소하고 사과하는 표현을 다룹니다. "
            "특히 weil 종속 접속사 사용 시 동사가 문장 끝으로 이동하는 어순 규칙을 "
            "명확히 설명하고 예문을 제공하세요."
        ),
    },
    "A1-30": {
        "id": "A1-30",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "날씨 표현",
        "topics": ["날씨 어휘", "날씨 묻기/답하기", "계절별 날씨"],
        "grammar_focus": [
            "Es ist... (sonnig, bewölkt, kalt)",
            "Es regnet / Es schneit / Es ist windig",
            "Wie ist das Wetter?",
        ],
        "context_prompt": (
            "날씨를 표현하는 독일어를 다룹니다. "
            "비인칭 주어 es의 사용(Es regnet.)과 형용사 서술적 사용(Es ist kalt.)을 "
            "계절별 날씨 어휘와 함께 설명하세요."
        ),
    },
    "A1-31": {
        "id": "A1-31",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "감정 표현",
        "topics": ["감정 어휘", "기분 묻기", "이유 표현"],
        "grammar_focus": [
            "Wie geht es Ihnen/dir?",
            "Ich bin froh/traurig/müde/gestresst",
            "Ich fühle mich...",
        ],
        "context_prompt": (
            "감정과 기분을 표현하는 독일어를 다룹니다. "
            "Wie geht's? 에 대한 다양한 답변과 "
            "재귀동사 sich fühlen의 활용을 포함하세요."
        ),
    },
    "A1-32": {
        "id": "A1-32",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "요리와 음식",
        "topics": ["음식 어휘", "요리 동사", "식사 표현"],
        "grammar_focus": [
            "kochen, backen, braten 동사",
            "Ich esse gern...",
            "Schmeckt es Ihnen?",
        ],
        "context_prompt": (
            "음식과 요리에 관한 독일어를 다룹니다. "
            "독일 음식 문화 어휘(Bratwurst, Schnitzel, Brezel 등)와 "
            "맛을 표현하는 동사 schmecken 활용을 설명하세요."
        ),
    },
    "A1-33": {
        "id": "A1-33",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "건강과 신체",
        "topics": ["신체 부위 어휘", "아픔 표현", "병원 표현"],
        "grammar_focus": [
            "신체 부위 명사 성별",
            "Ich habe Kopfschmerzen. / Mein Bauch tut weh.",
            "weh tun 동사",
        ],
        "context_prompt": (
            "건강과 신체 부위를 표현하는 독일어를 다룹니다. "
            "Ich habe Kopfschmerzen(두통이 있다)과 "
            "Mein Arm tut weh(팔이 아프다) 두 가지 아픔 표현 패턴을 명확히 구분하세요."
        ),
    },
    "A1-34": {
        "id": "A1-34",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "휴가와 여행 계획",
        "topics": ["여행지 어휘", "계획 표현", "미래 표현 (werden)"],
        "grammar_focus": [
            "werden + 부정사 (미래)",
            "Ich werde nach Berlin fahren.",
            "여행 어휘 (Urlaub, Reise, Hotel...)",
        ],
        "context_prompt": (
            "여행 계획을 표현하는 독일어를 다룹니다. "
            "werden을 사용한 미래 시제 구문 소개와 함께 "
            "여행 관련 어휘(Koffer packen, Hotel buchen, Flug nehmen)를 설명하세요."
        ),
    },
    "A1-35": {
        "id": "A1-35",
        "band": 5,
        "band_name": "약속취소/날짜/날씨",
        "title": "초대와 파티",
        "topics": ["초대 표현", "선물 어휘", "파티 대화"],
        "grammar_focus": [
            "Ich lade dich/Sie ein.",
            "Herzlichen Glückwunsch!",
            "schenken + Dativ + Akkusativ",
        ],
        "context_prompt": (
            "초대와 파티 상황의 독일어를 다룹니다. "
            "einladen 분리동사 활용과 "
            "Ich schenke dir ein Buch. 에서 Dativ(dir)와 Akkusativ(ein Buch)의 "
            "역할을 명확히 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 6 (A1-36 to A1-42): 화법조동사 5개
# ---------------------------------------------------------------------------

BAND_6 = {
    "A1-36": {
        "id": "A1-36",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "조동사 sollen",
        "topics": ["sollen 의미와 활용", "지시/의무 표현", "간접 명령"],
        "grammar_focus": [
            "sollen 현재형 변화",
            "외부 지시 표현 (Der Arzt sagt, ich soll...)",
            "sollen vs. müssen 비교",
        ],
        "context_prompt": (
            "조동사 sollen(~해야 한다, 외부 지시)을 다룹니다. "
            "müssen(자체적 필요)과의 차이: "
            "Ich muss arbeiten.(내 필요) vs. Ich soll arbeiten.(남이 시킴) "
            "을 맥락 예문으로 설명하세요."
        ),
    },
    "A1-37": {
        "id": "A1-37",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "조동사 mögen",
        "topics": ["mögen 의미와 활용", "좋아하는 것 표현", "möchten과 관계"],
        "grammar_focus": [
            "mögen 현재형 변화 (mag/magst/mag...)",
            "Ich mag Schokolade.",
            "mögen vs. möchten 차이",
        ],
        "context_prompt": (
            "조동사 mögen의 변화와 용법을 다룹니다. "
            "mögen은 주로 명사와 함께(Ich mag Musik.), "
            "möchten은 동사와 함께(Ich möchte Musik hören.) 쓰이는 패턴을 "
            "비교 예문으로 명확히 설명하세요."
        ),
    },
    "A1-38": {
        "id": "A1-38",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "조동사 총정리",
        "topics": ["5개 조동사 비교", "상황별 선택", "조동사 부정"],
        "grammar_focus": [
            "können/müssen/wollen/dürfen/sollen/mögen 비교",
            "조동사 부정 (nicht dürfen ≠ nicht müssen)",
            "조동사 어순 규칙",
        ],
        "context_prompt": (
            "A1에서 배운 모든 조동사를 총정리합니다. "
            "상황별로 어떤 조동사를 선택해야 하는지 비교표를 제공하고, "
            "nicht를 붙였을 때 의미 변화가 중요한 조동사 쌍(특히 müssen/dürfen)을 "
            "다시 강조하세요."
        ),
    },
    "A1-39": {
        "id": "A1-39",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "분리동사 심화",
        "topics": ["주요 분리동사 목록", "문장 구조", "의문문/명령문에서의 분리동사"],
        "grammar_focus": [
            "분리동사 목록 (aufmachen, anrufen, einladen...)",
            "Ich rufe dich an. → 접두사가 문장 끝으로",
            "Ruf mich an! (명령문)",
        ],
        "context_prompt": (
            "분리동사(Trennbare Verben) 심화를 다룹니다. "
            "자주 쓰이는 분리동사 목록과 함께 "
            "평서문/의문문/명령문에서 접두사 위치 규칙을 예문과 함께 설명하세요."
        ),
    },
    "A1-40": {
        "id": "A1-40",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "부정 표현",
        "topics": ["nicht vs. kein", "부정 대명사", "부정 응답"],
        "grammar_focus": [
            "kein/keine (명사 부정)",
            "nicht (동사/형용사/부사 부정)",
            "Nein / Doch 차이",
        ],
        "context_prompt": (
            "독일어 부정 표현을 다룹니다. "
            "kein은 명사를 부정(Ich habe kein Auto.), "
            "nicht는 동사를 부정(Ich fahre nicht.)하는 규칙을 명확히 설명하고, "
            "부정 질문에 대한 Doch 응답(Fährst du nicht? - Doch!)도 포함하세요."
        ),
    },
    "A1-41": {
        "id": "A1-41",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "의문문 심화",
        "topics": ["W-Fragen 심화", "예/아니오 질문", "간접 의문문 소개"],
        "grammar_focus": [
            "W-Fragen 완성 (wer/was/wo/wann/wie/warum/woher/wohin)",
            "Ja/Nein Fragen 어순",
            "Wissen Sie, wo...? (간접 의문문 소개)",
        ],
        "context_prompt": (
            "독일어 의문문을 심화 학습합니다. "
            "모든 W-Fragen 어휘와 각각의 용도를 정리하고, "
            "간접 의문문 Können Sie mir sagen, wo der Bahnhof ist? 구조를 "
            "간단히 소개하세요."
        ),
    },
    "A1-42": {
        "id": "A1-42",
        "band": 6,
        "band_name": "화법조동사 5개",
        "title": "접속사 (und/aber/oder/denn)",
        "topics": ["등위접속사 4개", "문장 연결", "대조 표현"],
        "grammar_focus": [
            "und (그리고), aber (하지만), oder (또는), denn (왜냐하면)",
            "등위접속사 뒤 어순 (변화 없음)",
            "denn vs. weil 차이",
        ],
        "context_prompt": (
            "4가지 주요 등위접속사를 다룹니다. "
            "등위접속사 뒤에는 어순이 변하지 않고, "
            "종속접속사 weil 뒤에는 동사가 끝으로 가는 차이를 "
            "나란히 예문으로 비교하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 7 (A1-43 to A1-49): 과거표현(Perfekt)
# ---------------------------------------------------------------------------

BAND_7 = {
    "A1-43": {
        "id": "A1-43",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "Perfekt 소개 (haben + 과거분사)",
        "topics": ["Perfekt 개념", "haben과 결합", "규칙 동사 과거분사"],
        "grammar_focus": [
            "ge- + 어간 + -(e)t 규칙 (machen → gemacht)",
            "haben + 과거분사 (문장 끝)",
            "Ich habe gegessen. / Ich habe gespielt.",
        ],
        "context_prompt": (
            "독일어 현재완료(Perfekt)를 소개합니다. "
            "haben을 조동사로 사용하는 규칙 동사 과거분사 형성(ge-...-t)을 "
            "먼저 다루고, 과거분사가 문장 끝에 위치하는 어순 규칙을 강조하세요."
        ),
    },
    "A1-44": {
        "id": "A1-44",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "Perfekt (sein + 과거분사)",
        "topics": ["sein과 결합하는 동사", "이동/상태 변화 동사", "불규칙 과거분사"],
        "grammar_focus": [
            "sein을 취하는 동사 (fahren, gehen, kommen, fliegen...)",
            "이동과 상태 변화 원칙",
            "불규칙 과거분사 목록",
        ],
        "context_prompt": (
            "sein을 조동사로 사용하는 Perfekt를 다룹니다. "
            "이동 동사(fahren, gehen, kommen)와 상태 변화 동사(werden, sterben, aufwachen)가 "
            "sein을 취하는 원칙을 설명하고, 자주 쓰이는 불규칙 과거분사 목록을 제공하세요."
        ),
    },
    "A1-45": {
        "id": "A1-45",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "Perfekt 불규칙 동사",
        "topics": ["주요 불규칙 과거분사", "강변화 동사", "혼합 변화 동사"],
        "grammar_focus": [
            "강변화 동사 과거분사 (ge-...-en): schreiben→geschrieben",
            "essen→gegessen, trinken→getrunken, sprechen→gesprochen",
            "불규칙 목록 암기 전략",
        ],
        "context_prompt": (
            "불규칙 동사의 Perfekt를 다룹니다. "
            "강변화 동사(ge-...-en)와 규칙 동사(ge-...-t)의 차이를 "
            "빈출 어휘 중심으로 표로 정리해 주세요."
        ),
    },
    "A1-46": {
        "id": "A1-46",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "Präteritum 소개 (sein/haben)",
        "topics": ["Präteritum 개념", "sein/haben Präteritum", "구어 vs 문어"],
        "grammar_focus": [
            "war (sein의 과거), hatte (haben의 과거)",
            "Ich war in Berlin. / Ich hatte keine Zeit.",
            "Perfekt vs. Präteritum 사용 맥락",
        ],
        "context_prompt": (
            "단순과거(Präteritum)를 소개합니다. A1 수준에서는 "
            "sein(war)과 haben(hatte)의 단순과거만 학습합니다. "
            "일상 구어에서는 Perfekt, 문어/격식체에서는 Präteritum을 주로 쓰는 "
            "맥락 차이를 설명하세요."
        ),
    },
    "A1-47": {
        "id": "A1-47",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "과거 시간 표현",
        "topics": ["과거 시간 부사", "어제/지난주 표현", "과거 이야기하기"],
        "grammar_focus": [
            "gestern, vorgestern, letzte Woche, letztes Jahr",
            "vor + Dativ (vor drei Tagen)",
            "과거 시제와 시간 표현 결합",
        ],
        "context_prompt": (
            "과거를 나타내는 시간 표현을 다룹니다. "
            "gestern / letzte Woche / vor einem Jahr 등의 어휘와 "
            "Perfekt 시제를 조합하는 예문을 제공하세요."
        ),
    },
    "A1-48": {
        "id": "A1-48",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "분리동사 Perfekt",
        "topics": ["분리동사 과거분사 형성", "ge- 위치", "복합 과거 구조"],
        "grammar_focus": [
            "aufmachen → aufgemacht (ge는 접두사와 어간 사이)",
            "anrufen → angerufen",
            "Ich habe früh aufgestanden.",
        ],
        "context_prompt": (
            "분리동사의 Perfekt 형성 규칙을 다룹니다. "
            "ge-가 접두사와 어간 사이에 삽입되는 규칙(auf-ge-macht)을 "
            "여러 분리동사 예시와 함께 설명하세요."
        ),
    },
    "A1-49": {
        "id": "A1-49",
        "band": 7,
        "band_name": "과거표현(Perfekt)",
        "title": "Perfekt 종합 연습",
        "topics": ["haben vs sein 선택", "과거 이야기 쓰기", "대화 연습"],
        "grammar_focus": [
            "haben vs sein 결정 규칙 종합",
            "과거 내러티브 구성",
            "시간 표현과 Perfekt 조합",
        ],
        "context_prompt": (
            "Perfekt 문법을 종합 정리합니다. "
            "haben vs sein 선택 기준(이동/상태 변화 = sein, 나머지 = haben)을 "
            "체크리스트 형식으로 제공하고 연습 대화문 예시를 포함하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 8 (A1-50 to A1-56): 경험/신체/묘사/소유
# ---------------------------------------------------------------------------

BAND_8 = {
    "A1-50": {
        "id": "A1-50",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "경험 표현",
        "topics": ["경험 묻기", "Perfekt로 경험 표현", "noch nie / schon mal"],
        "grammar_focus": [
            "Hast du schon mal... gemacht?",
            "Ich habe noch nie... gemacht.",
            "schon / noch nicht / noch nie",
        ],
        "context_prompt": (
            "과거 경험을 표현하는 독일어를 다룹니다. "
            "Hast du schon mal Sushi gegessen? / "
            "Nein, ich habe noch nie Sushi gegessen. "
            "의 대화 패턴과 schon/noch 부사의 뉘앙스를 설명하세요."
        ),
    },
    "A1-51": {
        "id": "A1-51",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "외모 묘사",
        "topics": ["외모 어휘", "형용사 사용", "사람 묘사"],
        "grammar_focus": [
            "형용사 서술적 사용 (Er ist groß / Sie ist schlank)",
            "머리카락/눈 색 표현",
            "Er/Sie sieht aus wie...",
        ],
        "context_prompt": (
            "사람의 외모를 묘사하는 독일어를 다룹니다. "
            "키/체형/머리카락/눈 색 등 외모 어휘와 함께 "
            "형용사를 서술어로 사용하는 방법을 설명하세요."
        ),
    },
    "A1-52": {
        "id": "A1-52",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "성격 묘사",
        "topics": ["성격 어휘", "성격 표현하기", "비교 표현 소개"],
        "grammar_focus": [
            "성격 형용사 (freundlich, lustig, ruhig, fleißig...)",
            "Ich bin ein bisschen...",
            "Vergleich: Er ist freundlicher als...",
        ],
        "context_prompt": (
            "성격을 표현하는 독일어를 다룹니다. "
            "긍정/부정 성격 형용사 목록과 함께 "
            "ein bisschen (조금), sehr (매우)로 정도를 나타내는 방법을 설명하세요. "
            "비교급은 간단히만 소개하세요."
        ),
    },
    "A1-53": {
        "id": "A1-53",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "소유 표현 심화",
        "topics": ["소유관사 전체 변화표", "Dativ 소유관사", "소유 의문사"],
        "grammar_focus": [
            "소유관사 변화 (mein/dein/sein/ihr/unser/euer/Ihr)",
            "Dativ 소유관사: meinem/meiner/meinem",
            "Wessen? (누구의?) 소유 의문사",
        ],
        "context_prompt": (
            "소유관사의 전체 격변화를 다룹니다. "
            "Nom/Akk/Dativ에 따른 소유관사 변화표를 제공하고 "
            "Wessen Auto ist das? - Das ist mein Auto. 예문을 포함하세요."
        ),
    },
    "A1-54": {
        "id": "A1-54",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "건강 문제와 조언",
        "topics": ["건강 조언 표현", "sollen/müssen 활용", "병원 대화"],
        "grammar_focus": [
            "Du solltest mehr schlafen.",
            "Sie müssen viel Wasser trinken.",
            "Konjunktiv II: sollte (조언) 소개",
        ],
        "context_prompt": (
            "건강 조언을 표현하는 독일어를 다룹니다. "
            "조동사 sollen과 함께 접속법 2식 sollte를 간단히 소개하고, "
            "의사-환자 대화 시나리오를 예문으로 제공하세요."
        ),
    },
    "A1-55": {
        "id": "A1-55",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "A1 문법 총정리",
        "topics": ["A1 핵심 문법 복습", "격 체계 정리", "동사 변화 총정리"],
        "grammar_focus": [
            "Nominativ/Akkusativ/Dativ 정리",
            "규칙/불규칙 동사 현재형 총정리",
            "Perfekt 총정리",
        ],
        "context_prompt": (
            "A1 전체 핵심 문법을 총정리합니다. "
            "학습자가 A1 내용을 구조적으로 복습할 수 있도록 "
            "격 체계(Nom/Akk/Dat) 관사 변화표, 주요 조동사 비교표, "
            "자주 쓰이는 Perfekt 동사 목록을 제공하세요."
        ),
    },
    "A1-56": {
        "id": "A1-56",
        "band": 8,
        "band_name": "경험/신체/묘사/소유",
        "title": "A1 → A2 다리 단원",
        "topics": ["A2 예고", "A1 성취 확인", "다음 단계 안내"],
        "grammar_focus": [
            "A1 핵심 표현 총복습",
            "A2에서 배울 내용 소개 (Dativ 심화, Perfekt 확장, Nebensatz)",
            "자기 평가 체크리스트",
        ],
        "context_prompt": (
            "A1 학습을 마무리하고 A2로의 전환을 안내합니다. "
            "A1에서 배운 핵심 표현을 목록으로 정리하고, "
            "A2에서 어떤 내용이 확장되는지 미리 보여주는 동기 부여적 내용을 포함하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Unified lookup dictionary
# ---------------------------------------------------------------------------

DOKDOKDOK_A1: dict[str, dict[str, Any]] = {
    **BAND_1,
    **BAND_2,
    **BAND_3,
    **BAND_4,
    **BAND_5,
    **BAND_6,
    **BAND_7,
    **BAND_8,
}

# Ordered list for navigation and summary table generation
DOKDOKDOK_A1_ORDERED: list[dict[str, Any]] = [
    DOKDOKDOK_A1[f"A1-{i}"] for i in range(1, 57)
]

BANDS: dict[int, str] = {
    1: "자기소개 시리즈",
    2: "숫자/시간/동사/약속",
    3: "주문/쇼핑/조동사",
    4: "명령법/교통/전치사",
    5: "약속취소/날짜/날씨",
    6: "화법조동사 5개",
    7: "과거표현(Perfekt)",
    8: "경험/신체/묘사/소유",
}