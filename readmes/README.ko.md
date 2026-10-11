# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어 | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird Translate는 읽고 있는 메시지의 본문을 메시지 창에서 바로 번역하는 Thunderbird 확장 기능입니다. 번역문은 각 원문 단락 아래에 표시하거나(이중 언어) 원문을 대신하도록 표시할 수 있습니다(번역문만). 번역을 끄면 원래 메시지가 그대로 복원됩니다. 기본 번역 서비스는 Google 번역(무료)이며 설치 직후 바로 사용할 수 있습니다. OpenAI, Claude, Gemini, DeepSeek, Qwen을 비롯한 22개 AI 제공자에도 연결할 수 있습니다.

이 문서는 Thunderbird 확장 기능을 처음 사용하는 독자를 기준으로 작성했습니다. 설치, 사용, 설정, 동작 원리 순서로 설명합니다.

![데모: 메일 번역, 이중 언어와 번역만 보기 전환, 대상 언어 변경](../docs/demo.gif)

## 기능

- 본문 번역: 메시지 본문에서 단락 단위의 내용을 찾습니다. 대상은 단락, 목록 항목, 표 셀, 제목, 인용 블록, 텍스트만 담은 div, 그리고 일반 텍스트 메일에서 빈 줄로 구분된 단락입니다. 코드, 이미 대상 언어로 작성된 단락, 숫자, 링크만 있는 내용, 공백은 건너뜁니다.
- 두 가지 표시 방식: 이중 언어 방식은 원문 아래에 옅은 왼쪽 테두리가 있는 번역문 블록을 삽입하며, 어두운 테마에서도 잘 읽힙니다. 번역문만 방식은 원문을 번역문으로 대체합니다. 원문은 메모리에 보관했다가 번역을 끄면 되돌려 놓습니다.
- 실시간 반영: 메시지가 번역된 상태에서 표시 방식이나 대상 언어를 바꾸면 메시지를 다시 열지 않아도 화면을 다시 그립니다. 표시 방식을 바꿀 때는 이미 받은 번역문으로 다시 그리며 새 요청을 보내지 않습니다.
- 진입점: 메시지 헤더 도구 모음의 "메시지 번역" 버튼과 그 팝업, 그리고 단축키 Alt+A(번역 / 원문 표시)와 Alt+S(이중 언어 / 번역문만 전환)가 있습니다.
- 선택형 자동 번역: 대상 언어가 아닌 메시지를 여는 즉시 번역합니다.
- 요청 일괄 처리: 백그라운드 스크립트가 50 ms 동안 단락을 모아 하나의 요청으로 병합합니다. 동시 요청 수 제한, 지수 백오프 재시도, 로컬 캐시를 함께 사용합니다.
- 서비스: 무료 또는 자체 호스팅 번역 서비스 3개와 AI 제공자 프리셋 22개를 제공하며, 프리셋 중 하나는 "사용자 지정 OpenAI 호환"입니다. 서비스 목록에는 추가한 서비스만 표시됩니다.
- 경쟁 번역(AI 서비스): 무료 번역 서비스가 먼저 돌려준 결과를 임시 번역으로 보여 주고, AI 번역이 도착하면 교체합니다.
- 정밀 번역(AI 서비스): 모든 요청에 메시지 전체를 문맥으로 붙이므로 인명, 용어, 호칭이 단락 사이에서 일관되게 유지됩니다.
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

`npm run build`는 esbuild로 백그라운드 스크립트, 콘텐츠 스크립트, 팝업, 설정 페이지를 `dist/`에 번들링하고, `locales/`의 파일로부터 `dist/_locales/<language>/messages.json`을 생성한 뒤, `dist/`를 `web-ext-artifacts/thunderbird-translate-<version>.xpi`로 패키징합니다. 패키징에는 순수 JavaScript 라이브러리인 fflate를 사용하므로 시스템의 zip 명령이 필요하지 않습니다.

개발 중에는 패키징하지 않고 확장 기능을 불러올 수 있습니다. Thunderbird에서 도구 → 개발자 도구 → 부가 기능 디버그를 열고 "임시 부가 기능 로드…"를 클릭한 다음 `dist/manifest.json`을 선택합니다.

## 사용법

메시지를 열면 메시지 헤더 도구 모음에 "메시지 번역" 버튼이 나타납니다. 버튼을 클릭하면 다음 항목이 있는 팝업이 열립니다.

- "이 메시지 번역": 번역을 시작합니다. 번역이 진행 중이거나 번역문이 표시된 동안에는 버튼 이름이 "원문 표시"로 바뀌며, 클릭하면 원문을 복원합니다.
- 표시 방식: 이중 언어와 번역문만 사이를 전환합니다. 변경 사항은 현재 메시지에 즉시 적용됩니다.
- 대상 언어: 값을 바꾸면 번역 중인 메시지를 새 언어로 다시 번역합니다.
- 번역 서비스: 사용할 서비스를 선택합니다. 목록에는 추가한 서비스만 있습니다. 목록 아래의 "+ 번역 서비스 추가"는 설정 페이지의 "번역 서비스" 섹션을 엽니다.
- 경쟁 번역과 정밀 번역: 현재 서비스가 AI 서비스일 때 표시되며, 두 AI 번역 모드를 켜고 끕니다.
- 대상 언어가 아닌 메시지 자동 번역: 선택하면 본문이 대상 언어가 아닌 메시지를 여는 즉시 번역합니다.

팝업에는 "12개 중 8개 번역됨"과 같이 진행 상황이 표시됩니다. 경쟁 번역에서는 아직 빠른 서비스의 임시 번역이 표시된 단락을 따로 세어 "9개 중 7개 번역됨 (임시 번역 2개)"처럼 표시합니다. 단락 번역에 실패하면 그 단락 뒤에 빨간색으로 "번역 실패, 클릭하여 다시 시도"가 나타납니다. 마우스를 올리면 오류 내용이 보이고, 클릭하면 해당 단락을 다시 번역합니다.

Alt+A는 현재 메시지를 번역하거나 원문을 복원하고, Alt+S는 이중 언어와 번역문만 사이를 전환합니다. 두 단축키는 부가 기능 관리자의 톱니바퀴 메뉴에 있는 "확장 기능 단축키 관리"에서 바꿀 수 있습니다.

번역문만 방식에서는 번역문에 마우스를 올리면 원문이 도구 설명으로 표시됩니다.

## 설정

부가 기능 관리자에서 이 확장 기능의 "설정" 버튼으로 설정 페이지를 엽니다. 설정은 자동으로 저장되며, 저장이 끝나면 오른쪽 위에 "저장됨"이 표시됩니다.

| 섹션 | 내용 |
| --- | --- |
| 일반 | 인터페이스 언어, 대상 언어, 기본 표시 방식, 현재 서비스, 자동 번역 |
| 번역 서비스 | 서비스를 "추가됨"과 "추가 가능" 두 그룹으로 나눔. 서비스별 엔드포인트, API 키, 모델, 온도, 사고 모드. "연결 테스트", "추가", "이 서비스 사용", "제거" 버튼 |
| AI 번역 모드 | 경쟁 번역과 빠른 서비스 선택, 정밀 번역 |
| 시스템 프롬프트 | AI 서비스용 사용자 지정 시스템 프롬프트. `{{to}}`는 대상 언어 이름으로 대체되며, 비워 두면 기본 제공 프롬프트를 사용 |
| 요청 일괄 처리 | 수집 시간 창, 요청당 최대 문자 수와 단락 수, 동시 요청 수, 재시도 횟수, AI 요청 병합 여부 |
| 번역문 스타일 | 왼쪽 테두리, 왼쪽 점선 테두리, 강조 표시, 기본 중 선택. 강조 색상, 텍스트 불투명도, 글꼴 크기 비율. 실시간 미리 보기 |
| 캐시 | 캐시 사용 여부, 최대 캐시 단락 수, 현재 항목 수, 캐시 지우기 |

"연결 테스트"는 입력란에 현재 들어 있는 값으로 테스트 문장 하나를 보냅니다. 성공하면 번역문을 보여 주고, 실패하면 잘못된 키나 알 수 없는 모델 이름처럼 서비스가 반환한 오류를 보여 줍니다.

## 서비스 추가와 제거

번역 서비스 섹션 왼쪽의 목록은 두 그룹으로 나뉩니다. "추가됨"에는 팝업과 설정 페이지의 서비스 목록에 표시되는 서비스가 들어 있고, 나머지 서비스는 "추가 가능"에 있습니다. 서비스를 선택하면 해당 서비스의 설정과 버튼이 표시됩니다.

- 추가하지 않은 서비스에는 "추가" 버튼이 있습니다. API 키(DeepLX는 엔드포인트)를 입력해도 그 서비스가 추가됩니다.
- 추가한 서비스에는 "이 서비스 사용"과 "제거" 버튼이 있습니다. 제거하면 서비스가 목록에서 빠지지만 입력해 둔 설정은 남으므로, 다시 추가하면 키와 모델이 그대로 있습니다.
- 현재 서비스는 제거할 수 없습니다. 경쟁 번역이 켜져 있는 동안에는 빠른 서비스로 선택된 서비스도 제거할 수 없습니다. 이 경우 "제거" 버튼이 비활성화되고 버튼 아래에 이유가 표시됩니다.

새로 설치하면 Google 번역과 Microsoft Translator가 추가된 상태로 시작합니다. 버전 1.1 이하의 설정을 불러올 때는 다음 경우에 서비스를 추가된 것으로 취급합니다.

| 서비스 | 추가된 것으로 취급하는 조건 |
| --- | --- |
| Google 번역, Microsoft Translator | 항상 |
| DeepLX | 엔드포인트가 입력되어 있음 |
| 키가 필요한 AI 서비스 | API 키가 저장되어 있음 |
| Ollama, LM Studio, 사용자 지정 OpenAI 호환 | 엔드포인트, 모델, 온도 중 하나가 변경되었음 |
| 현재 서비스 | 항상 |

## AI 번역 모드

두 모드는 현재 서비스가 AI 서비스일 때만 적용됩니다. 설정 페이지의 "AI 번역 모드" 섹션이나 팝업에서 켜고 끌 수 있습니다.

### 경쟁 번역

모든 단락을 AI 서비스와 빠른 서비스에 함께 보냅니다. 빠른 서비스의 기본값은 Google 번역이며, 추가한 서비스 중에서 Microsoft Translator나 DeepLX로 바꿀 수 있습니다. 두 요청은 각각 기존의 일괄 처리와 캐시를 거치며, 먼저 도착한 결과가 메시지에 표시됩니다.

| 상황 | 메시지에 표시되는 내용 |
| --- | --- |
| 빠른 서비스가 먼저 응답 | 빠른 서비스의 번역문을 기울임꼴로, "임시 번역" 태그와 함께 표시합니다. 마우스를 올리면 "AI 번역 생성 중…"이 표시됩니다. AI 번역이 도착하면 이를 교체합니다 |
| AI 서비스가 먼저 응답 | AI 번역문을 표시하고, 빠른 서비스의 결과는 버립니다 |
| AI 요청 실패 | 빠른 서비스의 번역문을 남기고 "AI 번역 실패"로 표시합니다. 마우스를 올리면 이유가 보이고, 클릭하면 해당 단락을 다시 번역합니다 |
| AI 번역이 이미 캐시에 있음 | 캐시된 AI 번역문을 표시하며, 빠른 서비스에는 요청하지 않습니다 |

표시 방식을 바꿔도 임시 번역과 실패 표시는 그대로 유지되고, "원문 표시"를 선택하면 번역문과 함께 사라집니다. 경쟁 번역은 AI 토큰을 더 쓰지 않지만, 빠른 서비스에 보내는 요청 수는 두 배가 됩니다.

### 정밀 번역

정밀 번역은 모든 AI 요청에 메시지 전체를 문맥으로 붙여 보냅니다. 번역을 시작하면 콘텐츠 스크립트가 찾아낸 단락을 순서대로 이어 붙여 메시지 본문의 일반 텍스트를 만들고(20,000자를 넘는 부분은 잘라 내고 뒷부분이 있다는 표시를 남깁니다) 백그라운드 스크립트에 한 번 등록합니다. 메시지는 이 텍스트의 해시로 식별합니다.

처리 방식은 번역할 단락의 양에 따라 달라집니다.

1. 한 번의 요청에 들어가면("요청당 최대 문자 수"와 "요청당 최대 단락 수" 이내) 요청 한 번으로 모든 단락을 번역합니다. 이 요청 자체가 메시지 전체를 담고 있습니다.
2. 들어가지 않으면 먼저 요청을 한 번 더 보내 메시지 전체를 분석합니다. 응답에는 2~3문장의 요약, 인명·제품명 등 고유명사와 그 번역어를 정리한 용어집, 어조와 호칭에 대한 지침이 들어 있습니다. 이 응답을 해석할 수 없으면 분석 결과 없이 번역을 계속합니다.
3. 이후 모든 요청은 같은 접두부로 시작합니다. 시스템 프롬프트, 분석 결과, 그리고 (약 8,000자 이하의 메시지에서는) 전문입니다. 접두부 뒤에 배치의 단락이 이어지며, 각 단락에는 번역하지 않는 참고용으로 앞뒤 단락이 하나씩 붙습니다.

한 메시지의 모든 요청에서 접두부는 글자 하나까지 같습니다. 반복되는 프롬프트 접두부를 캐시하는 제공자는 이 부분을 캐시에서 처리할 수 있습니다. Anthropic에서는 접두부에 `cacheControl: { type: "ephemeral" }`을 붙입니다. 분석 결과도 번역문과 마찬가지로 캐시되며, 키는 제공자, 모델, 대상 언어, 메시지 본문의 해시로 구성됩니다. 같은 메시지의 배치들은 같은 분석 요청이 끝나기를 기다립니다.

정밀 모드로 얻은 번역문은 메시지 해시가 포함된 키로 캐시되고, 배치는 서로 다른 메시지의 단락을 섞지 않습니다. 그래서 같은 문장이 다른 메시지에 나오면 그 메시지를 문맥으로 삼아 다시 번역합니다. 분석 요청과 더 긴 프롬프트 때문에 정밀 번역은 일반 번역보다 비용이 더 듭니다.

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
| Microsoft Translator (무료) | 없음 | 먼저 `edge.microsoft.com/translate/auth`에서 토큰을 받아 `api-edge.cognitive.microsofttranslator.com`을 호출합니다. Microsoft가 토큰 엔드포인트를 폐지한 경우 `edge.microsoft.com/translate/translatetext`로 전환합니다. 두 경로 모두 배열을 기본으로 받습니다 |
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

사고를 제어하는 매개변수는 제공자마다 다르며, 같은 제공자 안에서도 일부 모델만 받아들입니다. 확장 기능은 모델 이름을 아래 표의 패턴과 대조해 처음 일치한 규칙의 제공자 옵션을 보냅니다. 어느 규칙과도 일치하지 않는 모델에는 사고 매개변수를 보내지 않습니다. 사고가 켜져 있는 동안에는 추론 모델이 온도를 무시하거나 거부하므로 온도를 보내지 않습니다.

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

1. 콘텐츠 스크립트가 번역할 단락을 모두 백그라운드 스크립트에 넘깁니다.
2. 백그라운드 스크립트는 먼저 캐시를 조회하고, 캐시에 있으면 바로 응답합니다. 캐시 키는 제공자, 모델, 대상 언어, 시스템 프롬프트 서명, 정밀 번역에서는 메시지 해시, 단락 텍스트 해시로 구성됩니다. 같은 텍스트가 이미 번역 중이면 나중에 온 요청은 같은 결과를 공유합니다.
3. 캐시에 없는 단락은 제공자 + 모델 + 엔드포인트 + 대상 언어로, 정밀 번역에서는 메시지별로도 묶여 배치 큐에 들어갑니다. 한 그룹의 단락은 50 ms 동안 쌓입니다. 시간 창이 끝나거나, 단락 수 제한에 도달하거나, 다음 단락을 넣으면 문자 수 제한을 넘을 때 그룹을 전송합니다. 문자 수 제한보다 긴 단락은 혼자서 하나의 배치가 됩니다.
4. 요청 큐가 각 배치를 실행합니다. 요청 큐는 동시 요청 수를 제한하고 429, 5xx, 네트워크 오류를 지수 백오프로 재시도합니다. 서버가 `Retry-After`를 보내면 그 시간만큼 기다립니다. 401, 400 같은 오류는 재시도하지 않고 바로 보고합니다.
5. 결과는 메모리 캐시에 들어가고, 1초 뒤 한 번의 쓰기로 `storage.local`에 저장됩니다. 캐시는 가장 오래 사용하지 않은(LRU) 항목부터 제거합니다.

### 서비스별 단락 병합 방식

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
- 메시지 텍스트는 현재 선택한 번역 서비스로, 그리고 경쟁 번역이 켜져 있는 동안에는 선택한 빠른 서비스로만 전송됩니다. 확장 기능은 통계를 수집하지 않으며 이 서비스들 외의 네트워크 주소에 접속하지 않습니다.
- 번역 캐시는 로컬에 저장되며, 설정 페이지에서 끄거나 지울 수 있습니다.
- 메시지 텍스트는 컴퓨터를 떠나 선택한 번역 서비스로 전송됩니다. 민감한 메일에는 Ollama나 LM Studio 같은 로컬 모델을 사용하면 모든 요청이 자신의 컴퓨터 안에서 처리됩니다.

## 알려진 제한 사항

- 번역문은 일반 텍스트입니다. 원문의 링크, 굵은 글씨 등 인라인 서식은 번역문에 유지되지 않습니다. 이중 언어 방식에서는 원문을 그대로 사용할 수 있고, 번역문만 방식에서는 마우스를 올려 원문을 보거나 이중 언어로 다시 전환할 수 있습니다.
- Google과 Microsoft의 무료 엔드포인트는 공식 문서가 없으며 변경되거나 속도 제한을 받을 수 있습니다. Microsoft는 2026년 7월에 토큰 엔드포인트 `edge.microsoft.com/translate/auth`를 폐지했습니다(404를 반환합니다). 확장 기능은 첫 요청에서 여전히 토큰 엔드포인트를 시도하고, 실패하면 직접 엔드포인트로 전환하며, 이후 1시간 동안은 토큰 엔드포인트를 다시 시도하지 않습니다.
- 단락이 이미 대상 언어인지 판단할 때 중국어, 일본어, 한국어 등의 문자 체계는 문자 종류로 판정하고, 라틴 문자 언어는 먼저 확장 기능 API의 `i18n.detectLanguage`를 사용합니다. 이 API를 쓸 수 없거나 결과를 신뢰할 수 없으면 영어만 확실하게 감지하며, 다른 라틴 문자 언어의 단락은 평소처럼 번역 요청을 보냅니다.
- 콘텐츠 스크립트는 `messageDisplayScripts`로 등록되며 등록 이후에 연 메시지에만 적용됩니다. 확장 기능은 시작할 때 이미 열려 있는 메시지에 스크립트를 주입하려고 시도합니다. 주입에 실패하면 메시지를 다시 선택하면 됩니다.
- 확장 기능이 만드는 오류 메시지는 번역됩니다. 번역 서비스나 AI SDK가 반환한 오류 텍스트(예: HTTP 401 응답 본문)는 받은 그대로 표시되며 대개 영어입니다.
- 확장 기능 이름, 부가 기능 관리자의 설명, 단축키 설명은 인터페이스 언어 옵션이 아니라 Thunderbird의 인터페이스 언어를 따릅니다.
- 정밀 번역은 콘텐츠 스크립트가 메시지 ID를 얻을 수 없으므로 본문 텍스트의 해시로 메시지를 식별합니다. 본문이 완전히 같은 두 메시지는 번역문과 분석 결과를 공유합니다.
- 프롬프트 캐시가 적용되는지는 제공자에 달려 있습니다. Anthropic은 모델마다 정해진 최소 길이 이상의 접두부만 캐시하며, 그보다 짧은 접두부는 일반 입력으로 전송되고 과금됩니다.
- 사고 스위치는 모델 이름을 대조하는 방식으로 동작합니다. 어느 패턴과도 일치하지 않는 새 모델에는 `src/background/providers/thinking.ts`의 표에 규칙을 추가하기 전까지 사고 매개변수를 보내지 않습니다.
- 경쟁 번역은 빠른 서비스에 보내는 요청 수를 두 배로 늘리므로, 무료 Google 및 Microsoft 엔드포인트의 속도 제한을 소모합니다.

## 테스트

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

단위 테스트가 다루는 범위는 배치 그룹화와 큐, AI 출력 파싱과 대체 경로, 단락 감지와 이중 언어·번역문만 렌더링 및 복원(jsdom 사용), Google·Microsoft·DeepLX의 요청 생성과 응답 파싱(fetch 모의 사용), 모든 AI 프리셋의 요청 URL과 인증 헤더, 제공자별 사고 매개변수, 설정을 추가된 서비스로 옮기는 마이그레이션, 팝업과 설정 페이지에서 추가한 서비스만 나열하는 목록과 제거 보호, 경쟁 번역(빠른 결과가 먼저 도착하는 경우, AI 결과가 먼저 도착하는 경우, AI 실패, 캐시 적중, 표시 방식 전환과 복원), 정밀 번역(단일 요청, 분석과 배치, 분석 실패, 캐시 키와 메시지별 배치, Anthropic 캐시 제어가 포함된 동일한 프롬프트 접두부), 그리고 현지화입니다. 현지화 테스트는 모든 언어의 키 집합과 자리 표시자가 같은지, 매니페스트의 모든 `__MSG_*__` 참조, Thunderbird 언어와 지원 언어의 대응, 누락된 키의 영어 대체, HTML 페이지와 소스에 인터페이스 텍스트가 하드코딩되어 있지 않은지를 확인합니다.

`npm run build:debug`는 메시지를 여는 즉시 번역을 시작하고 진행 상황을 콘솔에 기록하는 디버그용 xpi를 만듭니다. 실제 Thunderbird에서 전체 흐름을 확인할 때 사용합니다.

## 프로젝트 구조

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page
  shared/        shared settings, provider presets, language table, message types, i18n runtime
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, locale generation and checks, live endpoint test
readmes/         translated versions of this README
tests/           vitest tests
```

## 인터페이스 번역

인터페이스 텍스트는 `locales/<language>.json`에 있으며, 언어마다 키 → 텍스트로 된 평면 객체 하나로 구성됩니다. `locales/en.json`이 기준이며, 다른 모든 파일은 정확히 같은 키를 가집니다. `$1`부터 `$9`까지는 치환 자리이며, 각 번역에 영어와 같은 번호로 들어가야 합니다. `{{apiKey}}`와 `{{to}}`는 그대로 유지하는 리터럴 토큰입니다. Google 번역, OpenAI, DeepLX 같은 제품 이름은 번역하지 않습니다.

`npm run build`는 이 파일들을 Thunderbird가 읽는 형식인 `dist/_locales/<language>/messages.json`으로 변환합니다. 확장 기능 자체의 i18n 런타임이 실행 시점에 같은 파일을 불러오므로, Thunderbird를 다시 시작하지 않고도 인터페이스 언어를 바꿀 수 있습니다. 누락된 키는 영어로 대체됩니다.

언어를 추가하려면 모든 키를 담은 `locales/<code>.json`을 만들고, `src/shared/locales.ts`의 `SUPPORTED_LOCALES`에 코드와 해당 언어 자체의 이름을 추가한 다음, `npm run locales:check`와 `npm test`를 실행합니다.

## 감사의 말

단락 감지, 배치 큐, 프롬프트, 제공자 설정의 설계는 GPL-3.0으로 공개된 웹 페이지 번역 브라우저 확장 기능 [Read Frog](https://github.com/mengxi-ream/read-frog)를 따랐습니다. 이 프로젝트는 그 아이디어를 Thunderbird의 메시지 리더로 옮기고 이메일에 맞게 조정했습니다. 예를 들어 일반 텍스트 메일을 빈 줄 기준으로 나누고, 강제 줄바꿈된 줄을 이어 붙입니다.

## 라이선스

GPL-3.0-or-later. 전체 텍스트는 [LICENSE](../LICENSE)를 참고하세요.
