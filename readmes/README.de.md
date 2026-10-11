# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | Deutsch | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird Translate ist eine Erweiterung für Thunderbird, die den Text der gerade gelesenen Nachricht direkt im Nachrichtenbereich übersetzt. Die Übersetzung erscheint entweder unter jedem Originalabsatz (zweisprachig) oder ersetzt ihn (nur Übersetzung). Wird die Übersetzung ausgeschaltet, stellt die Erweiterung die ursprüngliche Nachricht exakt wieder her. Standarddienst ist Google Translate (kostenlos); er funktioniert direkt nach der Installation. Zusätzlich lassen sich 22 KI-Anbieter anbinden, darunter OpenAI, Claude, Gemini, DeepSeek und Qwen.

Dieses Dokument richtet sich an Leser, die noch keine Thunderbird-Erweiterung verwendet haben. Es folgt der Reihenfolge Installation, Verwendung, Konfiguration und Funktionsweise.

## Funktionen

- Übersetzung des Nachrichtentexts: Die Erweiterung erkennt Inhalte auf Absatzebene im Nachrichtentext, also Absätze, Listeneinträge, Tabellenzellen, Überschriften, Zitatblöcke, reine Text-divs und durch Leerzeilen getrennte Absätze in Nur-Text-Nachrichten. Code, Absätze, die bereits in der Zielsprache verfasst sind, Zahlen, nackte Links und Leerraum werden übersprungen.
- Zwei Anzeigemodi: Der zweisprachige Modus fügt unter dem Original einen Übersetzungsblock mit einer hellen Linie links ein, der auch in dunklen Themes lesbar ist. Der Modus „Nur Übersetzung“ ersetzt das Original durch die Übersetzung; das Original bleibt im Speicher und wird beim Ausschalten der Übersetzung wieder eingesetzt.
- Sofortige Aktualisierung: Wird der Anzeigemodus oder die Zielsprache geändert, während eine Nachricht übersetzt ist, stellt die Erweiterung die Seite neu dar, ohne dass die Nachricht erneut geöffnet werden muss. Ein Wechsel des Anzeigemodus zeichnet die Seite aus den bereits erhaltenen Übersetzungen neu und sendet keine neuen Anfragen.
- Bedienung: die Schaltfläche „Nachricht übersetzen“ in der Symbolleiste des Nachrichtenkopfs mit ihrem Pop-up sowie die Tastenkombinationen Alt+A (übersetzen / Original anzeigen) und Alt+S (zweisprachig / nur Übersetzung umschalten).
- Optionale automatische Übersetzung: Nachrichten, die nicht in der Zielsprache verfasst sind, werden beim Öffnen sofort übersetzt.
- Bündelung von Anfragen: Das Hintergrundskript sammelt Absätze 50 ms lang und fasst sie in einer Anfrage zusammen. Dazu kommen eine Begrenzung gleichzeitiger Anfragen, Wiederholungsversuche mit exponentiellem Backoff und ein lokaler Cache.
- Dienste: 3 kostenlose oder selbst gehostete Übersetzungsdienste und 22 Voreinstellungen für KI-Anbieter, darunter „Benutzerdefiniert (OpenAI-kompatibel)“.
- Benutzeroberfläche in 12 Sprachen. Die Sprache der Benutzeroberfläche folgt standardmäßig Thunderbird und lässt sich auf der Einstellungsseite wählen.

## Installation

### Aus den Releases

1. Die neueste Datei `thunderbird-translate-<version>.xpi` von der Releases-Seite dieses Repositorys herunterladen.
2. In Thunderbird Extras → Add-ons und Themes öffnen (auch über das Menü ≡ oben rechts erreichbar).
3. Auf das Zahnradsymbol über der Liste der Erweiterungen klicken, „Add-on aus Datei installieren…“ wählen, die heruntergeladene xpi-Datei auswählen und bestätigen.

Erforderlich ist Thunderbird 128 oder neuer.

### Aus dem Quellcode erstellen

Erforderlich ist Node.js 22 oder neuer (entwickelt wird mit Node 24 und npm 11).

```bash
npm ci
npm test
npm run build
```

`npm run build` bündelt das Hintergrundskript, das Inhaltsskript, das Pop-up und die Einstellungsseite mit esbuild nach `dist/`, erzeugt `dist/_locales/<language>/messages.json` aus den Dateien in `locales/` und packt `dist/` in `web-ext-artifacts/thunderbird-translate-<version>.xpi`. Zum Packen dient die reine JavaScript-Bibliothek fflate; ein zip-Befehl des Systems wird nicht benötigt.

Während der Entwicklung lässt sich die Erweiterung ohne Packen laden: In Thunderbird Extras → Entwicklerwerkzeuge → Add-ons debuggen öffnen, auf „Temporäres Add-on laden…“ klicken und `dist/manifest.json` auswählen.

## Verwendung

Nach dem Öffnen einer Nachricht erscheint in der Symbolleiste des Nachrichtenkopfs die Schaltfläche „Nachricht übersetzen“. Ein Klick darauf öffnet ein Pop-up mit folgenden Elementen:

- „Diese Nachricht übersetzen“: startet die Übersetzung. Solange eine Übersetzung läuft oder angezeigt wird, lautet die Schaltfläche „Original anzeigen“ und stellt bei einem Klick das Original wieder her.
- Anzeige: schaltet zwischen „Zweisprachig“ und „Nur Übersetzung“ um; die Änderung gilt sofort für die aktuelle Nachricht.
- Zielsprache: Nach einer Änderung wird eine gerade übersetzte Nachricht erneut in die neue Sprache übersetzt.
- Übersetzungsdienst: wählt den verwendeten Dienst.
- Nachrichten, die nicht in der Zielsprache verfasst sind, automatisch übersetzen: Ist diese Option aktiviert, wird eine Nachricht, deren Text nicht in der Zielsprache verfasst ist, beim Öffnen sofort übersetzt.

Das Pop-up zeigt den Fortschritt an, zum Beispiel „8 von 12 übersetzt“. Schlägt ein Absatz fehl, erscheint dahinter in Rot „Übersetzung fehlgeschlagen, zum Wiederholen klicken“. Beim Darüberfahren mit der Maus wird der Fehler angezeigt; ein Klick übersetzt diesen Absatz erneut.

Alt+A übersetzt die aktuelle Nachricht oder stellt das Original wieder her; Alt+S schaltet zwischen „Zweisprachig“ und „Nur Übersetzung“ um. Beide Tastenkombinationen lassen sich im Zahnradmenü der Add-ons-Verwaltung unter „Tastenkombinationen für Erweiterungen verwalten“ ändern.

Im Modus „Nur Übersetzung“ zeigt ein Tooltip den Originaltext an, wenn der Mauszeiger über einer Übersetzung steht.

## Einstellungen

Die Einstellungsseite öffnet sich über die Schaltfläche „Einstellungen“ dieser Erweiterung in der Add-ons-Verwaltung. Einstellungen werden automatisch gespeichert; sobald sie geschrieben sind, erscheint oben rechts „Gespeichert“.

| Abschnitt | Inhalt |
| --- | --- |
| Allgemein | Sprache der Benutzeroberfläche, Zielsprache, Standard-Anzeigemodus, aktueller Dienst, automatische Übersetzung |
| Übersetzungsdienste | Endpunkt, API-Schlüssel, Modell und Temperatur jedes Dienstes; Schaltflächen „Verbindung testen“ und „Diesen Dienst verwenden“ |
| System-Prompt | Eigener System-Prompt für KI-Dienste; `{{to}}` wird durch den Namen der Zielsprache ersetzt; leer bedeutet integrierter Prompt |
| Bündelung von Anfragen | Sammelzeitraum, maximale Zeichen und Absätze pro Anfrage, gleichzeitige Anfragen, Wiederholungsversuche, ob KI-Anfragen zusammengefasst werden |
| Darstellung der Übersetzung | Linie links, gestrichelte Linie links, Hervorhebung oder schlicht; Akzentfarbe, Textdeckkraft, relative Schriftgröße; Live-Vorschau |
| Cache | Cache ein oder aus, maximale Anzahl zwischengespeicherter Absätze, aktuelle Anzahl der Einträge, Cache leeren |

„Verbindung testen“ sendet einen Testsatz mit den Werten, die gerade in den Eingabefeldern stehen. Bei Erfolg zeigt die Schaltfläche die Übersetzung an, bei einem Fehler die Fehlermeldung des Dienstes, zum Beispiel einen ungültigen Schlüssel oder einen unbekannten Modellnamen.

## Sprache der Benutzeroberfläche

Die Option „Sprache der Benutzeroberfläche“ im Abschnitt „Allgemein“ kennt zwei Arten von Werten:

- „Wie Thunderbird“ (Standard): Die Erweiterung verwendet die unterstützte Sprache, die der Sprache der Thunderbird-Oberfläche am nächsten kommt. Die Beschriftung der Option zeigt die aktuell gewählte Sprache an, zum Beispiel „Wie Thunderbird (Deutsch)“.
- Eine der 12 unterstützten Sprachen: Die Erweiterung verwendet diese Sprache unabhängig von der Sprache von Thunderbird.

Die Auswahl gilt für das Pop-up, die Einstellungsseite, die Beschriftungen in Nachrichten („Wird übersetzt…“, „Übersetzung fehlgeschlagen, zum Wiederholen klicken“), Fehlermeldungen, das Ergebnis des Verbindungstests und den Tooltip der Symbolleisten-Schaltfläche. Eine geöffnete Einstellungsseite oder ein geöffnetes Pop-up wechselt die Texte sofort. Beschriftungen in einer bereits übersetzten Nachricht ändern sich beim nächsten Neuzeichnen.

Einige Texte liest Thunderbird selbst aus dem Manifest der Erweiterung; sie folgen immer der Sprache der Thunderbird-Oberfläche. Das sind der Name und die Beschreibung der Erweiterung in der Add-ons-Verwaltung sowie die Beschreibungen der Tastenkombinationen unter „Tastenkombinationen für Erweiterungen verwalten“. Die Einstellungsseite weist unter der Option darauf hin.

„Wie Thunderbird“ ordnet die Sprache von Thunderbird folgendermaßen zu:

| Sprache von Thunderbird | Verwendete Sprache der Benutzeroberfläche |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Traditionelles Chinesisch |
| andere `zh-*` | Vereinfachtes Chinesisch |
| `pt-*` | Portugiesisch (Brasilien) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | die Sprache mit demselben primären Subtag |
| jede andere Sprache | Englisch |

Die Liste der Zielsprachen zeigt jeden Sprachnamen in der Sprache der Benutzeroberfläche, gefolgt vom Eigennamen der Sprache, zum Beispiel „Japanisch (日本語)“. Prompts an KI-Dienste verwenden immer den englischen Sprachnamen, weil Modelle englische Anweisungen am zuverlässigsten befolgen.

Bei der ersten Installation wird die Zielsprache aus der Sprache der Benutzeroberfläche abgeleitet: Ein japanisches Thunderbird startet mit Japanisch als Zielsprache, ein englisches mit Englisch. Eine bereits vorhandene Zielsprache wird nie überschrieben.

## Unterstützte Sprachen der Benutzeroberfläche

| Code | Sprache |
| --- | --- |
| `en` | English (Englisch) |
| `zh_CN` | 简体中文 (Vereinfachtes Chinesisch) |
| `zh_TW` | 繁體中文 (Traditionelles Chinesisch) |
| `ja` | 日本語 (Japanisch) |
| `ko` | 한국어 (Koreanisch) |
| `fr` | Français (Französisch) |
| `de` | Deutsch |
| `es` | Español (Spanisch) |
| `pt_BR` | Português (Brasil) (Portugiesisch, Brasilien) |
| `ru` | Русский (Russisch) |
| `tr` | Türkçe (Türkisch) |
| `vi` | Tiếng Việt (Vietnamesisch) |

Die Liste der Zielsprachen ist davon unabhängig und umfasst 20 Sprachen, darunter Italienisch, Ukrainisch, Polnisch, Niederländisch, Thai, Indonesisch, Arabisch und Hindi.

## Konfiguration der Anbieter

### Kostenlose und selbst gehostete Dienste

| Dienst | Einrichtung | Hinweise |
| --- | --- | --- |
| Google Translate (kostenlos, Standard) | Keine | Ruft den Endpunkt `client=gtx` von `translate.googleapis.com` auf; ein POST trägt mehrere `q`-Parameter, sodass sich mehrere Absätze eine Anfrage teilen |
| Microsoft Translator (kostenlos) | Keine | Versucht zuerst, ein Token von `edge.microsoft.com/translate/auth` zu holen und `api-edge.cognitive.microsofttranslator.com` aufzurufen; hat Microsoft den Token-Endpunkt abgeschaltet, wechselt die Erweiterung zu `edge.microsoft.com/translate/translatetext`. Beide Wege akzeptieren Arrays direkt |
| DeepLX | Endpunkt erforderlich | Ein selbst gehosteter oder fremder DeepLX-Dienst; das Token ist optional. Enthält der Endpunkt `{{apiKey}}`, wird dieser Platzhalter durch das Token ersetzt; andernfalls wird das Token als `Authorization: Bearer` gesendet |

### KI-Anbieter

Alle KI-Anbieter werden über `generateText` des Vercel AI SDK aufgerufen. Anbieter mit einem offiziellen `@ai-sdk/*`-Paket nutzen dieses Paket, die übrigen `@ai-sdk/openai-compatible`. Endpunkt, API-Schlüssel, Modell und Temperatur lassen sich für jeden Anbieter ändern. Das Modellfeld schlägt gängige Modelle vor und akzeptiert auch beliebige andere Modellnamen.

| Anbieter | SDK-Paket | Standard-Endpunkt | Standardmodell | Schlüssel erforderlich |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Ja |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Ja |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Ja |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-chat` | Ja |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | Ja |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Ja |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Ja |
| Ollama (lokal) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | Nein |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Ja |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Ja |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Ja |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Ja |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Ja |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Ja |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Ja |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Ja |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Ja |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Ja |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | Ja |
| Azure OpenAI | `@ai-sdk/azure` | Muss ausgefüllt werden | `gpt-4.1-mini` | Ja |
| LM Studio (lokal) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | Nein |
| Benutzerdefiniert (OpenAI-kompatibel) | `@ai-sdk/openai-compatible` | Muss ausgefüllt werden | Muss ausgefüllt werden | Nein |

Für einige Anbieter gelten zusätzliche Anforderungen:

- Anthropic Claude: Die Erweiterung fügt den Header `anthropic-dangerous-direct-browser-access: true` hinzu, den Anthropic für Anfragen aus einem Browserkontext verlangt. Die Claude-5-Serie sowie Opus 4.7 und 4.8 lehnen eine eigene Temperatur ab. Die Erweiterung sendet für diese Modelle daher keine Temperatur, und das Temperaturfeld des Standardmodells ist leer.
- Azure OpenAI: Der Endpunkt lautet `https://<resource>.openai.azure.com/openai`, und das Modellfeld nimmt den Namen der Bereitstellung auf.
- Ollama: Standardmäßig lehnt Ollama ursprungsübergreifende Anfragen (Cross-Origin) von Erweiterungsseiten ab. Ollama muss mit der Umgebungsvariable `OLLAMA_ORIGINS=moz-extension://*` gestartet werden.
- Moonshot: Der Standard-Endpunkt ist die chinesische Seite `api.moonshot.cn`; Konten auf der internationalen Seite verwenden `https://api.moonshot.ai/v1`.
- Volcengine Doubao: Das Modellfeld nimmt entweder einen Modellnamen oder die ID eines in der Ark-Konsole angelegten Inferenz-Endpunkts auf.

## Funktionsweise der Bündelung

Eine Nachricht hat meist zwischen zehn und einigen Dutzend Absätzen. Bei einer Anfrage pro Absatz trägt jeder Absatz eine eigene Kopie des System-Prompts und der Anweisungen, und jeder Absatz verbraucht eine Anfrage aus dem Ratenlimit. Die Bündelung fasst Absätze, die kurz nacheinander eintreffen, in einer Anfrage zusammen. Beide Kosten fallen dann pro Bündel statt pro Absatz an.

### Ablauf

1. Das Inhaltsskript übergibt jeden zu übersetzenden Absatz an das Hintergrundskript.
2. Das Hintergrundskript sucht zuerst im Cache und antwortet bei einem Treffer direkt. Der Cache-Schlüssel besteht aus dem Anbieter, dem Modell, der Zielsprache, einer Signatur des System-Prompts und einem Hash des Absatztexts. Wird derselbe Text bereits übersetzt, teilen sich spätere Anfragen dasselbe Ergebnis.
3. Absätze, die nicht im Cache liegen, kommen in die Bündelungswarteschlange, gruppiert nach Anbieter + Modell + Endpunkt + Zielsprache. Die Absätze einer Gruppe sammeln sich 50 ms lang. Eine Gruppe wird gesendet, wenn der Sammelzeitraum endet, wenn die Absatzgrenze erreicht ist oder wenn der nächste Absatz die Zeichengrenze überschreiten würde. Ein einzelner Absatz, der länger als die Zeichengrenze ist, bildet ein eigenes Bündel.
4. Die Anfragewarteschlange führt jedes Bündel aus. Sie begrenzt die gleichzeitigen Anfragen und wiederholt Anfragen bei 429, 5xx und Netzwerkfehlern mit exponentiellem Backoff; sendet der Server `Retry-After`, wartet sie die angegebene Zeit. Fehler wie 401 und 400 werden ohne Wiederholung gemeldet.
5. Die Ergebnisse gehen in den Cache im Arbeitsspeicher und werden nach 1 Sekunde in einem einzigen Schreibvorgang in `storage.local` geschrieben. Der Cache verdrängt die am längsten nicht verwendeten Einträge (Least Recently Used, LRU).

### Wie jeder Dienst Absätze zusammenfasst

- Google: ein POST mit mehreren `q`-Parametern; das zurückgegebene Array entspricht der Eingabe eins zu eins.
- Microsoft: Der Anfragetext selbst ist ein Array.
- DeepLX: Der Endpunkt nimmt einen Absatz pro Anfrage an, daher werden die Absätze eines Bündels gleichzeitig angefragt.
- KI-Anbieter: Die Absätze werden nummeriert und in eine Nachricht gesetzt, und das Modell soll ein JSON-Array derselben Länge zurückgeben. Der Parser versucht der Reihe nach: ein JSON-Array (auch in einem Codeblock oder umgeben von Erläuterungen; nackte Zeilenumbrüche in Strings und abschließende Kommas werden repariert), nummerierte `<seg>`-Blöcke, nummerierte Zeilen und das Trennzeichen `%%`. Scheitern alle Varianten oder stimmt die Anzahl nicht, wird dieses Bündel erneut mit einer Anfrage pro Absatz gesendet; der Benutzer sieht dasselbe Ergebnis. Andere Fehler als Parserfehler, etwa Authentifizierungsfehler, lösen diesen Rückfall nicht aus, damit derselbe Fehler nicht N-mal wiederholt wird.

### Kostenabschätzung

Der System-Prompt und die Anweisungen umfassen $s$ Tokens, jeder Absatz im Mittel $t$ Tokens. Insgesamt gibt es $N$ Absätze, die Bündelgröße ist $B$, und für Nummerierung und JSON-Anführungszeichen kommen pro Absatz $c$ zusätzliche Tokens hinzu.

Bei einer Anfrage pro Absatz beträgt die Gesamtzahl der Eingabe-Tokens

$$
I_{\text{einzeln}} = N(s + t).
$$

Mit Bündelung gibt es $\lceil N/B \rceil$ Anfragen, und die Gesamtzahl der Eingabe-Tokens beträgt

$$
I_{\text{Bündel}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

Die Differenz ist

$$
I_{\text{einzeln}} - I_{\text{Bündel}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

Solange $s$ deutlich größer als $c$ ist, sparen größere Bündel mehr. Mit $s = 150$, $t = 60$, $c = 10$, $N = 20$ und $B = 30$ ergibt sich:

$$
I_{\text{einzeln}} = 20 \times 210 = 4200, \qquad I_{\text{Bündel}} = 150 + 20 \times 70 = 1550.
$$

Die Eingabe-Tokens sinken um etwa 63 %, und die Zahl der Anfragen sinkt von 20 auf 1. Die Ausgabe-Tokens sind in beiden Fällen etwa gleich, da sich die Länge der Übersetzung nicht ändert. Weniger Anfragen helfen auch bei den kostenlosen Endpunkten: Google und Microsoft begrenzen ihre kostenlosen Endpunkte nach Anfragerate, und eine Nachricht mit 20 Absätzen braucht nur eine einzige Anfrage.

## Datenschutz

- API-Schlüssel werden nur in `storage.local` des aktuellen Thunderbird-Profils gespeichert und nur mit Anfragen an den Endpunkt des zugehörigen Anbieters gesendet.
- Das Inhaltsskript läuft innerhalb der Nachrichtenseite; die Einstellungen, die es vom Hintergrundskript erhält, enthalten nie Schlüssel.
- Nachrichtentext wird nur an den aktuell gewählten Übersetzungsdienst gesendet. Die Erweiterung erhebt keine Statistiken und kontaktiert keine andere Netzwerkadresse als den Übersetzungsdienst.
- Der Übersetzungs-Cache wird lokal gespeichert und lässt sich auf der Einstellungsseite ausschalten oder leeren.
- Der Nachrichtentext verlässt den eigenen Rechner und geht an den gewählten Übersetzungsdienst. Bei vertraulichen Nachrichten halten lokale Modelle wie Ollama oder LM Studio jede Anfrage auf dem eigenen Rechner.

## Bekannte Einschränkungen

- Übersetzungen sind reiner Text. Links, Fettschrift und andere Inline-Formatierungen des Originals bleiben in der Übersetzung nicht erhalten. Im zweisprachigen Modus bleibt das Original vollständig nutzbar; im Modus „Nur Übersetzung“ lässt sich das Original per Mauszeiger anzeigen, oder die Anzeige wird auf „Zweisprachig“ zurückgeschaltet.
- Die kostenlosen Endpunkte von Google und Microsoft sind nicht dokumentiert und können sich ändern oder in der Rate begrenzt werden. Microsoft hat den Token-Endpunkt `edge.microsoft.com/translate/auth` im Juli 2026 abgeschaltet (er liefert 404). Die Erweiterung versucht den Token-Endpunkt weiterhin bei der ersten Anfrage, weicht nach einem Fehler auf den direkten Endpunkt aus und versucht den Token-Endpunkt eine Stunde lang nicht erneut.
- Ob ein Absatz bereits in der Zielsprache verfasst ist, beurteilt die Erweiterung bei Chinesisch, Japanisch, Koreanisch und ähnlichen Schriften anhand der Zeichenklasse; bei Sprachen in lateinischer Schrift verwendet sie zuerst `i18n.detectLanguage` der Erweiterungs-API. Ist diese API nicht verfügbar oder ihr Ergebnis unzuverlässig, wird nur Englisch zuverlässig erkannt; Absätze in anderen Sprachen mit lateinischer Schrift werden wie üblich zur Übersetzung gesendet.
- Das Inhaltsskript wird über `messageDisplayScripts` registriert und erreicht nur Nachrichten, die nach der Registrierung geöffnet werden. Beim Start versucht die Erweiterung, es in bereits geöffnete Nachrichten einzufügen; schlägt das fehl, genügt es, die Nachricht erneut auszuwählen.
- Fehlermeldungen der Erweiterung selbst sind übersetzt. Fehlertexte, die ein Übersetzungsdienst oder das AI SDK zurückgibt (zum Beispiel der Text einer HTTP-401-Antwort), werden unverändert angezeigt, meist auf Englisch.
- Name und Beschreibung der Erweiterung in der Add-ons-Verwaltung sowie die Beschreibungen der Tastenkombinationen folgen der Sprache der Thunderbird-Oberfläche und nicht der Option „Sprache der Benutzeroberfläche“.

## Tests

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

Die Unit-Tests decken ab: Bündelgruppierung und Warteschlangen, Auswertung der KI-Ausgabe und Rückfall, Absatzerkennung mit zweisprachiger Darstellung, Darstellung als reine Übersetzung und Wiederherstellung (in jsdom), Aufbau der Anfragen und Auswertung der Antworten für Google, Microsoft und DeepLX (mit einem Mock von fetch), die Anfrage-URL und die Authentifizierungs-Header jeder KI-Voreinstellung sowie die Lokalisierung. Bei der Lokalisierung prüfen sie identische Schlüsselmengen und Platzhalter in allen Sprachen, jede `__MSG_*__`-Referenz im Manifest, die Zuordnung von Thunderbird-Sprachen zu unterstützten Sprachen, den Rückfall auf Englisch bei fehlenden Schlüsseln und das Fehlen fest kodierter Oberflächentexte in den HTML-Seiten und Quelltexten.

`npm run build:debug` erzeugt eine Debug-xpi, die beim Öffnen einer Nachricht sofort mit der Übersetzung beginnt und den Fortschritt in die Konsole schreibt. Damit lässt sich der gesamte Ablauf in einem echten Thunderbird prüfen.

## Projektstruktur

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

## Übersetzung der Benutzeroberfläche

Die Texte der Benutzeroberfläche liegen in `locales/<language>.json`, ein flaches Objekt aus Schlüssel → Text pro Sprache. `locales/en.json` ist die Referenz: Jede andere Datei hat genau dieselben Schlüssel. `$1` bis `$9` sind Ersetzungen und müssen in jeder Übersetzung mit denselben Nummern wie im Englischen vorkommen; `{{apiKey}}` und `{{to}}` sind wörtliche Platzhalter und bleiben unverändert. Produktnamen wie Google Translate, OpenAI oder DeepLX werden nicht übersetzt.

`npm run build` wandelt diese Dateien in `dist/_locales/<language>/messages.json` um, das Format, das Thunderbird liest. Die eigene i18n-Laufzeit der Erweiterung lädt dieselben Dateien zur Laufzeit, sodass sich die Sprache der Benutzeroberfläche ohne Neustart von Thunderbird ändern lässt. Fehlende Schlüssel fallen auf Englisch zurück.

Um eine Sprache hinzuzufügen, `locales/<code>.json` mit allen Schlüsseln anlegen, den Code zusammen mit seinem Eigennamen zu `SUPPORTED_LOCALES` in `src/shared/locales.ts` hinzufügen und anschließend `npm run locales:check` und `npm test` ausführen.

## Danksagung

Der Entwurf der Absatzerkennung, der Bündelungswarteschlange, der Prompts und der Anbieterkonfiguration folgt [Read Frog](https://github.com/mengxi-ream/read-frog), einer Browsererweiterung zum Übersetzen von Webseiten, die unter GPL-3.0 veröffentlicht ist. Dieses Projekt überträgt diese Ideen auf die Nachrichtenansicht von Thunderbird und passt sie an E-Mails an, zum Beispiel durch das Aufteilen von Nur-Text-Nachrichten an Leerzeilen und das Zusammenführen hart umbrochener Zeilen.

## Lizenz

GPL-3.0-or-later. Der vollständige Text steht in [LICENSE](../LICENSE).
