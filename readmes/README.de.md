# Thunderbird Translate

Thunderbird Translate ist eine Erweiterung für Thunderbird, die den Text der gerade gelesenen Nachricht direkt im Nachrichtenbereich übersetzt. Sie funktioniert direkt nach der Installation mit dem kostenlosen Google Translate.

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | Deutsch | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

## Inhalt

- [Funktionen](#funktionen)
- [Installation](#installation)
- [Schnellstart](#schnellstart)
- [Verwendung](#verwendung)
- [Übersetzungsstufen](#übersetzungsstufen)
- [Übersetzungsdienste](#übersetzungsdienste)
- [Prompts](#prompts)
- [Datenschutz](#datenschutz)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)
- [Dokumentation](#dokumentation)
- [Danksagung](#danksagung)
- [Lizenz](#lizenz)

## Funktionen

- Übersetzt Absätze, Listeneinträge, Tabellenzellen, Überschriften und Zitate von HTML-Nachrichten sowie durch Leerzeilen getrennte Absätze von Nur-Text-Nachrichten. Code, Zahlen, nackte Links und Absätze, die bereits in der Zielsprache verfasst sind, werden übersprungen.
- Zwei Anzeigemodi: zweisprachig (die Übersetzung unter jedem Originalabsatz) oder nur Übersetzung. Wird die Übersetzung ausgeschaltet, steht die Nachricht wieder exakt im Original da.
- Drei Übersetzungsstufen arbeiten gleichzeitig: ein Offline-Wörterbuch, ein maschineller Übersetzer und ein KI-Dienst. Das schnellste Ergebnis erscheint zuerst, das der höchsten Stufe ersetzt es.
- Kostenlose Dienste ohne Konto: Google Translate (Standard) und Microsoft Translator.
- Offline-Übersetzung mit Wörterbuchpaketen und den Bergamot-Modellen von Mozilla; kein Text verlässt den Computer.
- 22 Voreinstellungen für KI-Anbieter, darunter OpenAI, Claude, Gemini, DeepSeek, Qwen, lokale Instanzen von Ollama und LM Studio sowie jeder OpenAI-kompatible Dienst.
- Präzise Übersetzung: Die KI-Stufe sieht die gesamte Nachricht, sodass Namen und Fachbegriffe einheitlich bleiben.
- Drei bearbeitbare Prompts mit Vorlagen für regionale Varianten, Schreibstile und schwierige Wörter.
- Optional: automatische Übersetzung jeder Nachricht, die nicht in der Zielsprache verfasst ist.
- Benutzeroberfläche in 12 Sprachen und ein Einrichtungsassistent, der sich nach der Installation öffnet.

## Installation

1. Die neueste Datei `thunderbird-translate-<version>.xpi` von der [Releases-Seite](https://github.com/willlllliams/thunderbird-translate/releases) herunterladen.
2. In Thunderbird Extras → Add-ons und Themes öffnen (auch über das Menü ≡ oben rechts erreichbar).
3. Auf das Zahnradsymbol über der Liste der Erweiterungen klicken, „Add-on aus Datei installieren…“ wählen, die xpi-Datei auswählen und bestätigen.

Erforderlich ist Thunderbird 128 oder neuer. Das Vorabrelease `nightly` ist ein automatischer Build des jeweils neuesten Commits und für Tests gedacht.

## Schnellstart

Nach der Installation öffnet sich der Einrichtungsassistent in einem neuen Tab. Jeder Schritt stellt eine Frage: Sprachen, Anzeigemodus und Darstellung der Übersetzung, Dienst jeder Stufe (mit einer kurzen Vorführung des Ergebnisses), Offline-Downloads, Schlüssel der Dienste und Prompts. Jede Auswahl wird sofort gespeichert, und jeder Schritt lässt sich überspringen. Im letzten Schritt wird eine Beispielnachricht mit den gewählten Einstellungen übersetzt.

Den Assistenten öffnet man später über den Link „Einrichtungsassistent“ im Pop-up oder die Schaltfläche oben auf der Einstellungsseite. Ohne jede Einstellung genügt es, eine Nachricht zu öffnen und Alt+A zu drücken: Google Translate übersetzt sie.

## Verwendung

Eine Nachricht öffnen und in der Symbolleiste des Nachrichtenkopfs auf „Nachricht übersetzen“ klicken. Das Pop-up enthält diese Bedienelemente:

- „Diese Nachricht übersetzen“ startet die Übersetzung. Solange eine Übersetzung angezeigt wird, lautet die Schaltfläche „Original anzeigen“.
- „Neu übersetzen“ fragt jede Stufe erneut und ignoriert den Cache.
- Anzeigemodus, Ausgangssprache („Automatisch erkennen“ ist voreingestellt) und Zielsprache.
- Pro Stufe eine Liste der Dienste, „Präzise Übersetzung“ und der Schalter „Nachrichten, die nicht in der Zielsprache verfasst sind, automatisch übersetzen“.

| Tastenkombination | Aktion |
| --- | --- |
| Alt+A | Nachricht übersetzen oder Original anzeigen |
| Alt+S | Zwischen „Zweisprachig“ und „Nur Übersetzung“ umschalten |
| Alt+R | Ohne Cache neu übersetzen (nur solange die Nachricht übersetzt ist) |

Die Tastenkombinationen lassen sich im Zahnradmenü der Add-ons-Verwaltung unter „Tastenkombinationen für Erweiterungen verwalten“ ändern.

Der zweisprachige Modus setzt jede Übersetzung unter ihren Originalabsatz. Der Modus „Nur Übersetzung“ ersetzt das Original; fährt man mit der Maus über eine Übersetzung, erscheint der Originaltext.

Alle weiteren Einstellungen liegen auf der Einstellungsseite, die sich über die Schaltfläche „Einstellungen“ der Erweiterung in der Add-ons-Verwaltung öffnet. Änderungen werden automatisch gespeichert, und beim Zeigen mit der Maus auf ein Bedienelement erscheint, was es tut. Jede Einstellung ist in [docs/settings.md](../docs/settings.md) (auf Englisch) beschrieben.

## Übersetzungsstufen

| Stufe | Dienste | Geschwindigkeit | Qualität | Offline | Kosten |
| --- | --- | --- | --- | --- | --- |
| 1 Wörterbuch | Wörterbuch | einige Millisekunden | Wort für Wort, ohne Grammatik | ja | kostenlos; einige MB pro Sprachpaar |
| 2 Maschinelle Übersetzung | Google, Microsoft, DeepLX, Bergamot | ein bis zwei Sekunden pro Nachricht | vollständig und gut lesbar | nur Bergamot | kostenlos; Bergamot lädt 13–48 MB pro Richtung |
| 3 KI-Übersetzung | 22 KI-Anbieter | einige Sekunden bis eine Minute | am natürlichsten; folgt den eigenen Prompts | nur lokale Modelle | nach Verbrauch über den eigenen API-Schlüssel abgerechnet; lokale Modelle kostenlos |

Jede Stufe verwendet einen Dienst oder „Nicht verwendet“; mindestens eine Stufe braucht einen Dienst. Standardmäßig ist nur Stufe 2 mit Google Translate belegt.

Jeder Absatz geht gleichzeitig an alle verwendeten Stufen. Das Ergebnis einer niedrigeren Stufe erscheint zuerst als vorläufige Übersetzung, kursiv und mit dem Namen ihrer Stufe gekennzeichnet. Die höchste verwendete Stufe ersetzt sie durch die endgültige Übersetzung; schlägt die höchste Stufe fehl, bleibt die vorläufige Übersetzung stehen.

Fehlen dem gewählten Wörterbuch oder Bergamot die Daten für die Sprachen einer Nachricht, nennt ein Hinweis über der Nachricht, was heruntergeladen werden muss. Er enthält einen Link zu den Einstellungen und das Kontrollkästchen „Für diese Sprachen nicht mehr erinnern“.

## Übersetzungsdienste

| Gruppe | Dienste | Voraussetzung |
| --- | --- | --- |
| Kostenlos | Google Translate | keine |
| | Microsoft Translator | keine; optional der Modus „Eigenen Schlüssel verwenden (Azure Translator)“ mit Azure-Schlüssel und Region |
| | DeepLX | die Adresse eines DeepLX-Servers; Token optional |
| Offline | Wörterbuch | Sprachpaare im Abschnitt „Wörterbücher“ herunterladen; je einige MB |
| | Bergamot (Mozilla) | Richtungen im Abschnitt „Offline-Übersetzungsmodelle (Bergamot)“ herunterladen; je 13–48 MB, jedes Modell hat Englisch auf einer Seite |
| KI | 22 Voreinstellungen | ein API-Schlüssel; Ollama, LM Studio und eigene OpenAI-kompatible Dienste brauchen keinen |

API-Schlüssel erhalten: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). Lokal: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

Die präzise Übersetzung sendet bei jeder KI-Anfrage die gesamte Nachricht als Kontext mit und kostet mehr. Der Schalter „Denkmodus“ jedes KI-Anbieters ist standardmäßig ausgeschaltet, weil Schlussfolgern die Übersetzung langsamer und teurer macht. Adressen, Standardmodelle, die Einstellung `OLLAMA_ORIGINS` von Ollama und die Denk-Parameter stehen in [docs/providers.md](../docs/providers.md) (auf Englisch).

## Prompts

Die KI-Stufe verwendet einen von drei Prompts: für die zweisprachige Anzeige (nah am Original), für die Anzeige nur der Übersetzung (flüssiger Text) und für die präzise Übersetzung (einheitliche Begriffe in der ganzen Nachricht). Jeder Prompt lässt sich bearbeiten und mit „Integrierten Prompt wiederherstellen“ zurücksetzen.

Vorlagen fügen einem Prompt Regeln hinzu: eine regionale Variante wie britisches Englisch oder taiwanischen Sprachgebrauch, einen Schreibstil, das Original hinter schwierigen Wörtern oder kurze Erklärungen schwieriger Wörter. Einzelheiten stehen in [docs/settings.md](../docs/settings.md#prompts) (auf Englisch).

## Datenschutz

- Der Nachrichtentext geht nur an die Dienste der verwendeten Stufen. Das Wörterbuch und Bergamot übersetzen auf dem eigenen Computer.
- API-Schlüssel werden nur im eigenen Thunderbird-Profil gespeichert und nur an die Adresse des jeweiligen Dienstes gesendet.
- Zwei Listen kommen aus dem Netz, ohne jeden Nachrichtentext: der Index der Wörterbuchpakete aus den GitHub-Releases dieses Repositorys und die Bergamot-Modelleinträge von Mozilla. Die Einstellungsseite und der Einrichtungsassistent lesen sie, um die Offline-Listen anzuzeigen. Ist in einer Stufe das Wörterbuch oder Bergamot gewählt, werden sie auch beim Start von Thunderbird, bei Änderungen der Einstellungen und beim Öffnen des Pop-ups gelesen. Beim Übersetzen einer Nachricht werden sie nie gelesen.
- Pakete und Modelle werden nur heruntergeladen, wenn man auf eine Download-Schaltfläche klickt. Die Erweiterung sammelt keine Statistiken.
- Der Übersetzungs-Cache liegt lokal und lässt sich ausschalten oder leeren.
- Für vertrauliche Nachrichten nur das Wörterbuch, Bergamot und lokale KI-Modelle (Ollama, LM Studio) verwenden.

## Bekannte Einschränkungen

- Übersetzungen sind reiner Text: Links und Formatierungen innerhalb von Zeilen aus dem Original gehen verloren.
- Die kostenlosen Schnittstellen von Google und Microsoft sind nicht dokumentiert und können sich ändern oder in der Rate begrenzt werden.
- Das Wörterbuch liefert eine Wort-für-Wort-Glosse in der Wortfolge der Ausgangssprache.
- Das Wörterbuch und Bergamot übersetzen nicht zwischen vereinfachtem und traditionellem Chinesisch.
- Jede verwendete Stufe sendet ihre eigenen Anfragen; deshalb zählt die Stufe der maschinellen Übersetzung auch dann gegen die Grenzen der kostenlosen Schnittstellen, wenn zusätzlich die KI-Stufe verwendet wird.
- Fehlertexte eines Dienstes werden unverändert angezeigt, meist auf Englisch.

Die vollständige Liste steht in [docs/settings.md](../docs/settings.md#known-limitations) (auf Englisch).

## Dokumentation

Die folgenden Dokumente sind auf Englisch.

- [docs/settings.md](../docs/settings.md): alle Einstellungen, Offline-Listen, Hinweise bei fehlenden Daten und der Cache.
- [docs/providers.md](../docs/providers.md): Adressen, Standardmodelle und Denk-Parameter aller Dienste.
- [docs/batching.md](../docs/batching.md): wie Absätze zu Anfragen zusammengefasst werden, Zeitlimits und Kosten.
- [docs/development.md](../docs/development.md): Erstellen aus dem Quellcode, Tests, Projektstruktur, Übersetzen der Benutzeroberfläche und Release-Prozess.

## Danksagung

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0): Entwurf der Absatzerkennung, der Batch-Warteschlange, der Prompts und der Anbieterkonfiguration.
- [Mozilla Bergamot](https://browser.mt/): die Offline-Engine und die Modelle von Firefox Translations (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors, CC BY-SA 4.0), extrahiert mit [wiktextract](https://github.com/tatuylonen/wiktextract) und veröffentlicht von [kaikki.org](https://kaikki.org/): Wörterbuchdaten.
- [ECDICT](https://github.com/skywind3000/ECDICT) von skywind3000 (MIT-Lizenz): Wörterbuchdaten Englisch → vereinfachtes Chinesisch.

## Lizenz

GPL-3.0-or-later. Den vollständigen Text enthält die Datei [LICENSE](../LICENSE).
