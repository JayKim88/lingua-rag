"""
DOKDOKDOK_A1 — All 56 units organized by band.

Titles and band structure match the actual PDF textbook (독독독 A1).

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
# Band 1 (A1-1 to A1-7): 알파벳과 자기소개
# ---------------------------------------------------------------------------

BAND_1 = {
    "A1-1": {
        "id": "A1-1",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "알파벳과 발음 익히기",
        "topics": ["독일어 알파벳", "Umlaut 발음", "이중자음 발음"],
        "grammar_focus": [
            "독일어 알파벳 26자 + Umlauts (ä, ö, ü)",
            "이중모음 발음 (ei, eu, au)",
            "이중자음 발음 (ch, sch, sp, st, ng)",
        ],
        "context_prompt": (
            "독일어 알파벳과 발음 규칙을 다룹니다. "
            "A-Z 알파벳 읽기, Umlaut(ä/ö/ü) 발음, "
            "sch/ch/sp/st 등 특수 발음 규칙을 포함하세요."
        ),
    },
    "A1-2": {
        "id": "A1-2",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "자기소개 1 – 인사하기",
        "topics": ["인사말", "이름 말하기", "sein 동사"],
        "grammar_focus": [
            "Hallo / Guten Morgen / Guten Tag / Auf Wiedersehen",
            "sein 동사 현재형 (ich bin, Sie sind)",
            "Ich bin... 자기소개 구문",
        ],
        "context_prompt": (
            "기본 인사말과 자기소개를 다룹니다. "
            "Hallo/Guten Morgen/Auf Wiedersehen 인사와 "
            "Ich bin Maria. 자기소개 구문을 설명하세요."
        ),
    },
    "A1-3": {
        "id": "A1-3",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "자기소개 2 – 안부",
        "topics": ["안부 묻기", "Wie geht es Ihnen?", "감사 표현"],
        "grammar_focus": [
            "Wie geht es Ihnen? / Wie geht's?",
            "Danke, gut. / Es geht. / Nicht so gut.",
            "격식체(Ihnen) vs 비격식체(dir) 구분",
        ],
        "context_prompt": (
            "안부를 묻고 답하는 독일어를 다룹니다. "
            "격식체(Wie geht es Ihnen?)와 비격식체(Wie geht's?) 차이와 "
            "다양한 답변 표현(Danke, gut. / Es geht.)을 설명하세요."
        ),
    },
    "A1-4": {
        "id": "A1-4",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "자기소개 3 – 이름",
        "topics": ["이름 묻기/답하기", "heißen 동사", "격식/비격식"],
        "grammar_focus": [
            "Wie heißen Sie? (격식) / Wie heißt du? (비격식)",
            "heißen 동사 현재형 변화",
            "Mein Name ist... / Ich heiße...",
        ],
        "context_prompt": (
            "이름을 묻고 답하는 독일어를 다룹니다. "
            "heißen 동사 변화와 Wie heißen Sie?(격식) vs Wie heißt du?(비격식) "
            "구분을 설명하세요."
        ),
    },
    "A1-5": {
        "id": "A1-5",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "자기소개 4 – 국적",
        "topics": ["나라 이름", "국적 표현", "kommen aus"],
        "grammar_focus": [
            "Woher kommen Sie? / Woher kommst du?",
            "Ich komme aus + 나라 (Korea, Deutschland, Japan...)",
            "주요 나라 이름 어휘",
        ],
        "context_prompt": (
            "국적과 출신을 표현하는 독일어를 다룹니다. "
            "kommen aus + 나라명 구문과 주요 나라 이름 어휘를 포함하세요."
        ),
    },
    "A1-6": {
        "id": "A1-6",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "자기소개 5 – 직업",
        "topics": ["직업 어휘", "직업 표현", "성별 직업명"],
        "grammar_focus": [
            "Was sind Sie von Beruf?",
            "Ich bin + 직업 (무관사 규칙)",
            "직업 명사 성별 변화 (Lehrer/Lehrerin)",
        ],
        "context_prompt": (
            "직업을 소개하는 독일어를 다룹니다. "
            "Ich bin Lehrer.(직업은 무관사) 규칙과 "
            "남성/여성 직업 명사 변화(Lehrer→Lehrerin)를 설명하세요."
        ),
    },
    "A1-7": {
        "id": "A1-7",
        "band": 1,
        "band_name": "알파벳과 자기소개",
        "title": "자기소개 6 – 취미",
        "topics": ["취미 어휘", "gern + 동사", "취미 말하기"],
        "grammar_focus": [
            "Was machen Sie gern?",
            "gern + 동사 (취미 표현): Ich spiele gern Fußball.",
            "주요 취미 동사 (spielen, lesen, kochen, reisen...)",
        ],
        "context_prompt": (
            "취미를 묻고 표현하는 독일어를 다룹니다. "
            "gern을 동사와 함께 써서 좋아하는 활동을 표현하는 방법과 "
            "취미 관련 동사 어휘를 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 2 (A1-8 to A1-14): 숫자·시간·동사·약속
# ---------------------------------------------------------------------------

BAND_2 = {
    "A1-8": {
        "id": "A1-8",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "숫자",
        "topics": ["기수 0-100", "큰 숫자", "숫자 활용"],
        "grammar_focus": [
            "기수 0-20 개별 암기",
            "21-99 규칙 (einundzwanzig, zweiunddreißig...)",
            "einhundert, tausend + 전화번호/나이 활용",
        ],
        "context_prompt": (
            "독일어 숫자 체계를 다룹니다. "
            "0-20까지 기본 숫자, 21-99의 규칙(einer+zehner 순서), "
            "100/1000 읽기를 단계별로 설명하세요."
        ),
    },
    "A1-9": {
        "id": "A1-9",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "시간/시각",
        "topics": ["시계 읽기", "Wie spät ist es?", "halb/Viertel"],
        "grammar_focus": [
            "Wie spät ist es? / Wie viel Uhr ist es?",
            "Es ist ... Uhr (공식 시간)",
            "halb, Viertel nach, Viertel vor (일상 시간 표현)",
        ],
        "context_prompt": (
            "시각을 읽고 표현하는 독일어를 다룹니다. "
            "공식 시간(13:00 = dreizehn Uhr)과 일상 표현(halb zwei, Viertel nach drei)을 "
            "모두 설명하세요."
        ),
    },
    "A1-10": {
        "id": "A1-10",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "동사 sprechen 말하다",
        "topics": ["sprechen 어간 변화", "e→i 변화 동사", "언어 표현"],
        "grammar_focus": [
            "sprechen 어간 변화 (e→i): ich spreche, du sprichst, er spricht",
            "e→i 변화 동사 그룹 (sehen, nehmen, helfen...)",
            "Ich spreche Deutsch/Koreanisch. 언어 표현",
        ],
        "context_prompt": (
            "어간이 e→i로 변화하는 강변화 동사 sprechen을 다룹니다. "
            "동사 변화 표와 함께 Ich spreche Deutsch/Koreanisch. 처럼 "
            "언어 표현에 활용하는 예문을 제공하세요."
        ),
    },
    "A1-11": {
        "id": "A1-11",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "이동을 나타내는 동사 gehen fahren fliegen",
        "topics": ["이동 동사", "fahren 어간 변화", "교통수단과 동사"],
        "grammar_focus": [
            "gehen (걸어서 이동)",
            "fahren 어간 변화 (a→ä): du fährst, er fährt",
            "fliegen (비행기로 이동) + 교통수단별 동사 선택",
        ],
        "context_prompt": (
            "이동을 나타내는 세 동사 gehen/fahren/fliegen을 다룹니다. "
            "이동 수단에 따른 동사 선택(걸어서=gehen, 탈것=fahren, 비행기=fliegen)과 "
            "fahren의 어간 변화(du fährst)를 설명하세요."
        ),
    },
    "A1-12": {
        "id": "A1-12",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "동사 essen 먹다",
        "topics": ["essen 어간 변화", "e→i 변화", "음식 표현"],
        "grammar_focus": [
            "essen 어간 변화 (e→i): ich esse, du isst, er isst",
            "Ich esse gern... / Was essen Sie gern?",
            "음식 어휘 + 식사 표현",
        ],
        "context_prompt": (
            "어간 변화 동사 essen을 중심으로 식사와 음식 표현을 다룹니다. "
            "du isst (불규칙 변화)를 강조하고 "
            "음식 어휘와 Ich esse gern + 음식 예문을 제공하세요."
        ),
    },
    "A1-13": {
        "id": "A1-13",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "약속하기",
        "topics": ["약속 제안", "시간 확인", "약속 수락/거절"],
        "grammar_focus": [
            "Haben Sie/Hast du Zeit am...?",
            "Wir können uns um ... Uhr treffen.",
            "수락: Ja, gern! / 거절: Leider nicht.",
        ],
        "context_prompt": (
            "약속을 잡는 대화 패턴을 다룹니다. "
            "제안 → 수락/거절 → 시간/장소 확정의 약속 대화 흐름 전체를 "
            "예문으로 보여주세요."
        ),
    },
    "A1-14": {
        "id": "A1-14",
        "band": 2,
        "band_name": "숫자·시간·동사·약속",
        "title": "위치 찾기",
        "topics": ["위치 묻기", "Wo ist...?", "방향 안내"],
        "grammar_focus": [
            "Entschuldigung, wo ist...?",
            "Da drüben / Hier / Dort (여기/저기/거기)",
            "Links, rechts, geradeaus 기본 방향",
        ],
        "context_prompt": (
            "위치를 묻고 안내하는 기초 표현을 다룹니다. "
            "Entschuldigung으로 시작하는 위치 질문과 "
            "간단한 위치 답변(Da drüben / Links / Geradeaus)을 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 3 (A1-15 to A1-21): 주문·쇼핑·의문문·분리동사
# ---------------------------------------------------------------------------

BAND_3 = {
    "A1-15": {
        "id": "A1-15",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "주문하기",
        "topics": ["음료/음식 주문", "möchten 활용", "가격 묻기"],
        "grammar_focus": [
            "Ich möchte... bestellen/haben",
            "Akkusativ: einen/eine/ein 관사 변화",
            "Was kostet...? / Das macht ... Euro.",
        ],
        "context_prompt": (
            "카페/레스토랑에서 주문하는 표현을 다룹니다. "
            "Ich möchte einen Kaffee bitte. 에서 Akkusativ 관사 변화(einen)와 "
            "가격 묻기/답하기 표현을 설명하세요."
        ),
    },
    "A1-16": {
        "id": "A1-16",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "물건사기",
        "topics": ["쇼핑 어휘", "Akkusativ 관사", "가격 표현"],
        "grammar_focus": [
            "Ich suche... / Haben Sie...?",
            "Akkusativ 관사 변화 총정리 (den/die/das → den/die/das)",
            "Das kostet... / Ich nehme das.",
        ],
        "context_prompt": (
            "가게에서 물건을 사는 상황의 독일어를 다룹니다. "
            "상품 찾기 → 가격 묻기 → 구매 결정하기의 쇼핑 대화 흐름을 "
            "예문으로 설명하세요."
        ),
    },
    "A1-17": {
        "id": "A1-17",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "수량/양을 묻는 의문문 Wie viel(e)~",
        "topics": ["Wie viel/Wie viele", "수량 표현", "단위 어휘"],
        "grammar_focus": [
            "Wie viel + 불가산 명사 (Wie viel kostet das? / Wie viel Mehl?)",
            "Wie viele + 가산 복수 (Wie viele Äpfel?)",
            "수량 단위 어휘 (ein Kilo, eine Flasche, ein Liter...)",
        ],
        "context_prompt": (
            "수량을 묻는 의문문 Wie viel/Wie viele를 다룹니다. "
            "불가산 명사(Wie viel Mehl?)와 가산 복수 명사(Wie viele Eier?) 구분과 "
            "식료품점 상황 예문을 제공하세요."
        ),
    },
    "A1-18": {
        "id": "A1-18",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "기간을 묻는 의문문 Wie lange~",
        "topics": ["Wie lange?", "기간 표현", "seit 전치사"],
        "grammar_focus": [
            "Wie lange dauert das?",
            "기간 단위: Minuten/Stunden/Tage/Wochen/Jahre",
            "seit + Dativ (Ich lerne seit zwei Jahren Deutsch.)",
        ],
        "context_prompt": (
            "기간을 묻는 의문문 Wie lange?를 다룹니다. "
            "기간 단위 어휘와 seit를 이용한 지속 기간 표현을 설명하세요."
        ),
    },
    "A1-19": {
        "id": "A1-19",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "능력과 가능성을 나타내는 화법조동사 können",
        "topics": ["können 변화", "능력/가능성 표현", "정중한 요청"],
        "grammar_focus": [
            "können 현재형 변화 (kann/kannst/kann/können/könnt/können)",
            "능력: Ich kann Deutsch sprechen.",
            "가능성/허가: Kann ich hier bezahlen? / Können Sie mir helfen?",
        ],
        "context_prompt": (
            "화법조동사 können의 변화와 두 가지 용법을 다룹니다. "
            "능력(Ich kann schwimmen.)과 가능성/허가(Kann ich hier telefonieren?)의 "
            "맥락 차이를 예문으로 설명하세요."
        ),
    },
    "A1-20": {
        "id": "A1-20",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "부탁 및 요청하기",
        "topics": ["부탁 표현", "bitte 활용", "요청 수락/거절"],
        "grammar_focus": [
            "Können Sie mir bitte...? (정중한 요청)",
            "Bitte + 명령법 (Warten Sie bitte!)",
            "요청 수락: Ja, natürlich! / 거절: Tut mir leid.",
        ],
        "context_prompt": (
            "부탁과 요청을 표현하는 독일어를 다룹니다. "
            "명령법(Geben Sie mir bitte...)과 können을 이용한 정중한 요청(Können Sie mir helfen?) "
            "표현을 설명하고 수락/거절 응답도 포함하세요."
        ),
    },
    "A1-21": {
        "id": "A1-21",
        "band": 3,
        "band_name": "주문·쇼핑·의문문·분리동사",
        "title": "분리동사",
        "topics": ["분리동사 개념", "접두사 위치", "주요 분리동사"],
        "grammar_focus": [
            "분리동사 구조: 분리 접두사 + 기본 동사",
            "접두사가 문장 끝으로 이동: Ich stehe um 7 Uhr auf.",
            "주요 분리동사 목록 (aufstehen, anrufen, einladen, abfahren...)",
        ],
        "context_prompt": (
            "독일어 분리동사(Trennbare Verben)를 소개합니다. "
            "접두사가 분리되어 문장 끝으로 가는 규칙과 "
            "자주 쓰이는 분리동사 목록을 예문과 함께 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 4 (A1-22 to A1-28): 명령법·교통·전치사·방묘사
# ---------------------------------------------------------------------------

BAND_4 = {
    "A1-22": {
        "id": "A1-22",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "명령법",
        "topics": ["du형 명령", "Sie형 명령", "Bitte 정중 표현"],
        "grammar_focus": [
            "du-명령형: 어간 (Komm! / Trink!) — e→i 변화 동사는 변화형 유지",
            "Sie-명령형: 동사원형 + Sie (Kommen Sie! / Trinken Sie!)",
            "ihr-명령형: -t 어미 (Kommt! / Trinkt!)",
        ],
        "context_prompt": (
            "독일어 명령법(Imperativ)을 다룹니다. "
            "du형/ihr형/Sie형 형성 규칙을 표로 정리하고, "
            "Bitte 추가로 정중하게 만드는 방법을 일상 맥락 예문으로 설명하세요."
        ),
    },
    "A1-23": {
        "id": "A1-23",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "교통수단",
        "topics": ["교통수단 어휘", "mit + Dativ", "이동 동사 선택"],
        "grammar_focus": [
            "교통수단 어휘 (der Bus, der Zug, die U-Bahn, das Fahrrad...)",
            "mit + Dativ (mit dem Bus / mit der Bahn / mit dem Auto)",
            "fahren vs. gehen zu Fuß vs. fliegen",
        ],
        "context_prompt": (
            "교통수단 어휘와 이동 표현을 다룹니다. "
            "mit dem Bus/mit der U-Bahn처럼 mit + Dativ 정관사 변화와 "
            "교통수단별 적절한 동사 선택을 설명하세요."
        ),
    },
    "A1-24": {
        "id": "A1-24",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "길묻기",
        "topics": ["길 묻기", "방향 지시", "좌/우/직진"],
        "grammar_focus": [
            "Entschuldigung, wie komme ich zum/zur...? (zum = zu+dem, zur = zu+der)",
            "Gehen Sie geradeaus / biegen Sie links/rechts ab",
            "bis zur Kreuzung / an der Ampel / gegenüber von",
        ],
        "context_prompt": (
            "길을 묻고 안내하는 독일어를 다룹니다. "
            "정중한 질문으로 시작해 방향 지시 표현(geradeaus, links/rechts abbiegen)과 "
            "랜드마크를 활용한 안내를 단계별로 설명하세요."
        ),
    },
    "A1-25": {
        "id": "A1-25",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "위치를 나타내는 전치사",
        "topics": ["Wo? + Dativ", "위치 전치사 9개", "정관사 Dativ 변화"],
        "grammar_focus": [
            "Wo? + Dativ 지배: in/an/auf/unter/über/vor/hinter/neben/zwischen",
            "Das Buch liegt auf dem Tisch. / Die Lampe hängt an der Wand.",
            "정관사 Dativ 변화: dem/der/dem/den",
        ],
        "context_prompt": (
            "위치를 나타내는 전치사(Wo? + Dativ)를 다룹니다. "
            "9개 전치사의 의미와 함께 정관사 Dativ 변화를 설명하고, "
            "가구/물건의 위치를 묘사하는 예문을 제공하세요."
        ),
    },
    "A1-26": {
        "id": "A1-26",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "위치의 이동을 나타내는 전치사",
        "topics": ["Wohin? + Akkusativ", "이중 전치사", "liegen/legen 구분"],
        "grammar_focus": [
            "Wohin? + Akkusativ: Ich lege das Buch auf den Tisch.",
            "Wechselpräpositionen: Wo?(Dativ) vs Wohin?(Akkusativ)",
            "위치동사 쌍: liegen/legen, stehen/stellen, hängen/hängen",
        ],
        "context_prompt": (
            "이동/방향을 나타내는 전치사(Wohin? + Akkusativ)를 다룹니다. "
            "Wo?(위치=Dativ) vs Wohin?(방향=Akkusativ) 이중 전치사 구분이 핵심입니다. "
            "liegen/legen, stehen/stellen 동사 쌍도 함께 설명하세요."
        ),
    },
    "A1-27": {
        "id": "A1-27",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "방 묘사하기",
        "topics": ["집/방 어휘", "가구 어휘", "es gibt 구문"],
        "grammar_focus": [
            "방 이름: das Wohnzimmer, das Schlafzimmer, die Küche, das Badezimmer...",
            "es gibt + Akkusativ (In meinem Zimmer gibt es...)",
            "가구 어휘와 위치 전치사 결합 (Das Sofa steht vor dem Fernseher.)",
        ],
        "context_prompt": (
            "집과 방을 묘사하는 독일어를 다룹니다. "
            "방 이름과 가구 어휘, es gibt 구문으로 방 안의 물건을 설명하는 방법을 "
            "위치 전치사와 결합한 예문으로 설명하세요."
        ),
    },
    "A1-28": {
        "id": "A1-28",
        "band": 4,
        "band_name": "명령법·교통·전치사·방묘사",
        "title": "도움 요청하기",
        "topics": ["도움 요청 표현", "können 활용", "감사 표현"],
        "grammar_focus": [
            "Können Sie mir helfen? / Könnten Sie bitte...?",
            "Ich brauche Hilfe. / Darf ich Sie etwas fragen?",
            "Danke sehr! / Das ist sehr nett von Ihnen.",
        ],
        "context_prompt": (
            "도움을 요청하고 제공하는 독일어 표현을 다룹니다. "
            "다양한 정중함 수준의 요청 표현(Kannst du...?, Können Sie...?)과 "
            "도움에 감사하는 표현을 상황별로 설명하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 5 (A1-29 to A1-35): 약속·날짜·날씨·의사표현
# ---------------------------------------------------------------------------

BAND_5 = {
    "A1-29": {
        "id": "A1-29",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "약속 취소 및 연기",
        "topics": ["약속 취소", "weil 접속사", "새 약속 제안"],
        "grammar_focus": [
            "Ich muss leider absagen. / Ich kann leider nicht kommen.",
            "weil 종속접속사 (동사 후치): ..., weil ich krank bin.",
            "Können wir auf ... verschieben?",
        ],
        "context_prompt": (
            "약속을 취소하거나 미루는 표현을 다룹니다. "
            "leider + 취소 표현, weil 인과 접속사(동사가 끝으로 이동하는 어순), "
            "새 날짜 제안 패턴을 예문으로 설명하세요."
        ),
    },
    "A1-30": {
        "id": "A1-30",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "날짜",
        "topics": ["서수 읽기", "날짜 표현", "am + 날짜"],
        "grammar_focus": [
            "서수 형성: 1-19 → -te (erste, zweite, dritte...), 20+ → -ste",
            "예외: erste, dritte, siebte, achte",
            "am + 서수 + Monat: am ersten März / am 1. März",
        ],
        "context_prompt": (
            "날짜를 표현하는 독일어를 다룹니다. "
            "서수 형성 규칙(1-19: -te, 20-: -ste)과 예외를 정리하고, "
            "am 1. (ersten) Mai처럼 날짜를 말하는 방법을 설명하세요."
        ),
    },
    "A1-31": {
        "id": "A1-31",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "편지/이메일 쓰기",
        "topics": ["편지 형식", "인사말/마무리말", "격식/비격식"],
        "grammar_focus": [
            "격식체 인사: Sehr geehrte Frau.../Sehr geehrter Herr...",
            "비격식체: Liebe Maria / Lieber Max",
            "마무리: Mit freundlichen Grüßen / Viele Grüße / Liebe Grüße",
        ],
        "context_prompt": (
            "독일어 편지와 이메일 형식을 다룹니다. "
            "격식체(Sehr geehrte Frau Schmidt)와 비격식체(Lieber Max) 인사말 구분, "
            "본문 구조, 마무리 표현을 예시 편지와 함께 설명하세요."
        ),
    },
    "A1-32": {
        "id": "A1-32",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "시간전치사",
        "topics": ["um/am/im 구분", "vor/nach/seit/bis", "시간 전치사 체계"],
        "grammar_focus": [
            "um + 시각 (um 8 Uhr), am + 요일/날짜 (am Montag, am 1. Mai)",
            "im + 월/계절 (im Januar, im Sommer)",
            "vor/nach/seit/bis + Dativ (vor drei Tagen, seit einem Jahr)",
        ],
        "context_prompt": (
            "시간을 나타내는 전치사 체계를 다룹니다. "
            "시각(um), 요일/날짜(am), 월/계절(im)의 전치사 선택 규칙을 표로 정리하고, "
            "vor/nach/seit/bis의 용법을 예문과 함께 설명하세요."
        ),
    },
    "A1-33": {
        "id": "A1-33",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "날씨",
        "topics": ["날씨 어휘", "비인칭 es", "계절별 날씨"],
        "grammar_focus": [
            "Es ist + 날씨 형용사 (sonnig, bewölkt, kalt, warm, heiß...)",
            "비인칭 주어: Es regnet. / Es schneit. / Es ist windig.",
            "Wie ist das Wetter heute? / Wie wird das Wetter?",
        ],
        "context_prompt": (
            "날씨를 표현하는 독일어를 다룹니다. "
            "비인칭 주어 es의 사용(Es regnet/schneit)과 "
            "형용사 서술적 사용(Es ist sonnig/kalt)을 계절별 날씨 어휘와 함께 설명하세요."
        ),
    },
    "A1-34": {
        "id": "A1-34",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "찬성/반대 의견 말하기",
        "topics": ["찬성 표현", "반대 표현", "의견 말하기"],
        "grammar_focus": [
            "찬성: Ich finde das gut. / Das stimmt. / Ich bin dafür.",
            "반대: Ich bin dagegen. / Das finde ich nicht so gut. / Ich bin anderer Meinung.",
            "의견: Ich meine/denke/glaube, dass... (dass 접속사 + 동사 후치)",
        ],
        "context_prompt": (
            "찬성과 반대 의견을 표현하는 독일어를 다룹니다. "
            "다양한 강도의 동의/반대 표현 목록과 "
            "의견을 이유와 함께 말하는 방법(Ich bin dafür, weil...)을 설명하세요."
        ),
    },
    "A1-35": {
        "id": "A1-35",
        "band": 5,
        "band_name": "약속·날짜·날씨·의사표현",
        "title": "W-의문문 만들기",
        "topics": ["W-Fragen 8개", "의문사 정리", "의문문 어순"],
        "grammar_focus": [
            "8개 기본 의문사: wer/was/wo/wann/wie/warum/woher/wohin",
            "의문사 + 동사 + 주어 어순",
            "복합 의문사: Wie lange? / Wie oft? / Wie viel?",
        ],
        "context_prompt": (
            "독일어 W-의문문을 체계적으로 다룹니다. "
            "8개 기본 의문사의 의미와 용법을 정리하고 "
            "각 의문사로 만드는 질문 예문을 제공하세요. "
            "wie lange, wie oft 등 복합 의문사도 포함하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 6 (A1-36 to A1-42): 화법조동사
# ---------------------------------------------------------------------------

BAND_6 = {
    "A1-36": {
        "id": "A1-36",
        "band": 6,
        "band_name": "화법조동사",
        "title": "의지와 바람을 나타내는 화법조동사 wollen/möchten",
        "topics": ["wollen/möchten 변화", "의지 vs 바람", "뉘앙스 비교"],
        "grammar_focus": [
            "wollen 현재형 (will/willst/will/wollen/wollt/wollen)",
            "möchten 현재형 (möchte/möchtest/möchte...)",
            "wollen(강한 의지) vs möchten(정중한 바람) 뉘앙스 비교",
        ],
        "context_prompt": (
            "화법조동사 wollen과 möchten을 함께 다룹니다. "
            "Ich will Deutsch lernen.(강한 의지) vs "
            "Ich möchte Deutsch lernen.(정중한 바람)의 뉘앙스 차이와 "
            "각각의 변화표를 설명하세요."
        ),
    },
    "A1-37": {
        "id": "A1-37",
        "band": 6,
        "band_name": "화법조동사",
        "title": "의무와 당위를 나타내는 화법조동사 müssen",
        "topics": ["müssen 변화", "의무 표현", "nicht müssen vs nicht dürfen"],
        "grammar_focus": [
            "müssen 현재형 (muss/musst/muss/müssen/müsst/müssen)",
            "의무/필요: Ich muss arbeiten. / Du musst das essen.",
            "nicht müssen(불필요 ≠ 금지) vs nicht dürfen(금지) 핵심 구분",
        ],
        "context_prompt": (
            "화법조동사 müssen(~해야 한다)의 변화와 용법을 다룹니다. "
            "특히 nicht müssen(~할 필요 없다)과 nicht dürfen(~하면 안 된다)의 "
            "중요한 의미 차이를 명확한 예문으로 설명하세요."
        ),
    },
    "A1-38": {
        "id": "A1-38",
        "band": 6,
        "band_name": "화법조동사",
        "title": "허락/허가를 나타내는 화법조동사 dürfen",
        "topics": ["dürfen 변화", "허가/금지 표현", "Darf ich...?"],
        "grammar_focus": [
            "dürfen 현재형 (darf/darfst/darf/dürfen/dürft/dürfen)",
            "허가 요청: Darf ich hier rauchen? / Darf ich reinkommen?",
            "금지: Hier darf man nicht parken. / Das darf man nicht.",
        ],
        "context_prompt": (
            "화법조동사 dürfen(허가/금지)의 변화와 용법을 다룹니다. "
            "허가 요청(Darf ich...?)과 금지 표현(Hier darf man nicht...) "
            "두 가지 패턴을 다양한 실생활 상황 예문으로 설명하세요."
        ),
    },
    "A1-39": {
        "id": "A1-39",
        "band": 6,
        "band_name": "화법조동사",
        "title": "제3자 요청/요구를 나타내는 화법조동사 sollen",
        "topics": ["sollen 변화", "외부 지시 표현", "sollen vs müssen"],
        "grammar_focus": [
            "sollen 현재형 (soll/sollst/soll/sollen/sollt/sollen)",
            "외부 지시: Der Arzt sagt, ich soll mehr schlafen.",
            "sollen(외부 지시) vs müssen(자체 필요) 비교",
        ],
        "context_prompt": (
            "화법조동사 sollen(외부 지시로 인한 의무)을 다룹니다. "
            "müssen(자체적 필요)과의 차이: "
            "Ich muss pünktlich sein.(내 의지) vs "
            "Der Chef sagt, ich soll pünktlich sein.(남의 지시)를 "
            "맥락 예문으로 설명하세요."
        ),
    },
    "A1-40": {
        "id": "A1-40",
        "band": 6,
        "band_name": "화법조동사",
        "title": "화법조동사 연습 1",
        "topics": ["wollen/möchten 연습", "müssen 연습", "상황별 선택"],
        "grammar_focus": [
            "wollen/möchten 상황별 연습 (강한 의지 vs 정중한 바람)",
            "müssen 연습 (학교/직장 의무 상황)",
            "상황 설명 → 적절한 조동사 선택",
        ],
        "context_prompt": (
            "화법조동사 wollen, möchten, müssen을 실전 상황에서 연습합니다. "
            "일상 대화(학교, 직장, 가정) 맥락에서 각 조동사를 선택하는 "
            "연습 문장과 대화문을 제공하세요."
        ),
    },
    "A1-41": {
        "id": "A1-41",
        "band": 6,
        "band_name": "화법조동사",
        "title": "화법조동사 연습 2",
        "topics": ["dürfen/sollen 연습", "können 재확인", "조동사 비교"],
        "grammar_focus": [
            "dürfen/sollen 상황별 연습 (도서관, 병원, 학교 규칙)",
            "können 재확인 (능력/가능성/허가)",
            "여러 조동사 혼합 연습",
        ],
        "context_prompt": (
            "화법조동사 dürfen, sollen, können을 실전 상황에서 연습합니다. "
            "규칙이 있는 상황(도서관: 조용히, 병원: 금식)에서 "
            "적절한 조동사를 선택하는 연습과 대화 예문을 제공하세요."
        ),
    },
    "A1-42": {
        "id": "A1-42",
        "band": 6,
        "band_name": "화법조동사",
        "title": "화법조동사 연습 3",
        "topics": ["6개 조동사 종합", "조동사 부정 비교", "실전 대화 연습"],
        "grammar_focus": [
            "6개 화법조동사 종합 비교표 (können/müssen/wollen/möchten/dürfen/sollen)",
            "조동사 부정 의미 비교 (nicht dürfen ≠ nicht müssen)",
            "조동사 어순 규칙 종합",
        ],
        "context_prompt": (
            "6개 화법조동사 전체를 종합 정리합니다. "
            "각 조동사의 핵심 의미, 부정 시 의미 변화, 상황별 선택 기준을 "
            "비교표로 제공하고 혼합 연습 대화문을 포함하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 7 (A1-43 to A1-49): 과거 표현
# ---------------------------------------------------------------------------

BAND_7 = {
    "A1-43": {
        "id": "A1-43",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거 표현(규칙변화)",
        "topics": ["규칙동사 Perfekt", "ge-...-t 형성", "haben + 과거분사"],
        "grammar_focus": [
            "규칙동사 과거분사: ge- + 어간 + -(e)t (machen→gemacht, kaufen→gekauft)",
            "haben + 과거분사 (과거분사는 문장 끝)",
            "어간 끝 -t/-d: ge + 어간 + et (warten→gewartet)",
        ],
        "context_prompt": (
            "독일어 현재완료(Perfekt) 규칙변화를 다룹니다. "
            "ge-...-t 형성 규칙과 haben을 조동사로 사용하는 Perfekt 구조를 설명하고, "
            "어간 끝이 -t/-d로 끝나는 동사의 예외(gewartet)도 포함하세요."
        ),
    },
    "A1-44": {
        "id": "A1-44",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거 표현(불규칙변화)",
        "topics": ["불규칙동사 Perfekt", "ge-...-en 형성", "주요 불규칙 목록"],
        "grammar_focus": [
            "강변화 동사 과거분사: ge-...-en (schreiben→geschrieben, fahren→gefahren)",
            "주요 불규칙 목록 (essen→gegessen, trinken→getrunken, sprechen→gesprochen)",
            "sein을 조동사로 취하는 이동 동사 (gehen→ist gegangen)",
        ],
        "context_prompt": (
            "불규칙 동사의 Perfekt를 다룹니다. "
            "ge-...-en 형성 패턴(강변화)과 자주 쓰이는 불규칙 과거분사 목록을 "
            "표로 정리하고, sein을 취하는 이동 동사(fahren→ist gefahren)를 소개하세요."
        ),
    },
    "A1-45": {
        "id": "A1-45",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거 표현(혼합변화)",
        "topics": ["혼합변화 동사", "sein + 과거분사", "이동/상태 변화 동사"],
        "grammar_focus": [
            "혼합변화: 어간 변화 + -t 어미 (bringen→gebracht, kennen→gekannt)",
            "denken→gedacht, wissen→gewusst, rennen→gerannt",
            "sein을 취하는 이동/상태 변화 동사 종합 (kommen, werden, sterben...)",
        ],
        "context_prompt": (
            "혼합변화 동사의 Perfekt를 다룹니다. "
            "어간이 변하면서 -t 어미를 갖는 혼합변화 패턴과 "
            "주요 혼합변화 동사 목록(bringen/denken/wissen)을 설명하세요."
        ),
    },
    "A1-46": {
        "id": "A1-46",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거 표현(분리동사)",
        "topics": ["분리동사 Perfekt", "ge- 삽입 위치", "auf-ge-macht"],
        "grammar_focus": [
            "분리동사 과거분사: 접두사 + ge + 기본동사 과거분사 (aufmachen→aufgemacht)",
            "anrufen→angerufen, einladen→eingeladen, abfahren→abgefahren",
            "Ich habe das Fenster aufgemacht. / Ich habe dich angerufen.",
        ],
        "context_prompt": (
            "분리동사의 Perfekt 형성을 다룹니다. "
            "ge-가 접두사와 어간 사이에 삽입되는 규칙(auf-ge-macht, an-ge-rufen)을 "
            "여러 예시로 설명하고 일상 대화 예문을 제공하세요."
        ),
    },
    "A1-47": {
        "id": "A1-47",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거표현연습 1",
        "topics": ["규칙/불규칙 복습", "haben vs sein 연습", "과거 이야기"],
        "grammar_focus": [
            "규칙/불규칙/혼합 과거분사 복습",
            "haben vs sein 선택 연습 (이동/상태 변화 = sein, 나머지 = haben)",
            "과거 이야기를 구성하는 연습 문장",
        ],
        "context_prompt": (
            "Perfekt 규칙변화와 불규칙변화를 실전 문장으로 연습합니다. "
            "과거 이야기를 구성하는 대화문과 함께, "
            "haben vs sein을 선택하는 연습 문장을 제공하세요."
        ),
    },
    "A1-48": {
        "id": "A1-48",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거표현연습 2",
        "topics": ["과거 시간 부사", "Perfekt 실전 활용", "과거 대화"],
        "grammar_focus": [
            "과거 시간 부사: gestern, vorgestern, letzte Woche, letztes Jahr",
            "vor + Dativ: vor drei Tagen / vor einem Jahr",
            "과거 시간 표현 + Perfekt 조합 실전 문장",
        ],
        "context_prompt": (
            "과거 시간 표현과 Perfekt를 결합하는 연습을 합니다. "
            "gestern/letzte Woche/vor einem Jahr 같은 시간 표현과 "
            "Perfekt 시제를 조합한 과거 이야기 예문을 제공하세요."
        ),
    },
    "A1-49": {
        "id": "A1-49",
        "band": 7,
        "band_name": "과거 표현",
        "title": "과거표현연습 3",
        "topics": ["Perfekt 종합 연습", "과거 이야기 구성", "haben/sein 종합"],
        "grammar_focus": [
            "Perfekt 종합: 규칙/불규칙/혼합/분리동사 전체 복습",
            "Präteritum 소개: war (sein), hatte (haben) — 구어에서 자주 씀",
            "과거 대화문 만들기 (Wie war dein Wochenende?)",
        ],
        "context_prompt": (
            "Perfekt 전체를 종합 정리하고 단순과거 sein/haben을 소개합니다. "
            "haben vs sein 선택 기준 체크리스트와 함께, "
            "일상 회화에서 자주 쓰이는 과거 표현 대화 예문을 제공하세요."
        ),
    },
}

# ---------------------------------------------------------------------------
# Band 8 (A1-50 to A1-56): 경험·신체·묘사·소유
# ---------------------------------------------------------------------------

BAND_8 = {
    "A1-50": {
        "id": "A1-50",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "경험 말하기",
        "topics": ["경험 표현", "schon mal/noch nie", "Hast du schon mal...?"],
        "grammar_focus": [
            "Hast du schon mal... gemacht? (경험 묻기)",
            "Ja, ich habe schon mal... / Nein, ich habe noch nie...",
            "schon(이미/벌써) vs noch nicht(아직 안) vs noch nie(한 번도 안)",
        ],
        "context_prompt": (
            "과거 경험을 표현하는 독일어를 다룹니다. "
            "Hast du schon mal Sushi gegessen? / "
            "Nein, ich habe noch nie Sushi gegessen. "
            "대화 패턴과 schon/noch 부사의 뉘앙스를 설명하세요."
        ),
    },
    "A1-51": {
        "id": "A1-51",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "축하하기",
        "topics": ["축하 표현", "Herzlichen Glückwunsch", "특별한 날 어휘"],
        "grammar_focus": [
            "Herzlichen Glückwunsch! (생일/합격/결혼 등)",
            "Alles Gute zum Geburtstag! / Alles Gute zur Prüfung!",
            "Frohe Weihnachten! / Frohes Neues Jahr! 등 특별한 날 인사",
        ],
        "context_prompt": (
            "각종 상황에서 축하하는 독일어 표현을 다룹니다. "
            "생일, 합격, 결혼 등 상황별 축하 인사말과 함께 "
            "선물을 줄 때 쓰는 표현(Das ist für dich.)을 설명하세요."
        ),
    },
    "A1-52": {
        "id": "A1-52",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "몸",
        "topics": ["신체 부위 어휘", "명사 성별", "신체 표현"],
        "grammar_focus": [
            "주요 신체 부위: der Kopf, der Arm, das Bein, die Hand, der Rücken...",
            "신체 명사 성별 (der/die/das 구분)",
            "소유관사와 결합: mein Kopf, meine Hand, mein Bein",
        ],
        "context_prompt": (
            "신체 부위를 나타내는 독일어 어휘를 다룹니다. "
            "주요 신체 부위 명사와 그 성별(der/die/das)을 목록으로 정리하고, "
            "소유관사와 결합한 예문을 제공하세요."
        ),
    },
    "A1-53": {
        "id": "A1-53",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "통증",
        "topics": ["통증 표현", "Kopfschmerzen", "weh tun 동사"],
        "grammar_focus": [
            "합성어 패턴: Ich habe Kopfschmerzen/Bauchschmerzen/Rückenschmerzen.",
            "weh tun 패턴: Mein Kopf/Mein Bauch/Mein Rücken tut weh.",
            "Seit wann haben Sie...? / Wie lange tut das schon weh?",
        ],
        "context_prompt": (
            "통증과 아픔을 표현하는 두 가지 패턴을 다룹니다. "
            "합성어 패턴(Kopfschmerzen/Bauchschmerzen)과 "
            "weh tun 동사 패턴(Mein Rücken tut weh)을 비교하고, "
            "의사 상담 대화 예문을 제공하세요."
        ),
    },
    "A1-54": {
        "id": "A1-54",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "사람묘사",
        "topics": ["외모 형용사", "성격 형용사", "사람 묘사하기"],
        "grammar_focus": [
            "외모: Er/Sie ist groß/klein/schlank/dick/jung/alt.",
            "머리/눈: Er hat braune Haare / blaue Augen.",
            "성격: freundlich, lustig, ruhig, fleißig, nett, sympathisch...",
        ],
        "context_prompt": (
            "사람의 외모와 성격을 묘사하는 독일어를 다룹니다. "
            "키/체형/머리/눈 등 외모 묘사 표현과 성격 형용사를 함께 다루고, "
            "Er/Sie ist...(성격/외모) vs Er/Sie hat...(머리/눈 색) 구문 차이를 설명하세요."
        ),
    },
    "A1-55": {
        "id": "A1-55",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "색깔",
        "topics": ["색깔 어휘", "색깔 형용사 활용", "쇼핑에서 색깔"],
        "grammar_focus": [
            "색깔 어휘: rot, blau, grün, gelb, schwarz, weiß, grau, orange, lila, braun",
            "서술적 사용: Das Kleid ist blau. / Das Auto ist rot.",
            "쇼핑 활용: Haben Sie das in Rot/Blau? / Ich suche ein rotes Kleid.",
        ],
        "context_prompt": (
            "색깔 어휘와 활용을 다룹니다. "
            "주요 색깔 명사/형용사 목록과 서술적 사용(Das Kleid ist blau.)을 설명하고, "
            "쇼핑 상황에서 색깔을 활용하는 예문(Haben Sie das in Rot?)을 제공하세요."
        ),
    },
    "A1-56": {
        "id": "A1-56",
        "band": 8,
        "band_name": "경험·신체·묘사·소유",
        "title": "소유 표현하기",
        "topics": ["소유관사 전체", "격변화 표", "소유 의문사 Wessen?"],
        "grammar_focus": [
            "소유관사 전체: mein/dein/sein/ihr/unser/euer/ihr/Ihr",
            "Nom/Akk/Dativ 격변화 (mein→meinen→meinem)",
            "Wessen Buch ist das? - Das ist mein Buch.",
        ],
        "context_prompt": (
            "소유를 표현하는 독일어를 총정리합니다. "
            "모든 소유관사 목록과 Nom/Akk/Dativ 변화표를 제공하고, "
            "Wessen Buch ist das? - Das ist mein Buch. 예문으로 "
            "소유 의문사 활용을 설명하세요."
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
    1: "알파벳과 자기소개",
    2: "숫자·시간·동사·약속",
    3: "주문·쇼핑·의문문·분리동사",
    4: "명령법·교통·전치사·방묘사",
    5: "약속·날짜·날씨·의사표현",
    6: "화법조동사",
    7: "과거 표현",
    8: "경험·신체·묘사·소유",
}
