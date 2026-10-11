# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어 | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird Translate는 읽고 있는 메시지의 본문을 메시지 창에서 바로 번역하는 Thunderbird 확장 기능입니다. 번역문은 각 원문 단락 아래에 표시하거나(이중 언어) 원문을 대신하도록 표시할 수 있습니다(번역문만). 번역을 끄면 원래 메시지가 그대로 복원됩니다. 번역은 세 단계가 동시에 진행합니다. 오프라인 사전, 기계 번역(Google 번역, Microsoft Translator, DeepLX 또는 오프라인 Bergamot 모델), AI 서비스(OpenAI, Claude, Gemini, DeepSeek, Qwen을 비롯한 22개 제공자)입니다. 가장 먼저 도착한 결과가 먼저 표시되고, 가장 높은 단계의 결과가 도착하면 이를 교체합니다. 기본 번역 서비스는 Google 번역(무료)이며 설치 직후 바로 사용할 수 있습니다.

이 문서는 Thunderbird 확장 기능을 처음 사용하는 독자를 기준으로 작성했습니다. 설치, 사용, 설정, 동작 원리 순서로 설명합니다.

![데모: 메일 번역, 이중 언어와 번역만 보기 전환, 대상 언어 변경](../docs/demo.gif)

## 기능

- 본문 번역: 메시지 본문에서 단락 단위의 내용을 찾습니다. 대상은 단락, 목록 항목, 표 셀, 제목, 인용 블록, 텍스트만 담은 div, 그리고 일반 텍스트 메일에서 빈 줄로 구분된 단락입니다. 코드, 이미 대상 언어로 작성된 단락, 숫자, 링크만 있는 내용, 공백은 건너뜁니다.
- 두 가지 표시 방식: 이중 언어 방식은 원문 아래에 옅은 왼쪽 테두리가 있는 번역문 블록을 삽입하며, 어두운 테마에서도 잘 읽힙니다. 번역문만 방식은 원문을 번역문으로 대체합니다. 원문은 메모리에 보관했다가 번역을 끄면 되돌려 놓습니다.
- 실시간 반영: 메시지가 번역된 상태에서 표시 방식이나 대상 언어를 바꾸면 메시지를 다시 열지 않아도 화면을 다시 그립니다. 표시 방식을 바꿀 때는 이미 받은 번역문으로 다시 그리며 새 요청을 보내지 않습니다.
- 진입점: 메시지 헤더 도구 모음의 "메시지 번역" 버튼과 그 팝업, 그리고 단축키 Alt+A(번역 / 원문 표시)와 Alt+S(이중 언어 / 번역문만 전환)가 있습니다.
- 메시지를 열 때 번역(선택 사항): 대상 언어가 아닌 메시지를 여는 즉시 번역합니다.
- 요청 일괄 처리: 백그라운드 스크립트가 50 ms 동안 단락을 모아 하나의 요청으로 병합합니다. 동시 요청 수 제한, 지수 백오프 재시도, 로컬 캐시를 함께 사용합니다.
- 세 가지 번역 단계: 사전, 기계 번역, AI 번역입니다. 단계마다 서비스 하나를 선택하거나 사용하지 않으며, 각 단락은 사용 중인 모든 단계에 동시에 전달됩니다. 낮은 단계의 결과는 가장 높은 단계의 결과가 교체할 때까지 임시 번역으로 표시되고, 가장 높은 단계가 실패하면 그대로 남습니다.
- 서비스: 오프라인 사전 1개, 기계 번역 서비스 4개(Google 번역, Microsoft Translator, DeepLX, 오프라인 Bergamot 모델), AI 제공자 프리셋 22개를 제공하며, 프리셋 중 하나는 "사용자 지정 OpenAI 호환"입니다. 각 단계의 목록에는 추가한 서비스만 표시됩니다.
- 원본 언어: 자동 감지하거나 특정 언어로 고정하며, 모든 서비스에 전달됩니다.
- AI 단계용 프롬프트 세 가지: 이중 언어 표시용, 번역문만 표시용, 정밀 번역용입니다.
- 프롬프트 프리셋: 방언·지역 말씨, 어려운 단어에 원어 병기, 어려운 단어 설명, 네 가지 문체를 세 프롬프트 중 어느 것에나 추가할 수 있습니다.
- 설정 안내: 설치 후 열리며, 언어, 표시 방식, 번역 단계, 오프라인 데이터 내려받기, 서비스, 프롬프트를 과정별로 설정합니다. 마지막에는 예시 메시지를 시험 번역합니다.
- 정밀 번역(AI 단계): 모든 요청에 메시지 전체를 문맥으로 붙이므로 인명, 용어, 호칭이 단락 사이에서 일관되게 유지됩니다.
- AI 제공자마다 사고 모드 스위치가 있으며, 기본값은 꺼짐입니다.
- 12개 언어로 된 인터페이스: 인터페이스 언어는 기본적으로 Thunderbird를 따르며 설정 페이지에서 직접 고를 수 있습니다.

## 설치

### Releases에서 설치

1. 이 저장소의 Releases 페이지에서 최신 `thunderbird-translate-<version>.xpi`를 내려받습니다.
2. Thunderbird에서 도구 → 부가 기능 및 테마를 엽니다(오른쪽 위의 ≡ 메뉴에서도 열 수 있습니다).
3. 확장 기능 목록 위의 톱니바퀴 아이콘을 클릭하고 "파일에서 부가 기능 설치…"를 선택한 다음, 내려받은 xpi 파일을 골라 설치를 확인합니다.

Thunderbird 128 이상이 필요합니다.

### 소스에서 빌드

Node.js 22 이상이 필요합니다(개발에는 Node 24와 npm 11을 사용합니다).

```bash
npm ci
npm test
npm run build
```

`npm run build`는 esbuild로 백그라운드 스크립트, 콘텐츠 스크립트, 팝업, 설정 페이지, 설정 안내를 `dist/`에 번들링하고, `locales/`의 파일로부터 `dist/_locales/<language>/messages.json`을 생성한 뒤, `dist/`를 `web-ext-artifacts/thunderbird-translate-<version>.xpi`로 패키징합니다. 패키징에는 순수 JavaScript 라이브러리인 fflate를 사용하므로 시스템의 zip 명령이 필요하지 않습니다.

개발 중에는 패키징하지 않고 확장 기능을 불러올 수 있습니다. Thunderbird에서 도구 → 개발자 도구 → 부가 기능 디버그를 열고 "임시 부가 기능 로드…"를 클릭한 다음 `dist/manifest.json`을 선택합니다.

## 설정 안내

새로 설치하면 Thunderbird가 설정 안내를 탭으로 엽니다. 확장 기능이나 Thunderbird를 업데이트할 때는 열리지 않습니다. 나중에 팝업의 "설정 안내" 링크나 설정 페이지 위쪽의 "설정 안내" 버튼으로 다시 열 수 있습니다.

과정마다 한 가지만 결정하며, 선택한 내용은 바로 저장됩니다. "이전", "다음", "이 과정 건너뛰기"로 과정 사이를 이동하고, 진행 표시줄 아래의 번호 목록에서 원하는 과정으로 바로 이동할 수 있습니다. "안내 종료"는 언제든 탭을 닫습니다. 다음에 열면 마지막으로 머문 과정부터 이어지고, "완료"를 누른 뒤에는 첫 과정부터 시작합니다.

| 과정 | 내용 | 표시 조건 |
| --- | --- | --- |
| 1 언어 | 인터페이스 언어, 원본 언어(기본값 "자동 감지"), 대상 언어 | 항상 |
| 2 표시 방식 | 이중 언어 또는 번역문만. 예시 메시지를 현재 번역문 스타일로 그린 미리 보기 | 항상 |
| 3 번역 단계 | 사전, 기계 번역, AI 번역 단계의 속도, 품질, 개인정보, 비용 비교. 단계별 서비스 또는 "사용 안 함". 하나 이상의 단계에 서비스 필요 | 항상 |
| 4 오프라인 번역 | 1번 과정에서 고른 언어에 필요한 사전 팩과 Bergamot 방향, 그리고 각각의 크기, 라이선스, 출처 표시. 내려받을 항목을 선택하고 "선택한 항목 다운로드"를 누르면 진행 상황을 표시하며 내려받음 | 사전 단계를 사용하거나 기계 번역 단계에서 Bergamot을 사용할 때 |
| 5 온라인 기계 번역 | 기계 번역 서비스의 설정 항목. Google 번역은 입력할 것이 없음, Microsoft Translator는 "기본 인터페이스(무료)"와 "내 키 사용(Azure Translator)" 중 선택, DeepLX는 엔드포인트와 액세스 토큰. "연결 테스트" | 기계 번역 단계에서 Google 번역, Microsoft Translator, DeepLX 중 하나를 사용할 때 |
| 6 AI 번역 | AI 제공자, API 키, 모델, 온도, 사고 모드, "연결 테스트", 정밀 번역 스위치. 사고 모드와 정밀 번역이 번역을 느리고 비싸게 만든다는 안내 | AI 단계를 사용할 때 |
| 7 프롬프트 | 세 가지 프롬프트와 프리셋 모음("프롬프트 프리셋" 참고) | AI 단계를 사용할 때 |
| 8 완료 | 번역하는 방법(도구 모음 버튼, Alt+A, Alt+S), "대상 언어가 아닌 메시지 자동 번역" 스위치, "예시 메시지 번역" 버튼 | 항상 |

앞선 선택에 필요 없는 과정은 취소선이 그어진 채 목록에 남고, "이전"과 "다음"은 그 과정을 건너뜁니다. 예를 들어 3번 과정에서 AI 단계에 서비스를 고르면 6번과 7번 과정이 다시 나타납니다.

원본 언어가 일본어이고 대상 언어가 중국어 간체일 때 4번 과정은 다음 항목을 추천합니다.

- 사전: 릴리스에 일본어 → 중국어 사전 팩이 있으면 그 팩을, 없으면 일본어 → 영어와 영어 → 중국어 두 팩을 추천합니다.
- Bergamot: ja → en과 en → zh-Hans 두 방향을 추천합니다. 모든 Bergamot 모델은 한쪽이 영어이기 때문입니다.

원본 언어가 "자동 감지"이면 4번 과정은 영어에서 번역하는 사전 팩과 방향을 추천합니다. 또한 받는 메일의 다른 언어마다 그 언어에서 영어로 가는 방향을 설치하라는 안내를 표시합니다.

8번 과정의 "예시 메시지 번역"은 짧은 영어 메일(대상 언어가 영어이면 독일어 메일)을 페이지 안에 그린 뒤 현재 설정으로 번역합니다. 이 페이지는 콘텐츠 스크립트의 단락 감지와 렌더링 모듈을 사용하고, 표시된 메시지와 같은 연결로 백그라운드 스크립트에 요청을 보냅니다. 따라서 결과는 실제 메시지에서 보이는 모습과 같으며, 사용 중인 단계의 임시 번역과 최종 번역도 표시됩니다.

설정 안내는 설정 페이지와 같은 구성 요소를 사용합니다. 서비스 설정 항목과 연결 테스트, 사전과 Bergamot 목록, 프리셋이 포함된 프롬프트 편집기입니다.

## 사용법

메시지를 열면 메시지 헤더 도구 모음에 "메시지 번역" 버튼이 나타납니다. 버튼을 클릭하면 다음 항목이 있는 팝업이 열립니다.

- "이 메시지 번역": 번역을 시작합니다. 번역이 진행 중이거나 번역문이 표시된 동안에는 버튼 이름이 "원문 표시"로 바뀌며, 클릭하면 원문을 복원합니다.
- 표시 방식: 이중 언어와 번역문만 사이를 전환합니다. 변경 사항은 현재 메시지에 즉시 적용됩니다.
- 원본 언어와 대상 언어: 원본 언어의 기본값은 "자동 감지"입니다. 둘 중 하나를 바꾸면 번역 중인 메시지를 다시 번역합니다. 두 언어가 같으면 안내 문구가 표시됩니다.
- 번역 단계: 단계마다 목록이 하나씩 있습니다(1 사전, 2 기계 번역, 3 AI 번역). 각 목록에는 "사용 안 함"과 그 단계에 속하는 추가된 서비스가 있습니다. 하나 이상의 단계에 서비스가 있어야 하므로, 마지막으로 남은 단계에서 "사용 안 함"을 고르면 선택이 거부되고 안내 문구가 표시됩니다. 목록 아래의 "+ 번역 서비스 추가"는 설정 페이지의 "번역 서비스" 섹션을 엽니다.
- 정밀 번역: AI 단계에 서비스가 있을 때 표시됩니다.
- 대상 언어가 아닌 메시지 자동 번역: 선택하면 본문이 대상 언어가 아닌 메시지를 여는 즉시 번역합니다.
- 설정 안내: 새 탭에서 설정 안내를 엽니다.

팝업에는 "12개 중 8개 번역됨"과 같이 진행 상황이 표시됩니다. 아직 낮은 단계의 임시 번역이 표시된 단락은 따로 세어 "9개 중 7개 번역됨 (임시 번역 2개)"처럼 표시합니다. 한 단락에서 모든 단계가 실패하면 그 단락 뒤에 빨간색으로 "번역 실패, 클릭하여 다시 시도"가 나타납니다. 마우스를 올리면 오류 내용이 보이고, 클릭하면 해당 단락을 다시 번역합니다.

Alt+A는 현재 메시지를 번역하거나 원문을 복원하고, Alt+S는 이중 언어와 번역문만 사이를 전환합니다. 두 단축키는 부가 기능 관리자의 톱니바퀴 메뉴에 있는 "확장 기능 단축키 관리"에서 바꿀 수 있습니다.

번역문만 방식에서는 번역문에 마우스를 올리면 원문이 도구 설명으로 표시됩니다.

## 설정

부가 기능 관리자에서 이 확장 기능의 "설정" 버튼으로 설정 페이지를 엽니다. 설정은 자동으로 저장되며, 저장이 끝나면 오른쪽 위에 "저장됨"이 표시됩니다. 그 옆의 "설정 안내" 버튼은 설정 안내를 엽니다.

| 섹션 | 내용 |
| --- | --- |
| 일반 | 인터페이스 언어, 원본 언어, 대상 언어, 기본 표시 방식, "대상 언어가 아닌 메시지 자동 번역" 스위치 |
| 번역 단계 | 단계별 서비스 또는 "사용 안 함". 정밀 번역 |
| 번역 서비스 | 서비스를 "추가됨"과 "추가 가능" 두 그룹으로 나눔. 서비스별 엔드포인트, API 키, 모델, 온도, 사고 모드. "연결 테스트", "추가", "이 서비스 사용", "제거" 버튼 |
| 사전 | 사전 단계의 언어 쌍과 크기, 라이선스, 출처 표시. 내려받기와 삭제. 사전 팩의 릴리스 태그(고급) |
| 오프라인 번역 모델 (Bergamot) | Bergamot 모델의 방향 쌍과 크기, 버전. 언어로 필터링. 내려받기, 업데이트, 취소, 삭제. 현재 언어에 필요한 방향 |
| 프롬프트 (AI 단계) | 프리셋 모음. 이중 언어 표시, 번역문만 표시, 정밀 번역용 프롬프트와 각각의 "기본 제공 프롬프트로 복원" 버튼 |
| 요청 일괄 처리 | 수집 시간 창, 요청당 최대 문자 수와 단락 수, 동시 요청 수, 재시도 횟수, AI 요청 병합 여부 |
| 번역문 스타일 | 왼쪽 테두리, 왼쪽 점선 테두리, 강조 표시, 기본 중 선택. 강조 색상, 텍스트 불투명도, 글꼴 크기 비율. 실시간 미리 보기 |
| 캐시 | 캐시 사용 여부, 최대 캐시 단락 수, 현재 항목 수, 캐시 지우기 |

"연결 테스트"는 입력란에 현재 들어 있는 값으로 테스트 문장 하나를 보냅니다. 성공하면 번역문을 보여 주고, 실패하면 잘못된 키나 알 수 없는 모델 이름처럼 서비스가 반환한 오류를 보여 줍니다.

## 서비스 추가와 제거

번역 서비스 섹션 왼쪽의 목록은 두 그룹으로 나뉩니다. "추가됨"에는 팝업과 설정 페이지의 서비스 목록에 표시되는 서비스가 들어 있고, 나머지 서비스는 "추가 가능"에 있습니다. 서비스를 선택하면 해당 서비스의 설정과 버튼이 표시됩니다.

- 추가하지 않은 서비스에는 "추가" 버튼이 있습니다. API 키(DeepLX는 엔드포인트)를 입력해도 그 서비스가 추가됩니다.
- 추가한 서비스에는 "이 서비스 사용"과 "제거" 버튼이 있습니다. "이 서비스 사용"은 그 서비스를 해당 단계에 배정합니다. 제거하면 서비스가 목록에서 빠지지만 입력해 둔 설정은 남으므로, 다시 추가하면 키와 모델이 그대로 있습니다.
- 어떤 단계가 사용 중인 서비스는 제거할 수 없습니다. 이 경우 "제거" 버튼이 비활성화되고 버튼 아래에 그 서비스를 쓰는 단계가 표시됩니다. 사용 중인 서비스에는 왼쪽 목록에서 "사용 중" 태그가 붙습니다.

새로 설치하면 Google 번역과 Microsoft Translator가 추가된 상태로 시작합니다. 사전과 Bergamot은 데이터를 내려받아야 하므로 직접 추가합니다. 버전 1.1 이하의 설정을 불러올 때는 다음 경우에 서비스를 추가된 것으로 취급합니다.

| 서비스 | 추가된 것으로 취급하는 조건 |
| --- | --- |
| Google 번역, Microsoft Translator | 항상 |
| DeepLX | 엔드포인트가 입력되어 있음 |
| 키가 필요한 AI 서비스 | API 키가 저장되어 있음 |
| Ollama, LM Studio, 사용자 지정 OpenAI 호환 | 엔드포인트, 모델, 온도 중 하나가 변경되었음 |
| 각 단계가 사용하는 서비스 | 항상 |

## 번역 단계

| 단계 | 서비스 | 제공하는 결과 |
| --- | --- | --- |
| 1 사전 | 사전 (오프라인) | 설치한 사전 팩으로 만든 단어 단위 대역. 즉시 사용할 수 있고 네트워크가 필요 없음 |
| 2 기계 번역 | Google 번역, Microsoft Translator, DeepLX, Bergamot (오프라인) | 1~2초 안에 도착하는 완전한 번역문 |
| 3 AI 번역 | 22개 AI 제공자 | 표시 방식에 맞는 프롬프트를 따르는, 품질이 가장 좋은 번역문 |

각 단계에는 서비스 하나 또는 "사용 안 함"을 지정하며, 하나 이상의 단계에는 서비스가 있어야 합니다. 기본값은 2단계의 Google 번역 하나뿐입니다.

각 단락은 사용 중인 모든 단계에 동시에 전달되고, 단계마다 기존의 일괄 처리와 캐시를 거칩니다. 메시지에 표시되는 내용은 규칙 하나로 정해집니다. 응답한 단계 중 가장 높은 단계의 결과가 표시됩니다.

| 상황 | 메시지에 표시되는 내용 |
| --- | --- |
| 낮은 단계가 먼저 응답 | 그 단계의 번역문을 기울임꼴로, 단계 이름 태그("사전", "기계 번역")와 함께 표시합니다. 마우스를 올리면 아직 진행 중인 단계가 표시됩니다. 더 높은 단계의 번역이 도착하면 이를 교체합니다 |
| 사용 중인 가장 높은 단계가 응답 | 그 단계의 번역문을 태그 없이 최종 번역으로 표시합니다. 그 뒤에 도착한 낮은 단계의 결과는 무시합니다 |
| 가장 높은 단계 실패 | 가장 좋은 낮은 단계의 번역문을 남기고 "AI 번역 실패"(또는 가장 높은 단계의 이름)로 표시합니다. 마우스를 올리면 이유가 보이고, 클릭하면 실패한 단계만 다시 시도합니다 |
| 모든 단계 실패 | 빨간색 "번역 실패, 클릭하여 다시 시도" 표시 |
| 가장 높은 단계의 번역이 이미 캐시에 있음 | 그 번역문을 바로 표시하며, 낮은 단계에는 요청하지 않습니다 |

표시 방식을 바꾸면 사전과 기계 번역의 결과는 받은 그대로 다시 그립니다. AI 단계는 표시 방식마다 프롬프트가 따로 있으므로 새 방식의 프롬프트로 다시 요청합니다. 그 프롬프트로 만든 번역이 이미 캐시에 있으면 요청 없이 가져옵니다. 팝업은 최종 번역을 번역됨으로, 낮은 단계의 번역을 임시 번역으로 셉니다.

버전 1.3 이하에서 저장한 설정은 다음 규칙에 따라 한 번 변환됩니다.

- 현재 서비스가 AI 서비스이면 3단계가 됩니다. 이때 경쟁 번역이 켜져 있었다면 경쟁 번역의 빠른 서비스가 2단계가 됩니다.
- 현재 서비스가 그 밖의 서비스이면 2단계가 됩니다.
- 사전 단계는 "사용 안 함" 상태로 시작합니다.

## 원본 언어

원본 언어의 기본값은 "자동 감지"이며, 대상 언어 목록의 20개 언어 중 하나로 고정할 수도 있습니다. 원본 언어는 모든 서비스에 다음과 같이 전달됩니다.

| 서비스 | 자동 감지 | 고정 언어 |
| --- | --- | --- |
| Google 번역 | `sl=auto` | `sl=<code>` |
| Microsoft Translator (무료 및 키 사용) | `from` 매개변수 없음 | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"`(중국어 변형은 `ZH`) |
| AI 서비스 | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| 사전 | 단락마다 감지 | 설정한 언어 |
| Bergamot | `"auto"`. 문자 체계와 영어 불용어로 찾은 언어를 대체값으로 함께 사용 | 설정한 언어 |

대상 언어로 감지된 단락은 이전과 같이 건너뜁니다. 원본 언어를 고정하면 언어를 확실하게 감지할 수 없는 단락은 그 언어로 간주합니다. 캐시 키와 배치에 원본 언어가 들어가므로, 원본 언어를 바꾸면 이전 설정으로 만든 번역문은 다시 쓰이지 않습니다.

## 프롬프트

AI 단계에는 시스템 프롬프트가 세 가지 있습니다. 각 프롬프트는 설정 페이지에서 편집할 수 있고 "기본 제공 프롬프트로 복원"으로 되돌릴 수 있습니다. 입력란을 비워 두어도 기본 제공 프롬프트를 사용합니다. `{{to}}`는 대상 언어의 영어 이름으로 대체됩니다. 원본 언어와 일괄 처리 형식은 확장 기능이 모든 요청에 직접 추가합니다.

| 프롬프트 | 사용되는 경우 | 기본 제공 프롬프트의 요구 사항 |
| --- | --- | --- |
| 이중 언어 표시 | 이중 언어 방식의 AI 단계 | 독자가 원문과 대조하므로 원문에 가깝게, 문장 단위로 같은 순서를 지키고 더하거나 빼지 않는 번역 |
| 번역문만 표시 | 번역문만 방식의 AI 단계 | 대상 언어로 쓴 이메일처럼 읽히는 자연스러운 글. 의미를 모두 유지하는 범위에서 절의 순서를 바꾸고 문장을 나누거나 합칠 수 있음 |
| 정밀 번역 | 정밀 번역이 켜져 있을 때의 AI 단계(두 표시 방식 모두) | 용어집, 요약, 이웃 단락을 활용해 메시지 전체에서 용어, 이름, 호칭을 일관되게 유지 |

캐시 키와 배치 키에는 프롬프트의 종류와 텍스트 해시가 들어갑니다. 따라서 프롬프트를 고치면 이전 텍스트로 만든 번역문은 다시 쓰이지 않습니다. 버전 1.3 이하에서 저장한 사용자 지정 시스템 프롬프트는 두 표시 방식의 프롬프트가 되고, 정밀 번역 프롬프트는 기본 제공 텍스트로 시작합니다.

### 프롬프트 프리셋

프리셋 모음은 설정 페이지의 세 프롬프트 위와 설정 안내의 7번 과정에 있습니다. 사용 순서는 다음과 같습니다.

1. 프리셋을 고릅니다. 변형이 있는 프리셋이면 변형도 고릅니다.
2. "추가할 프롬프트"에서 프롬프트 하나를 고릅니다.
3. "프리셋 적용"을 클릭합니다.

"예" 줄에는 원문 한 문장과, 고른 프리셋을 적용했을 때 기대하는 번역문이 표시됩니다.

| 프리셋 | 변형 | 프롬프트에 추가되는 규칙 |
| --- | --- | --- |
| 방언·지역 말씨 | 대상 언어에 따라 다름. 중국어 간체는 광둥어(홍콩)와 쓰촨어, 중국어 번체는 광둥어(홍콩)와 대만식 표현, 영어는 영국 영어와 미국 영어, 포르투갈어는 브라질 포르투갈어와 유럽 포르투갈어, 스페인어는 멕시코 스페인어와 스페인 스페인어, 프랑스어는 캐나다 프랑스어(퀘벡), 독일어는 스위스 표준 독일어 | 그 변이형의 철자, 어휘, 호칭 방식으로 쓴다 |
| 어려운 단어에 원어 병기 | 없음 | 평소처럼 번역하고, 어려운 단어와 전문 용어의 번역 뒤에 원어를 괄호로 붙인다. 같은 단어에는 단락마다 한 번만 붙인다. 예: 실사(due diligence) |
| 어려운 단어 설명 | 없음 | 단락을 번역한 뒤, 그 단락의 어려운 단어를 같은 단락 끝에 대상 언어로 괄호 하나에 모아 설명한다: 〔주: 용어: 설명; …〕 |
| 문체 | 격식 있는 비즈니스, 편한 구어체, 쉬운 말(언어 학습자용), 문학적 | 그 문체를 쓰고 의미를 모두 유지한다 |

변형 목록은 대상 언어를 따릅니다. 일본어처럼 지역 변이형이 없는 대상 언어에서는 "방언·지역 말씨" 프리셋이 나타나지 않습니다.

프리셋은 프롬프트 끝에 빈 줄 하나를 두고 영어 규칙 묶음을 추가합니다. 이 묶음은 `Style (this rule takes precedence over the rules above):` 같은 제목 줄로 시작하므로, "설명을 덧붙이지 말 것" 같은 기본 제공 프롬프트의 일반 규칙보다 우선합니다.

같은 프리셋을 다시 적용하면 그 묶음이 바뀌고, 서로 다른 프리셋의 묶음은 차례로 쌓입니다. 프롬프트 입력란에는 합쳐진 텍스트가 표시되며 직접 고칠 수 있습니다. "기본 제공 프롬프트로 복원"을 누르면 추가한 내용이 모두 사라집니다.

프리셋을 써도 단락마다 번역문 하나라는 형식은 바뀌지 않습니다. 어려운 단어 설명은 해당 단락의 번역문 안에 들어가며, 규칙 묶음은 설명을 별도의 단락이나 배열 요소로 반환하지 못하게 합니다. 따라서 배치 응답은 여전히 단락마다 정확히 한 항목인 JSON 배열(또는 번호가 붙은 구간)입니다. 테스트는 네 프리셋을 모두 한 프롬프트에 적용하고, 모의 모델이 두 형식으로 반환한 응답을 각각 파싱합니다.

## 정밀 번역

정밀 번역은 AI 단계에 적용되며, 모든 AI 요청에 메시지 전체를 문맥으로 붙여 보냅니다. 팝업이나 설정 페이지의 "번역 단계" 섹션에서 켭니다. 번역을 시작하면 콘텐츠 스크립트가 찾아낸 단락을 순서대로 이어 붙여 메시지 본문의 일반 텍스트를 만들고(20,000자를 넘는 부분은 잘라 내고 뒷부분이 있다는 표시를 남깁니다) 백그라운드 스크립트에 한 번 등록합니다. 메시지는 전체 본문 텍스트의 해시로 식별합니다. 잘라 내기는 문맥으로 보내는 텍스트에만 적용됩니다.

처리 방식은 번역할 단락의 양에 따라 달라집니다.

1. 한 번의 요청에 들어가면("요청당 최대 문자 수"와 "요청당 최대 단락 수" 이내) 요청 한 번으로 모든 단락을 번역합니다. 이 요청 자체가 메시지 전체를 담고 있습니다.
2. 들어가지 않으면 먼저 요청을 한 번 더 보내 메시지 전체를 분석합니다. 응답에는 2~3문장의 요약, 인명·제품명 등 고유명사와 그 번역어를 정리한 용어집, 어조와 호칭에 대한 지침이 들어 있습니다. 이 응답을 해석할 수 없으면 분석 결과 없이 번역을 계속합니다.
3. 이후 모든 요청은 같은 접두부로 시작합니다. 시스템 프롬프트, 분석 결과, 그리고 (약 8,000자 이하의 메시지에서는) 전문입니다. 접두부 뒤에 배치의 단락이 이어지며, 각 단락에는 번역하지 않는 참고용으로 앞뒤 단락이 하나씩 붙습니다.

한 메시지의 모든 요청에서 접두부는 글자 하나까지 같습니다. 반복되는 프롬프트 접두부를 캐시하는 제공자는 이 부분을 캐시에서 처리할 수 있습니다. Anthropic에서는 접두부에 `cacheControl: { type: "ephemeral" }`을 붙입니다. 분석 결과도 번역문과 마찬가지로 캐시되며, 키는 제공자, 모델, 대상 언어, 메시지 본문의 해시로 구성됩니다. 같은 메시지의 배치들은 같은 분석 요청이 끝나기를 기다립니다.

정밀 모드로 얻은 번역문은 메시지 해시가 포함된 키로 캐시되고, 배치는 서로 다른 메시지의 단락을 섞지 않습니다. 그래서 같은 문장이 다른 메시지에 나오면 그 메시지를 문맥으로 삼아 다시 번역합니다. 분석 요청과 더 긴 프롬프트 때문에 정밀 번역은 일반 번역보다 비용이 더 듭니다.

## 사전 번역

사전 서비스는 Thunderbird 프로필에 저장된 사전 팩으로 단어 단위로 번역합니다. 팩을 설치한 뒤에는 네트워크가 필요 없고 몇 밀리초 안에 응답하므로, 기계 번역과 AI 단계가 응답하기 전까지의 시간을 채웁니다. 결과는 단어 단위 대역입니다. 단어는 원문의 순서를 따르며 문법 변환은 하지 않습니다.

### 사전 팩

사전 팩은 이 저장소의 GitHub 릴리스 자산으로 공개되며, 기본값은 `dicts-v1` 릴리스입니다. 릴리스 태그는 "사전" 섹션의 "사전 팩의 릴리스 태그 (고급)"에서 바꿀 수 있습니다. 번역 방향마다 파일 `dict-<src>-<tgt>.tsv.gz`가 하나씩 있으며, gzip으로 압축한 UTF-8 텍스트 파일입니다.

```text
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
w	<key>	<translation>
f	<key>	<lemmaKey>
```

각 줄의 의미는 다음과 같습니다.

- 첫 줄은 팩 자체를 설명합니다. 원본 언어, 대상 언어, 팩 버전, 데이터 출처, 라이선스입니다.
- `w`로 시작하는 줄은 항목입니다.
- `f`로 시작하는 줄은 굴절형을 표제어의 키에 대응시킵니다. 예를 들어 `went`를 `go`에 대응시킵니다.

키는 NFC로 정규화하고, 원본 언어의 규칙에 따라 소문자로 바꾸고, 앞뒤 공백을 제거한 값입니다. 키는 여러 단어로 된 구일 수도 있습니다. 색인 파일 `dict-index.json`은 모든 팩의 크기, 항목 수와 굴절형 수, SHA-256 체크섬, 출처, 라이선스, 출처 표시를 나열합니다. 사전 팩은 영어, 중국어 간체와 번체, 일본어, 한국어, 프랑스어, 독일어, 스페인어, 포르투갈어, 러시아어, 튀르키예어, 베트남어를 다룹니다. 팩을 만드는 방법은 [docs/dictionary-packs.md](../docs/dictionary-packs.md)에 있습니다.

"사전" 섹션은 색인을 읽어 모든 팩을 크기, 라이선스, 출처 표시와 함께 나열합니다. "내려받기"는 진행 상황을 표시하면서 파일을 받고, SHA-256 체크섬과 머리글을 확인한 뒤 확장 기능의 IndexedDB 데이터베이스 `tt-dictionary`에 저장합니다. "삭제"는 저장된 팩을 지웁니다. 색인을 불러올 수 없으면 섹션에 이유가 표시되며, 설치한 팩은 그 상태에서도 삭제할 수 있습니다.

### 번역 과정

1. 원본 언어는 설정한 언어를 쓰고, 자동 감지일 때는 단락의 언어를 씁니다(문자 체계, 브라우저의 언어 감지기, 영어 불용어로 판단).
2. `Intl.Segmenter`로 단락을 단어로 나눕니다. 각 단어 위치에서 항목이 있는 가장 긴 구(최대 세 단어)를 먼저 찾고, 없으면 단어 하나를 찾습니다. 항목이 없는 단어는 표제어를 거쳐 다시 찾고, 그래도 없으면 원래 단어를 그대로 둡니다. 문장 부호와 숫자도 그대로 둡니다.
3. 대상 언어가 중국어나 일본어이면 단어를 공백 없이 잇고, 그 밖의 언어에서는 공백으로 구분합니다.
4. 영어가 아닌 두 언어 사이에서는 영어를 거칩니다. 프랑스어에서 독일어로 번역할 때는 프랑스어 → 영어 팩과 영어 → 독일어 팩을 사용합니다.
5. 필요한 팩이 없으면 오류 메시지에 해당 언어 쌍이 표시되고 "사전" 섹션으로 안내합니다.

백그라운드 스크립트는 팩을 처음 사용할 때 IndexedDB에서 읽어 메모리에 둡니다. 사전 번역이 5분 동안 없으면 메모리를 해제합니다.

### 데이터 출처

사전 팩은 다음 두 출처의 데이터로 만듭니다.

- Wiktionary: wiktextract로 추출하고 kaikki.org에서 공개한 데이터입니다(CC BY-SA 4.0, © Wiktionary 기여자).
- skywind3000의 ECDICT: MIT 라이선스입니다.

각 팩은 색인에 자신의 출처와 라이선스를 기록하며, 설정 페이지는 이를 팩 옆에 표시합니다.

## 오프라인 번역 (Bergamot)

Bergamot 서비스는 Firefox Translations의 엔진과 모델로 사용자의 컴퓨터에서 번역합니다. 엔진과 모델은 Mozilla가 MPL-2.0으로 공개했습니다. 엔진은 확장 기능에 포함되어 있고, 각 번역 방향의 모델은 Mozilla에서 한 번 내려받아(24~48 MB) 확장 기능의 IndexedDB에 저장합니다. 불러온 방향 하나는 약 200 MB의 메모리를 사용하며, 5분 동안 쓰지 않으면 해제됩니다. 모든 모델은 한쪽이 영어이므로, 일본어에서 중국어로 번역할 때는 일본어 → 영어와 영어 → 중국어 두 방향을 사용합니다.

설정 페이지의 "오프라인 번역 모델 (Bergamot)" 섹션은 58개 언어 사이의 114개 방향 쌍을 크기, 버전과 함께 나열하며, 언어로 필터링할 수 있습니다. 섹션에는 현재 원본 언어와 대상 언어에 필요한 방향이 표시되고, 그 방향이 목록 맨 앞에 옵니다. 내려받는 동안 진행 상황이 표시되며 취소할 수 있습니다. 설치한 쌍에 대해 Mozilla가 더 새로운 버전을 제공하면 "업데이트"가 표시됩니다. 현재 언어에 필요한 쌍을 삭제하면 먼저 확인을 요청합니다. 설치, 번역, 삭제는 엔진이 있는 백그라운드 스크립트에서 실행됩니다. 모델 선택, 검증, 저장, 엔진에 대한 설명은 [docs/bergamot.md](../docs/bergamot.md)에 있습니다.

## 인터페이스 언어

일반 섹션의 "인터페이스 언어" 옵션에는 두 종류의 값이 있습니다.

- "Thunderbird 따르기"(기본값): Thunderbird 자체 인터페이스 언어와 가장 가까운 지원 언어를 사용합니다. 옵션 레이블에는 현재 선택된 언어가 "Thunderbird 따르기 (Deutsch)"처럼 표시됩니다.
- 지원하는 12개 언어 중 하나: Thunderbird의 언어와 관계없이 그 언어를 사용합니다.

선택한 언어는 팝업, 설정 페이지, 메시지 안의 레이블("번역 중…", "번역 실패, 클릭하여 다시 시도"), 오류 메시지, 연결 테스트 결과, 도구 모음 버튼의 도구 설명에 적용됩니다. 열려 있는 설정 페이지나 팝업은 텍스트가 즉시 바뀝니다. 이미 번역된 메시지 안의 레이블은 다음에 다시 그려질 때 바뀝니다.

일부 텍스트는 Thunderbird가 확장 기능 매니페스트에서 직접 읽기 때문에 항상 Thunderbird의 인터페이스 언어를 따릅니다. 부가 기능 관리자에 표시되는 확장 기능 이름과 설명, "확장 기능 단축키 관리"의 단축키 설명이 여기에 해당합니다. 설정 페이지에서도 이 옵션 아래에 같은 내용을 안내합니다.

"Thunderbird 따르기"는 Thunderbird의 언어를 다음과 같이 대응시킵니다.

| Thunderbird 언어 | 사용하는 인터페이스 언어 |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | 중국어 번체 |
| 그 밖의 `zh-*` | 중국어 간체 |
| `pt-*` | 포르투갈어(브라질) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | 기본 하위 태그가 같은 언어 |
| 그 밖의 모든 언어 | 영어 |

대상 언어 목록은 각 언어 이름을 인터페이스 언어로 표시하고 그 뒤에 해당 언어 자체의 이름을 붙입니다. 예를 들면 "일본어 (日本語)"입니다. AI 서비스로 보내는 프롬프트에는 항상 영어 언어 이름을 사용합니다. 모델이 영어 지시를 가장 안정적으로 따르기 때문입니다.

처음 설치할 때 대상 언어는 인터페이스 언어에 맞춰 정해집니다. 일본어 Thunderbird에서는 대상 언어가 일본어로, 영어 Thunderbird에서는 영어로 시작합니다. 이미 설정된 대상 언어는 덮어쓰지 않습니다.

## 지원하는 인터페이스 언어

| 코드 | 언어 |
| --- | --- |
| `en` | English |
| `zh_CN` | 简体中文 (중국어 간체) |
| `zh_TW` | 繁體中文 (중국어 번체) |
| `ja` | 日本語 (일본어) |
| `ko` | 한국어 (한국어) |
| `fr` | Français (프랑스어) |
| `de` | Deutsch (독일어) |
| `es` | Español (스페인어) |
| `pt_BR` | Português (Brasil) (포르투갈어, 브라질) |
| `ru` | Русский (러시아어) |
| `tr` | Türkçe (튀르키예어) |
| `vi` | Tiếng Việt (베트남어) |

대상 언어 목록은 이와 별개이며 이탈리아어, 우크라이나어, 폴란드어, 네덜란드어, 태국어, 인도네시아어, 아랍어, 힌디어를 포함해 20개 언어가 있습니다.

## 제공자 설정

### 무료 및 자체 호스팅 서비스

| 서비스 | 설정 | 비고 |
| --- | --- | --- |
| Google 번역 (무료, 기본값) | 없음 | `translate.googleapis.com`의 `client=gtx` 엔드포인트를 호출합니다. POST 하나에 `q` 매개변수를 여러 개 담으므로 여러 단락이 요청 하나를 공유합니다 |
| 사전 (오프라인) | "사전" 섹션에서 언어 쌍 내려받기 | 설치한 팩으로 단어 단위로 번역합니다. "사전 번역" 참고 |
| Bergamot (오프라인) | "오프라인 번역 모델" 섹션에서 방향 쌍 내려받기 | Mozilla의 모델로 사용자의 컴퓨터에서 번역합니다. "오프라인 번역 (Bergamot)" 참고 |
| Microsoft Translator (무료) | 없음 | Edge 브라우저가 사용하는 엔드포인트인 `edge.microsoft.com/translate/translatetext`를 호출하며, 요청 본문은 단락의 배열입니다. 설정 패널에서 '내 키 사용(Azure Translator)'을 선택하면 공식 `api.cognitive.microsofttranslator.com`을 호출합니다. Azure Portal에서 Translator 리소스를 만든 뒤 '키 및 엔드포인트'의 키와 지역을 패널에 입력하세요(글로벌 리소스는 지역을 비워 둘 수 있습니다). |
| DeepLX | 엔드포인트 필요 | 자체 호스팅 또는 제3자 DeepLX 서비스이며 토큰은 선택 사항입니다. 엔드포인트에 `{{apiKey}}`가 있으면 토큰으로 대체하고, 없으면 `Authorization: Bearer`로 전송합니다 |

### AI 제공자

모든 AI 제공자는 Vercel AI SDK의 `generateText`로 호출합니다. 공식 `@ai-sdk/*` 패키지가 있는 제공자는 그 패키지를 사용하고, 나머지는 `@ai-sdk/openai-compatible`을 사용합니다. 엔드포인트, API 키, 모델, 온도는 모든 제공자에서 바꿀 수 있습니다. 모델 입력란은 자주 쓰는 모델을 제안하며 임의의 모델 이름도 받습니다.

| 제공자 | SDK 패키지 | 기본 엔드포인트 | 기본 모델 | 키 필요 |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | 예 |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | 예 |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | 예 |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | 예 |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | 예 |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | 예 |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | 예 |
| Ollama (로컬) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | 아니요 |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | 예 |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 예 |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | 예 |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 예 |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | 예 |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | 예 |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | 예 |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | 예 |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 예 |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | 예 |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | 예 |
| Azure OpenAI | `@ai-sdk/azure` | 직접 입력 필요 | `gpt-4.1-mini` | 예 |
| LM Studio (로컬) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | 아니요 |
| 사용자 지정 OpenAI 호환 | `@ai-sdk/openai-compatible` | 직접 입력 필요 | 직접 입력 필요 | 아니요 |

일부 제공자에는 추가 요구 사항이 있습니다.

- Anthropic Claude: 확장 기능이 `anthropic-dangerous-direct-browser-access: true` 헤더를 추가합니다. Anthropic은 브라우저 컨텍스트에서 보내는 요청에 이 헤더를 요구합니다. Claude 5 시리즈와 Opus 4.7, 4.8은 사용자 지정 온도를 거부하므로, 확장 기능은 이 모델들에 온도를 보내지 않으며 기본 모델의 온도 입력란은 비어 있습니다.
- Azure OpenAI: 엔드포인트는 `https://<resource>.openai.azure.com/openai`이고, 모델 입력란에는 배포 이름을 입력합니다.
- Ollama: Ollama는 기본적으로 확장 기능 페이지에서 오는 교차 출처 요청을 거부합니다. 환경 변수 `OLLAMA_ORIGINS=moz-extension://*`를 설정하고 Ollama를 시작하세요.
- Moonshot: 기본 엔드포인트는 중국 사이트 `api.moonshot.cn`입니다. 국제 사이트 계정은 `https://api.moonshot.ai/v1`을 사용합니다.
- Volcengine Doubao: 모델 입력란에는 모델 이름이나 Ark 콘솔에서 만든 추론 엔드포인트의 ID를 입력합니다.

### 사고 모드

AI 제공자마다 설정에 "사고 모드" 스위치가 있으며, 기본값은 꺼짐입니다. 번역에는 모델이 먼저 추론할 필요가 없고, 추론하면 요청이 느려지며 비용도 늘어납니다. `deepseek-flash`, `claude-haiku-5-5`, `gemini-2.5-flash`처럼 따로 지시하지 않으면 추론하는 모델이 많으므로, 꺼짐일 때도 "끔"을 명시하는 매개변수를 보냅니다.

사고를 제어하는 매개변수는 제공자마다 다르며, 같은 제공자 안에서도 일부 모델만 받아들입니다. 확장 기능은 모델 이름을 아래 표의 패턴과 대조해 처음 일치한 규칙의 제공자 옵션을 보냅니다. 어느 규칙과도 일치하지 않는 모델에는 사고 매개변수를 보내지 않습니다. 사고가 켜져 있는 동안에는 추론 모델이 온도를 무시하거나 거부하므로 표의 패턴과 일치하는 모델에는 온도를 보내지 않습니다.

| 제공자 | 모델 | 끔 | 켬 | 출처 |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` 이상 | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
| | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | 위와 같음 |
| | `o1`, `o3`, `o4-mini` 등 | `"low"`(완전히 끌 수 없음) | `"medium"` | 위와 같음 |
| Anthropic | Claude 5 시리즈, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
| | Claude 3.7과 4.x | 보내지 않음(기본값이 꺼짐) | `{ type: "enabled", budgetTokens: 1024 }` | 위와 같음 |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }`(최솟값, 끌 수 없음) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
| | 그 밖의 `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | 위와 같음 |
| | Gemini 3 이상 | `{ thinkingLevel: "low" }`(완전히 끌 수 없음) | `{ thinkingLevel: "high" }` | 위와 같음 |
| DeepSeek | 전체 | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
| | `grok-3-mini` | `"low"` | `"high"` | 위와 같음 |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"`, 함께 `reasoningFormat: "parsed"` 설정 | [Groq reasoning](https://console.groq.com/docs/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | 위와 같음 |
| Mistral AI | 전체(SDK는 지원하는 모델에만 전송) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | 위와 같음 |
| DeepInfra | 전체(추론 기능이 없는 모델은 무시) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | 위와 같음 |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
| | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | 위와 같음 |
| 通义千问 / 阿里云百炼 (DashScope) | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | 전체 | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | 항상 추론하는 모델(`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro와 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| | 그 밖의 모델(추론 기능이 없는 모델은 무시) | `{ enabled: false }` | `{ enabled: true }` | 위와 같음 |
| 智谱 GLM (Zhipu) | GLM-4.5 이상 | `zhipu.thinking: { type: "disabled" }`. 이 값을 거부하는 GLM-5.3에는 보내지 않음 | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| 硅基流动 SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5 이상, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| 火山引擎豆包 (Volcengine Ark) | Seed 계열과 thinking 모델 | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark 문서](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio, 사용자 지정 OpenAI 호환 서비스에는 확장 기능이 사용하는 엔드포인트에 공개된 사고 매개변수가 없습니다. 이 서비스들의 스위치는 비활성화되며, 설정 페이지에 "이 제공자는 사고 제어를 지원하지 않으므로 사고 관련 매개변수를 보내지 않습니다."라고 표시됩니다.

OpenAI 호환 프리셋(Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao)에서는 옵션을 프리셋 ID 아래에 쓰며, `@ai-sdk/openai-compatible`이 이를 그대로 요청 본문에 복사합니다. 이름이 바뀌는 키는 `reasoningEffort` 하나뿐이며 `reasoning_effort`가 됩니다.

## 일괄 처리의 동작 방식

메시지 하나에는 보통 열 개에서 수십 개의 단락이 있습니다. 단락마다 요청을 하나씩 보내면 단락마다 시스템 프롬프트와 지시문이 따로 붙고, 단락마다 속도 제한의 요청 한 건을 소모합니다. 일괄 처리는 짧은 간격으로 도착한 단락을 하나의 요청으로 병합하므로, 두 비용 모두 단락이 아니라 배치 단위로 발생합니다.

### 처리 흐름

1. 콘텐츠 스크립트가 번역할 단락을 모두 백그라운드 스크립트에 넘깁니다. 사용 중인 모든 단계에 대해 한 번만 넘깁니다.
2. 백그라운드 스크립트는 단계마다 먼저 캐시를 조회하고, 캐시에 있으면 바로 응답합니다. 캐시 키는 제공자, 모델, 원본 언어와 대상 언어, AI 서비스에서는 프롬프트 종류와 프롬프트 텍스트 해시, 정밀 번역에서는 메시지 해시, 단락 텍스트 해시로 구성됩니다. 같은 텍스트가 이미 번역 중이면 나중에 온 요청은 같은 결과를 공유합니다.
3. 캐시에 없는 단락은 제공자 + 모델 + 엔드포인트 + 원본 언어 + 대상 언어로, AI 서비스는 프롬프트별로, Microsoft Translator는 무료 모드인지 키 사용 모드인지에 따라, 정밀 번역에서는 메시지별로도 묶여 배치 큐에 들어갑니다. 한 그룹의 단락은 50 ms 동안 쌓입니다. 시간 창이 끝나거나, 단락 수 제한에 도달하거나, 다음 단락을 넣으면 문자 수 제한을 넘을 때 그룹을 전송합니다. 문자 수 제한보다 긴 단락은 혼자서 하나의 배치가 됩니다.
4. 요청 큐가 각 배치를 실행합니다. 요청 큐는 동시 요청 수를 제한하고 408, 429, 5xx, 네트워크 오류를 지수 백오프로 재시도합니다. 서버가 `Retry-After`를 보내면 그 시간만큼(최대 30초) 기다립니다. 401, 400 같은 오류는 재시도하지 않고 바로 보고합니다.
5. 결과는 메모리 캐시에 들어가고, 1초 뒤 한 번의 쓰기로 `storage.local`에 저장됩니다. 캐시는 가장 오래 사용하지 않은(LRU) 항목부터 제거합니다.

### 서비스별 단락 병합 방식

- 사전과 Bergamot: 배치 전체를 로컬 호출 한 번으로 번역합니다.
- Google: `q` 매개변수를 여러 개 담은 POST 하나를 보내며, 반환된 배열은 입력과 일대일로 대응합니다.
- Microsoft: 요청 본문 자체가 배열입니다.
- DeepLX: 엔드포인트가 요청 하나에 단락 하나만 받으므로, 배치 안의 단락을 동시에 요청합니다.
- AI 제공자: 단락에 번호를 매겨 메시지 하나에 넣고, 모델에 같은 길이의 JSON 배열을 반환하도록 요청합니다. 파서는 다음 순서로 시도합니다: JSON 배열(코드 블록 안에 있거나 설명문으로 둘러싸여 있어도 되며, 문자열 안의 줄바꿈과 끝에 붙은 쉼표는 복구합니다), 번호가 붙은 `<seg>` 블록, 번호가 붙은 줄, `%%` 구분자. 모두 실패하거나 개수가 맞지 않으면 그 배치를 단락당 요청 하나로 다시 보내며, 사용자는 같은 결과를 받습니다. 인증 실패처럼 파싱 오류가 아닌 오류는 이 대체 경로를 사용하지 않으므로, 같은 오류가 N번 반복되지 않습니다.

### 비용 추정

시스템 프롬프트와 지시문이 $s$ 토큰, 단락 하나가 평균 $t$ 토큰, 전체 단락 수가 $N$, 배치 크기가 $B$이고, 번호와 JSON 따옴표 때문에 단락마다 $c$ 토큰이 추가된다고 합시다.

단락마다 요청을 하나씩 보내면 전체 입력 토큰 수는 다음과 같습니다.

$$
I_{\text{single}} = N(s + t).
$$

일괄 처리를 하면 요청 수는 $\lceil N/B \rceil$이고, 전체 입력 토큰 수는 다음과 같습니다.

$$
I_{\text{batch}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

두 값의 차이는 다음과 같습니다.

$$
I_{\text{single}} - I_{\text{batch}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

$s$가 $c$보다 확실히 크면 배치가 클수록 더 많이 절약됩니다. $s = 150$, $t = 60$, $c = 10$, $N = 20$, $B = 30$이면 다음과 같습니다.

$$
I_{\text{single}} = 20 \times 210 = 4200, \qquad I_{\text{batch}} = 150 + 20 \times 70 = 1550.
$$

입력 토큰은 약 63% 줄고, 요청 수는 20에서 1로 줄어듭니다. 번역문의 길이는 변하지 않으므로 출력 토큰은 두 경우 모두 거의 같습니다. 요청 수 감소는 무료 엔드포인트에도 의미가 있습니다. Google과 Microsoft는 무료 엔드포인트를 요청 빈도로 제한하는데, 단락 20개짜리 메시지가 요청 하나로 처리됩니다.

## 개인정보 보호

- API 키는 현재 Thunderbird 프로필의 `storage.local`에만 저장되며, 해당 제공자의 엔드포인트로 보내는 요청에만 포함됩니다.
- 콘텐츠 스크립트는 메시지 페이지 안에서 실행됩니다. 콘텐츠 스크립트가 백그라운드 스크립트에서 받는 설정에는 키가 들어 있지 않습니다.
- 메시지 텍스트는 사용 중인 단계의 서비스로만 전송됩니다. 사전과 Bergamot은 사용자의 컴퓨터에서 번역하며 텍스트를 어디에도 보내지 않습니다. 사전 팩은 이 저장소의 GitHub 릴리스에서, Bergamot 모델은 Mozilla에서 내려받으며, 두 경우 모두 "내려받기"를 클릭할 때만 내려받습니다. 확장 기능은 통계를 수집하지 않으며 그 밖의 네트워크 주소에 접속하지 않습니다.
- 번역 캐시는 로컬에 저장되며, 설정 페이지에서 끄거나 지울 수 있습니다.
- Google, Microsoft, DeepLX 또는 온라인 AI 서비스를 사용하면 메시지 텍스트가 컴퓨터를 떠납니다. 민감한 메일에는 사전, Bergamot, 그리고 Ollama나 LM Studio 같은 로컬 AI 모델만 사용하세요. 이 서비스들은 모든 요청을 자신의 컴퓨터 안에서 처리합니다.

## 알려진 제한 사항

- 번역문은 일반 텍스트입니다. 원문의 링크, 굵은 글씨 등 인라인 서식은 번역문에 유지되지 않습니다. 이중 언어 방식에서는 원문을 그대로 사용할 수 있고, 번역문만 방식에서는 마우스를 올려 원문을 보거나 이중 언어로 다시 전환할 수 있습니다.
- Google과 Microsoft의 무료 엔드포인트는 공식 문서가 없으며 변경되거나 속도 제한을 받을 수 있습니다. Microsoft는 2026년 7월에 토큰 엔드포인트 `edge.microsoft.com/translate/auth`를 폐지했으며, 확장 기능은 직접 엔드포인트만 사용합니다.
- 단락이 이미 대상 언어인지 판단할 때 중국어, 일본어, 한국어 등의 문자 체계는 문자 종류로 판정하고, 라틴 문자·키릴 문자 언어는 먼저 확장 기능 API의 `i18n.detectLanguage`를 사용합니다. 이 API를 쓸 수 없거나 결과를 신뢰할 수 없으면 영어만 확실하게 감지하며, 다른 라틴 문자 언어의 단락은 평소처럼 번역 요청을 보냅니다.
- 콘텐츠 스크립트는 `messageDisplayScripts`로 등록되며 등록 이후에 연 메시지에만 적용됩니다. 확장 기능은 시작할 때 이미 열려 있는 메시지에 스크립트를 주입하려고 시도합니다. 주입에 실패하면 메시지를 다시 선택하면 됩니다.
- 확장 기능이 만드는 오류 메시지는 번역됩니다. 번역 서비스나 AI SDK가 반환한 오류 텍스트(예: HTTP 401 응답 본문)는 받은 그대로 표시되며 대개 영어입니다.
- 확장 기능 이름, 부가 기능 관리자의 설명, 단축키 설명은 인터페이스 언어 옵션이 아니라 Thunderbird의 인터페이스 언어를 따릅니다.
- 정밀 번역은 콘텐츠 스크립트가 메시지 ID를 얻을 수 없으므로 본문 텍스트의 해시로 메시지를 식별합니다. 본문이 완전히 같은 두 메시지는 번역문과 분석 결과를 공유합니다.
- 프롬프트 캐시가 적용되는지는 제공자에 달려 있습니다. Anthropic은 모델마다 정해진 최소 길이 이상의 접두부만 캐시하며, 그보다 짧은 접두부는 일반 입력으로 전송되고 과금됩니다.
- 사고 스위치는 모델 이름을 대조하는 방식으로 동작합니다. 어느 패턴과도 일치하지 않는 새 모델에는 `src/background/providers/thinking.ts`의 표에 규칙을 추가하기 전까지 사고 매개변수를 보내지 않습니다.
- 사용 중인 단계는 각자 요청을 보냅니다. AI 단계와 기계 번역 단계를 함께 사용하면 메시지마다 기계 번역 서비스에도 요청이 가며, 이 요청은 무료 Google 및 Microsoft 엔드포인트의 속도 제한을 소모합니다.
- 사전 번역은 단어 단위 대역입니다. 원문의 어순을 유지하고 굴절 변화를 하지 않습니다. 팩에 없는 단어는 번역되지 않은 채 남습니다.
- 설정 안내의 예시 메시지는 영어이며, 대상 언어가 영어이면 독일어입니다. 원본 언어를 이 두 언어가 아닌 언어로 고정해 두면, 시험 번역은 그 원본 언어를 지정한 채 영어 본문을 보냅니다.
- 설정 안내가 활성 탭일 때 Alt+A를 누르면 예시 메시지가 번역되거나 원문으로 돌아갑니다. 이때 시험 번역 버튼의 이름은 바뀌지 않습니다.
- 프리셋은 모델에게 주는 지시입니다. 방언과 문체를 얼마나 충실히 따르는지는 모델에 달려 있으며, 작은 모델일수록 지역 변이형을 더 자주 섞습니다.
- Bergamot과 사전은 배치 하나를 하나의 원본 언어로 번역합니다. 자동 감지에서 Bergamot은 배치 전체의 언어를 한 번 감지하므로, 여러 언어가 섞인 배치는 비중이 가장 큰 언어로 번역됩니다.

## 테스트

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules, with and without a source language
```

단위 테스트가 다루는 범위는 배치 그룹화와 큐, AI 출력 파싱과 대체 경로, 단락 감지와 이중 언어·번역문만 렌더링 및 복원(jsdom 사용), Google·Microsoft·DeepLX의 요청 생성과 응답 파싱(fetch 모의 사용), 모든 AI 프리셋의 요청 URL과 인증 헤더, 제공자별 사고 매개변수, 설정을 추가된 서비스와 단계, 프롬프트로 옮기는 마이그레이션, 팝업과 설정 페이지의 단계 목록, 모든 단계를 비우는 선택의 거부와 제거 보호, 번역 단계(낮은 단계가 먼저 도착한 뒤 교체되는 경우, 가장 높은 단계가 먼저 도착해 이후의 낮은 단계 결과를 무시하는 경우, 가장 높은 단계가 실패해 낮은 단계 결과를 남기는 경우, 모든 단계 실패, 사용하지 않는 단계, 가장 높은 단계의 캐시 적중), 프롬프트 선택과 캐시 키, AI 단계에는 다시 요청하고 다른 단계는 다시 그리기만 하는 표시 방식 전환, 모든 서비스의 요청과 캐시 키에 들어가는 원본 언어, 사전 팩(파싱, 단어 분할과 구 대조, 굴절형, 영어를 거치는 번역, 팩 누락, 체크섬 확인을 포함한 내려받기, 메모리 내 IndexedDB 사용), Bergamot 서비스와 모델 관리(엔진 모의 사용), 정밀 번역(단일 요청, 분석과 배치, 분석 실패, 캐시 키와 메시지별 배치, Anthropic 캐시 제어가 포함된 동일한 프롬프트 접두부), 설정 안내(새로 설치할 때만 열림, 필요 없는 과정을 건너뛰는 이동과 이어서 시작하기, 과정별 저장, 추천하는 사전 팩과 Bergamot 방향 및 그 내려받기, 서비스 설정과 연결 테스트, 프롬프트에 프리셋 적용, 콘텐츠 스크립트 모듈을 거치는 시험 번역), 프롬프트 프리셋(대상 언어별 변형, 세 프롬프트 각각과의 조합, 같은 프리셋의 교체, 모든 프리셋을 적용한 상태의 배치 파싱), 그리고 현지화입니다. 현지화 테스트는 모든 언어의 키 집합과 자리 표시자가 같은지, 매니페스트의 모든 `__MSG_*__` 참조, Thunderbird 언어와 지원 언어의 대응, 누락된 키의 영어 대체, HTML 페이지와 소스에 인터페이스 텍스트가 하드코딩되어 있지 않은지를 확인합니다.

`npm run build:debug`는 메시지를 여는 즉시 번역을 시작하고 진행 상황을 콘솔에 기록하는 디버그용 xpi를 만듭니다. 실제 Thunderbird에서 전체 흐름을 확인할 때 사용합니다.

## 프로젝트 구조

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators, dictionary, offline model management
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page and the parts the setup guide shares: service fields, dictionary and Bergamot lists, prompt editor, settings session
  welcome/       setup guide: steps and navigation
  offline/       Bergamot engine module: model list, download, storage, worker
  shared/        shared settings, provider presets, prompts, language table and detection, message types, i18n runtime
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, locale generation and checks, live endpoint test
readmes/         translated versions of this README
docs/            demo GIF used in this README
tests/           vitest tests
```

## 인터페이스 번역

인터페이스 텍스트는 `locales/<language>.json`에 있으며, 언어마다 키 → 텍스트로 된 평면 객체 하나로 구성됩니다. `locales/en.json`이 기준이며, 다른 모든 파일은 정확히 같은 키를 가집니다. `$1`부터 `$9`까지는 치환 자리이며, 각 번역에 영어와 같은 번호로 들어가야 합니다. `{{apiKey}}`와 `{{to}}`는 그대로 유지하는 리터럴 토큰입니다. Google 번역, OpenAI, DeepLX 같은 제품 이름은 번역하지 않습니다.

`npm run build`는 이 파일들을 Thunderbird가 읽는 형식인 `dist/_locales/<language>/messages.json`으로 변환합니다. 확장 기능 자체의 i18n 런타임이 실행 시점에 같은 파일을 불러오므로, Thunderbird를 다시 시작하지 않고도 인터페이스 언어를 바꿀 수 있습니다. 누락된 키는 영어로 대체됩니다.

언어를 추가하려면 모든 키를 담은 `locales/<code>.json`을 만들고, `src/shared/locales.ts`의 `SUPPORTED_LOCALES`에 코드와 해당 언어 자체의 이름을 추가한 다음, `npm run locales:check`와 `npm test`를 실행합니다.

## 감사의 말

단락 감지, 배치 큐, 프롬프트, 제공자 설정의 설계는 GPL-3.0으로 공개된 웹 페이지 번역 브라우저 확장 기능 [Read Frog](https://github.com/mengxi-ream/read-frog)를 따랐습니다. 이 프로젝트는 그 아이디어를 Thunderbird의 메시지 리더로 옮기고 이메일에 맞게 조정했습니다. 예를 들어 일반 텍스트 메일을 빈 줄 기준으로 나누고, 강제 줄바꿈된 줄을 이어 붙입니다.

사전 데이터의 출처는 두 가지입니다. 하나는 [Wiktionary](https://en.wiktionary.org/)(© Wiktionary 기여자, CC BY-SA 4.0)로, [wiktextract](https://github.com/tatuylonen/wiktextract)로 추출하고 [kaikki.org](https://kaikki.org/)에서 공개한 데이터입니다. 다른 하나는 skywind3000의 [ECDICT](https://github.com/skywind3000/ECDICT)(MIT 라이선스)입니다. 오프라인 번역은 [Bergamot](https://browser.mt/) 엔진과 Firefox Translations의 번역 모델을 사용하며, 둘 다 Mozilla가 MPL-2.0으로 공개했습니다.

## 라이선스

GPL-3.0-or-later. 전체 텍스트는 [LICENSE](../LICENSE)를 참고하세요.
