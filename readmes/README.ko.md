# 멀티 번역 for Thunderbird

멀티 번역 for Thunderbird는 읽고 있는 메시지의 본문을 메시지 창에서 바로 번역하는 Thunderbird 확장 기능이며, 설치 직후 무료 Google 번역으로 바로 사용할 수 있습니다. 버전 1.13까지의 이름은 Thunderbird Translate입니다.

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어 | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

![사전, 기계 번역, AI 번역이 차례로 표시된다](../docs/media/tiers-en.gif)

소개 영상: [YouTube](https://www.youtube.com/watch?v=OZmiMGeuhJ0) (1분) · [bilibili](https://www.bilibili.com/video/BV1JaWw6YENX) (2분)

## 목차

- [기능](#기능)
- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [사용법](#사용법)
- [번역 단계](#번역-단계)
- [번역 서비스](#번역-서비스)
- [프롬프트](#프롬프트)
- [개인정보](#개인정보)
- [알려진 제한 사항](#알려진-제한-사항)
- [문서](#문서)
- [감사의 말](#감사의-말)
- [라이선스](#라이선스)

## 기능

- HTML 메일의 단락, 목록 항목, 표 셀, 제목, 인용 블록과 일반 텍스트 메일에서 빈 줄로 구분된 단락을 번역합니다. 코드, 숫자, 링크만 있는 내용, 이미 대상 언어로 작성된 단락은 건너뜁니다. 제목도 번역되어 본문 위의 한 줄에 표시됩니다("제목도 번역", 기본값 켜짐).
- 두 가지 표시 방식을 제공합니다. 이중 언어는 각 원문 단락 아래에 번역문을 넣고, 번역문만은 원문을 번역문으로 대체하며, 두 방식 모두 AI 번역의 굵은 글씨, 목록, 링크를 서식대로 표시합니다. 번역을 끄면 원래 메시지가 그대로 복원됩니다.
- 오프라인 사전, 기계 번역, AI 서비스의 세 번역 단계가 동시에 동작합니다. 가장 빠른 결과가 먼저 표시되고, 가장 높은 단계의 결과가 도착하면 이를 교체합니다.
- 기계 번역은 계정 없이 쓰는 Google 번역(기본값)과 Microsoft Translator, 그리고 내 키로 쓰는 DeepL, Baidu, Youdao, Caiyun을 제공합니다.
- 사전 팩과 Mozilla의 Bergamot 모델로 오프라인 번역을 할 수 있으며, 이때 텍스트는 컴퓨터 밖으로 나가지 않습니다.
- OpenAI, Claude, Gemini, DeepSeek, Qwen, 로컬 Ollama와 LM Studio, 그리고 모든 OpenAI 호환 서비스를 포함한 22개 AI 제공자 프리셋을 제공합니다.
- 정밀 번역: AI 단계가 메시지 전체를 보고 번역하므로 이름과 용어가 일관되게 유지됩니다. 정밀 번역을 켜면 AI 서비스가 메시지 이미지 속 글자도 읽어 각 이미지 아래에 원문과 번역을 보여 줄 수 있습니다.
- 요약 및 할 일: AI 서비스가 메시지 위에 요약, 할 일, 답해야 할 질문, 날짜를 나열합니다.
- 편집할 수 있는 프롬프트 세 가지와 지역 말씨, 문체, 어려운 단어 처리용 프리셋을 제공합니다.
- 대상 언어가 아닌 모든 메시지를 자동으로 번역하는 기능을 선택적으로 사용할 수 있습니다.
- 12개 언어로 된 인터페이스와 설치 후 열리는 설정 안내를 제공합니다.

## 설치

1. [Releases 페이지](https://github.com/willlllliams/thunderbird-translate/releases)에서 최신 `thunderbird-translate-<version>.xpi`를 내려받습니다.
2. Thunderbird에서 도구 → 부가 기능 및 테마를 엽니다(오른쪽 위의 ≡ 메뉴에서도 열 수 있습니다).
3. 확장 기능 목록 위의 톱니바퀴 아이콘을 클릭하고 "파일에서 부가 기능 설치…"를 선택한 다음, xpi 파일을 골라 설치를 확인합니다.

Thunderbird 128 이상이 필요합니다. 사전 릴리스인 `nightly`는 최신 커밋을 자동으로 빌드한 것으로, 테스트용입니다. 실험판 `multi-translate-experimental-<version>.xpi`는 메시지 목록에 "번역된 제목" 열도 추가합니다. Thunderbird의 내부 인터페이스에 의존하며, 두 빌드 중 하나만 설치할 수 있습니다([docs/experimental.md](../docs/experimental.md), 영어).

## 빠른 시작

설치가 끝나면 설정 안내가 새 탭에서 열립니다. 과정마다 한 가지만 묻습니다. 순서는 언어, 표시 방식과 번역문 스타일, 단계별 서비스(결과를 보여 주는 짧은 시연 포함), 오프라인 내려받기, 서비스 키, 프롬프트입니다. 선택한 내용은 바로 저장되고, 어느 과정이든 건너뛸 수 있습니다. 마지막 과정에서는 현재 설정으로 예시 메시지를 번역합니다. 나중에 팝업의 "설정 안내" 링크나 설정 페이지 위쪽의 버튼으로 안내를 다시 열 수 있습니다. 아무것도 바꾸지 않은 상태에서 메시지를 열고 Alt+A를 누르면 Google 번역이 번역합니다.

## 사용법

메시지를 열고 메시지 헤더 도구 모음의 "메시지 번역" 버튼을 클릭합니다. 팝업에는 다음 항목이 있습니다.

- "이 메시지 번역"은 번역을 시작합니다. 번역문이 표시되어 있는 동안 버튼 이름은 "원문 표시"로 바뀝니다.
- "다시 번역"은 캐시를 무시하고 모든 단계에 다시 요청합니다. "요약 및 할 일"은 메시지 위에 요약을 표시합니다.
- 표시 방식, 원본 언어(기본값 "자동 감지"), 대상 언어, 단계마다 하나씩 있는 서비스 목록, 정밀 번역과 이미지 번역 방식(끄기, 이미지마다 묻기, 켜기), "대상 언어가 아닌 메시지 자동 번역" 스위치.

| 단축키 | 동작 |
| --- | --- |
| Alt+A | 메시지를 번역하거나 원문을 표시 |
| Alt+S | 이중 언어와 번역문만 사이를 전환 |
| Alt+R | 캐시를 무시하고 다시 번역(메시지가 번역된 상태에서만 동작) |

단축키는 부가 기능 관리자의 톱니바퀴 메뉴에 있는 "확장 기능 단축키 관리"에서 바꿀 수 있고, 요약에도 원하는 단축키를 지정할 수 있습니다.

이중 언어 방식은 각 원문 단락 아래에 번역문을 넣습니다. 번역문만 방식은 원문을 번역문으로 대체하며, 번역문에 마우스를 올리면 원문을 볼 수 있습니다. 기본 도구 모음의 "제목 번역" 버튼은 현재 폴더의 메시지를 번역된 제목과 함께 나열하고, 행을 클릭하면 그 메시지를 표시합니다.

그 밖의 설정은 설정 페이지에 있습니다. 부가 기능 관리자에서 이 확장 기능의 "설정" 버튼을 누르면 열립니다. 변경 내용은 자동으로 저장되며, 각 항목에 마우스를 올리면 설명이 표시됩니다. 모든 설정 항목은 [docs/settings.md](../docs/settings.md)(영어)에서 설명합니다.

## 번역 단계

| 단계 | 서비스 | 속도 | 품질 | 오프라인 | 비용 |
| --- | --- | --- | --- | --- | --- |
| 1 사전 | 사전 | 몇 밀리초 | 문법 없이 단어 단위로 대응 | 가능 | 무료, 언어 쌍마다 몇 MB |
| 2 기계 번역 | Google, Microsoft, DeepL, Baidu, Youdao, Caiyun, DeepLX, Bergamot | 메시지당 1~2초 | 완결된 읽기 쉬운 문장 | Bergamot만 가능 | 무료. DeepL과 Baidu는 매월 무료 한도가 있고, Youdao와 Caiyun은 새 계정의 체험 크레딧 이후 글자 수로 과금, Bergamot은 방향마다 13~48 MB 내려받음 |
| 3 AI 번역 | 22개 AI 제공자 | 몇 초에서 1분 | 가장 자연스러우며 프롬프트를 따름 | 로컬 모델만 가능 | 사용자의 API 키로 사용량만큼 과금, 로컬 모델은 무료 |

각 단계에서는 서비스 하나를 쓰거나 "사용 안 함"을 고르며, 하나 이상의 단계에는 서비스가 있어야 합니다. 기본값은 2단계의 Google 번역뿐입니다.

각 단락은 사용 중인 모든 단계에 동시에 전달됩니다. 낮은 단계의 결과는 먼저 임시 번역으로 기울임꼴과 단계 이름 표시와 함께 나타납니다. 사용 중인 가장 높은 단계가 이를 최종 번역으로 교체하며, 가장 높은 단계가 실패하면 임시 번역이 그대로 남습니다.

선택한 사전이나 Bergamot에 메시지의 언어에 필요한 데이터가 없으면 메시지 위에 내려받을 항목을 알려 주는 안내가 나타납니다. 안내에는 설정으로 가는 링크와 "이 언어들은 다시 알리지 않기" 체크박스이 있습니다.

## 번역 서비스

| 구분 | 서비스 | 필요한 것 |
| --- | --- | --- |
| 무료 | Google 번역 | 없음 |
| | Microsoft Translator | 없음, 선택 사항으로 Azure 키와 지역을 입력하는 "내 키 사용(Azure Translator)" 모드 |
| | DeepLX | DeepLX 서버의 엔드포인트, 토큰은 선택 사항 |
| 내 키 사용 | DeepL API, Baidu 번역, Youdao, Caiyun | 내 계정의 키, Baidu와 Youdao는 앱 ID도 필요 |
| 오프라인 | 사전 | "사전" 섹션에서 언어 쌍을 내려받음, 각각 몇 MB |
| | Bergamot (Mozilla) | "오프라인 번역 모델 (Bergamot)"에서 방향을 내려받음, 각각 13~48 MB, 모든 모델은 한쪽이 영어 |
| AI | 프리셋 22개 | API 키, Ollama, LM Studio, 사용자 지정 OpenAI 호환 서비스는 필요 없음 |

API 키 발급: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). 로컬: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

정밀 번역은 모든 AI 요청에 메시지 전체를 문맥으로 보내므로 비용이 더 듭니다. AI 제공자마다 있는 "사고 모드" 스위치는 기본값이 꺼짐인데, 추론을 하면 번역이 더 느려지고 비용도 늘기 때문입니다. 엔드포인트, 기본 모델, Ollama의 `OLLAMA_ORIGINS` 설정, 사고 모드 매개변수는 [docs/providers.md](../docs/providers.md)(영어)에 있습니다.

## 프롬프트

AI 단계는 세 가지 프롬프트 중 하나를 사용합니다. 이중 언어 표시용(원문에 가깝게), 번역문만 표시용(자연스러운 문장), 정밀 번역용(메시지 전체에서 용어를 일관되게)입니다. 각 프롬프트는 편집할 수 있고 "기본 제공 프롬프트로 복원"으로 되돌릴 수 있습니다.

프리셋은 프롬프트에 규칙을 추가합니다. 영국 영어나 대만 표현 같은 지역 말씨, 문체, 어려운 단어 뒤에 원어 병기, 어려운 단어의 짧은 설명이 있습니다. 자세한 내용은 [docs/settings.md](../docs/settings.md#prompt-presets)(영어)에 있습니다.

## 개인정보

- 메시지 텍스트는 사용 중인 단계의 서비스로만 전송됩니다. 사전과 Bergamot은 컴퓨터에서 번역합니다. 메시지 제목도 같은 규칙을 따릅니다. 요청한 요약은 메시지 전체를 보낸 사람과 날짜와 함께 요약용 AI 서비스로 보냅니다.
- 메시지 본문을 온라인 서비스로 처음 보내기 전에 메시지 위의 패널이 서비스 이름과 주소를 보여 주고 서비스와 주소마다 한 번 묻습니다. '허용하고 번역'을 누르기 전에는 아무것도 보내지 않으며, 허용한 서비스는 설정 페이지에 나열되고 취소할 수 있습니다. 사전과 Bergamot만 사용하면 묻지 않습니다.
- 이미지는 정밀 번역이 켜져 있을 때만 AI 서비스로 갑니다. 이미지 아래 버튼을 누르거나, 이미지 번역이 '켜기'일 때 자동으로 갑니다. 첫 이미지를 보내기 전에 그 아래 패널이 본문과 따로 서비스마다 한 번 묻습니다. 이미지는 축소하고 다시 인코딩해 파일 이름과 메타데이터 없이 보냅니다. 원격 이미지는 번역하지 않습니다.
- 직접 입력한 엔드포인트(Ollama, LM Studio, DeepLX, 사용자 지정 서비스, 바꾼 엔드포인트)는 연결 권한이 한 번 필요하며, 설정에서 '접근 허용' 또는 '연결 테스트'를 누르면 됩니다.
- API 키는 Thunderbird 프로필에만 저장되며, 해당 서비스의 엔드포인트로만 전송됩니다.
- 메시지 텍스트가 없는 두 목록을 네트워크에서 가져옵니다. 이 저장소의 GitHub 릴리스에 있는 사전 팩 인덱스와 Mozilla의 Bergamot 모델 레코드입니다. 설정 페이지와 설정 안내가 오프라인 목록을 표시하기 위해 이를 읽습니다. 단계에서 사전이나 Bergamot을 선택한 동안에는 Thunderbird를 시작할 때, 설정이 바뀔 때, 팝업을 열 때도 읽습니다. 메시지를 번역하는 동안에는 읽지 않습니다. 설정 페이지와 설정 안내는 Google 번역(무료)과 Microsoft Translator(무료)를 추가된 서비스로 표시할 때, 이 네트워크에서 연결되는지 확인하려고 "연결 테스트"의 고정 문장을 페이지와 서비스마다 한 번 보냅니다.
- 팩과 모델은 내려받기 버튼을 클릭할 때만 내려받습니다. 번역 캐시는 로컬에 저장되며 끄거나 지울 수 있습니다. 확장 기능은 통계를 수집하지 않습니다.
- 민감한 메일에는 사전, Bergamot, 로컬 AI 모델(Ollama, LM Studio)만 사용하십시오.

## 알려진 제한 사항

- 원문의 링크와 인라인 서식은 번역문으로 넘어가지 않습니다. 번역문에 굵은 글씨, 목록, 링크가 나타나는 것은 AI 서비스가 Markdown으로 쓴 경우뿐이며, 사전과 기계 번역의 번역문 및 임시 번역은 일반 텍스트입니다.
- Google과 Microsoft의 무료 엔드포인트는 문서화되어 있지 않아 변경되거나 요청 제한이 걸릴 수 있습니다.
- 사전은 원문 어순 그대로 단어 단위의 대역을 제공하며, 사전과 Bergamot은 중국어 간체와 번체 사이를 번역하지 않습니다.
- 사용 중인 단계는 각자 요청을 보내므로, AI 단계를 쓰는 경우에도 기계 번역 단계의 요청이 무료 요청 제한에 포함됩니다.
- 서비스가 반환한 오류 문구는 받은 그대로 표시되며 대개 영어입니다.

전체 목록은 [docs/settings.md](../docs/settings.md#known-limitations)(영어)에 있습니다.

## 문서

아래 문서는 영어로 작성되어 있으며, dictionary-packs.md만 중국어로 작성되어 있습니다.

- [docs/settings.md](../docs/settings.md): 모든 설정 항목, 오프라인 목록, 누락된 데이터 안내, 캐시.
- [docs/providers.md](../docs/providers.md): 모든 서비스의 엔드포인트, 기본 모델, 사고 모드 매개변수, 이미지를 읽는 모델.
- [docs/batching.md](../docs/batching.md): 단락을 요청으로 병합하는 방법, 제한 시간, 비용.
- [docs/bergamot.md](../docs/bergamot.md): 오프라인 엔진 Bergamot, 모델 선택과 저장, 빌드.
- [docs/dictionary-packs.md](../docs/dictionary-packs.md): 사전 팩의 데이터 출처, 형식, 빌드(중국어).
- [docs/development.md](../docs/development.md): 소스에서 빌드, 테스트, 프로젝트 구조, 인터페이스 번역, 릴리스 절차.
- [docs/experimental.md](../docs/experimental.md): "번역된 제목" 열이 있는 실험판, 설치 방법과 위험.

## 감사의 말

- [Read Frog](https://github.com/mengxi-ream/read-frog)(GPL-3.0): 단락 감지, 일괄 처리 대기열, 프롬프트, 제공자 구성의 설계.
- [Mozilla Bergamot](https://browser.mt/): 오프라인 엔진과 Firefox Translations 모델(MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/)(© Wiktionary contributors): 영어 → 중국어 간체를 제외한 사전 팩은 [wiktextract](https://github.com/tatuylonen/wiktextract)가 추출하고 [kaikki.org](https://kaikki.org/)가 배포한 Wiktionary 데이터를 변형(추출, 필터링, 축소)한 것이며, 라이선스는 CC BY-SA 4.0(<https://creativecommons.org/licenses/by-sa/4.0/>)입니다.
- [ECDICT](https://github.com/skywind3000/ECDICT)(Copyright (c) 2025 Linwei, MIT License): 영어 → 중국어 간체 사전 팩은 ECDICT를 변형(추출, 필터링, 축소)한 것입니다.

## 라이선스

GPL-3.0-or-later. 전문은 [LICENSE](../LICENSE)를 참고하십시오.
