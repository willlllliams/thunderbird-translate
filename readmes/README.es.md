# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | Español | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird Translate es una extensión de Thunderbird que traduce el cuerpo del mensaje que está leyendo, directamente en el panel de mensajes. La traducción puede aparecer debajo de cada párrafo original (modo bilingüe) o sustituirlo (modo solo traducción). Al desactivar la traducción, el mensaje original se restaura exactamente. Google Translate (gratuito) es el servicio predeterminado y funciona nada más instalar la extensión. También puede conectar 22 proveedores de IA, entre ellos OpenAI, Claude, Gemini, DeepSeek y Qwen.

Este documento está escrito para lectores que no han usado antes una extensión de Thunderbird. Sigue el orden instalación, uso, configuración y funcionamiento interno.

## Funciones

- Traducción del cuerpo: la extensión localiza el contenido a nivel de párrafo en el cuerpo del mensaje: párrafos, elementos de lista, celdas de tabla, encabezados, citas en bloque, div que solo contienen texto y párrafos separados por líneas en blanco en el correo de texto sin formato. Se omiten el código, los párrafos que ya están en el idioma de destino, los números, los enlaces sueltos y los espacios en blanco.
- Dos modos de visualización: el modo bilingüe inserta debajo del original un bloque de traducción con un borde izquierdo claro, legible también en temas oscuros. El modo solo traducción sustituye el original por la traducción; el original se conserva en memoria y se repone al desactivar la traducción.
- Actualización inmediata: si cambia el modo de visualización o el idioma de destino mientras un mensaje está traducido, la página se vuelve a dibujar sin reabrir el mensaje. Cambiar el modo de visualización redibuja a partir de las traducciones ya recibidas y no envía solicitudes nuevas.
- Puntos de acceso: el botón "Traducir mensaje" de la barra de herramientas de la cabecera del mensaje, con su ventana emergente, y los atajos Alt+A (traducir / mostrar original) y Alt+S (cambiar entre bilingüe y solo traducción).
- Traducción automática opcional: los mensajes que no están en el idioma de destino se traducen en cuanto se abren.
- Agrupación de solicitudes: el script de segundo plano recoge párrafos durante 50 ms y los combina en una sola solicitud, con un límite de concurrencia, reintentos con espera exponencial y una caché local.
- Servicios: 3 servicios de traducción gratuitos o autoalojados y 22 configuraciones predefinidas de proveedores de IA, una de las cuales es "Personalizado compatible con OpenAI".
- Interfaz en 12 idiomas. El idioma de la interfaz sigue al de Thunderbird de forma predeterminada y se puede elegir en la página de configuración.

## Instalación

### Desde Releases

1. Descargue el archivo `thunderbird-translate-<version>.xpi` más reciente de la página Releases de este repositorio.
2. En Thunderbird, abra Herramientas → Complementos y temas (también accesible desde el menú ≡ de la esquina superior derecha).
3. Haga clic en el icono de engranaje situado encima de la lista de extensiones, elija "Instalar complemento desde archivo…", seleccione el archivo xpi descargado y confirme.

Se requiere Thunderbird 128 o posterior.

### Compilar desde el código fuente

Se requiere Node.js 22 o posterior (el desarrollo usa Node 24 y npm 11).

```bash
npm ci
npm test
npm run build
```

`npm run build` empaqueta con esbuild el script de segundo plano, el script de contenido, la ventana emergente y la página de configuración en `dist/`, genera `dist/_locales/<language>/messages.json` a partir de los archivos de `locales/` y comprime `dist/` en `web-ext-artifacts/thunderbird-translate-<version>.xpi`. La compresión usa la biblioteca fflate, escrita íntegramente en JavaScript, y no necesita ningún comando zip del sistema.

Durante el desarrollo puede cargar la extensión sin empaquetarla: en Thunderbird abra Herramientas → Herramientas de desarrollador → Depurar complementos, haga clic en "Cargar complemento temporal…" y seleccione `dist/manifest.json`.

## Uso

Abra un mensaje. En la barra de herramientas de la cabecera del mensaje aparece el botón "Traducir mensaje". Al hacer clic se abre una ventana emergente con estos controles:

- "Traducir este mensaje": inicia la traducción. Mientras una traducción está en curso o se muestra, el botón dice "Mostrar original" y, al hacer clic, restaura el original.
- Visualización: cambia entre bilingüe y solo traducción; el cambio se aplica de inmediato al mensaje actual.
- Idioma de destino: tras un cambio, el mensaje que se está traduciendo se vuelve a traducir al nuevo idioma.
- Servicio de traducción: selecciona el servicio que se usa.
- Traducir automáticamente los mensajes que no estén en el idioma de destino: si está marcada, un mensaje cuyo cuerpo no está en el idioma de destino se traduce en cuanto se abre.

La ventana emergente muestra el progreso, por ejemplo "Traducidos 8 de 12". Cuando un párrafo falla, aparece a continuación un aviso rojo "Error al traducir, haga clic para reintentar"; al pasar el puntero por encima se muestra el error y al hacer clic se vuelve a intentar ese párrafo.

Alt+A traduce el mensaje actual o restaura el original; Alt+S cambia entre bilingüe y solo traducción. Ambos atajos se pueden cambiar en "Administrar atajos de teclado de extensiones", dentro del menú de engranaje del Administrador de complementos.

En el modo solo traducción, al pasar el puntero sobre una traducción se muestra el texto original en una descripción emergente.

## Configuración

Abra la página de configuración con el botón "Opciones" de esta extensión en el Administrador de complementos. La configuración se guarda automáticamente; cuando se ha escrito, aparece "Guardado" en la esquina superior derecha.

| Sección | Contenido |
| --- | --- |
| General | Idioma de la interfaz, idioma de destino, modo de visualización predeterminado, servicio actual, traducción automática |
| Servicios de traducción | Endpoint, clave de API, modelo y temperatura de cada servicio; botones "Probar conexión" y "Usar este servicio" |
| Prompt del sistema | Prompt del sistema personalizado para los servicios de IA; `{{to}}` se sustituye por el nombre del idioma de destino; vacío significa el prompt integrado |
| Agrupación de solicitudes | Ventana de recogida, máximo de caracteres y de párrafos por solicitud, concurrencia, reintentos, si se combinan las solicitudes de IA |
| Estilo de la traducción | Borde izquierdo, borde izquierdo discontinuo, resaltado o sin formato; color de acento, opacidad del texto, proporción del tamaño de letra; vista previa inmediata |
| Caché | Caché activada o desactivada, máximo de párrafos en caché, número actual de entradas, vaciar caché |

"Probar conexión" envía una frase de prueba con los valores que hay en ese momento en los campos. Si tiene éxito, muestra la traducción; si falla, muestra el error devuelto por el servicio, por ejemplo una clave no válida o un nombre de modelo desconocido.

## Idioma de la interfaz

La opción "Idioma de la interfaz" de la sección General admite dos tipos de valores:

- "Seguir a Thunderbird" (predeterminado): la extensión usa el idioma admitido más próximo al idioma de la interfaz de Thunderbird. La etiqueta de la opción muestra el idioma elegido en ese momento, por ejemplo "Seguir a Thunderbird (Deutsch)".
- Uno de los 12 idiomas admitidos: la extensión usa ese idioma independientemente del idioma de Thunderbird.

La elección se aplica a la ventana emergente, a la página de configuración, a las etiquetas dentro de los mensajes ("Traduciendo…", "Error al traducir, haga clic para reintentar"), a los mensajes de error, al resultado de la prueba de conexión y a la descripción emergente del botón de la barra de herramientas. Una página de configuración o una ventana emergente abiertas cambian su texto de inmediato. Las etiquetas de un mensaje ya traducido cambian la próxima vez que se dibujan.

Algunos textos los lee el propio Thunderbird del manifiesto de la extensión y siempre siguen el idioma de la interfaz de Thunderbird: el nombre y la descripción de la extensión en el Administrador de complementos y las descripciones de los atajos en "Administrar atajos de teclado de extensiones". La página de configuración lo indica debajo de la opción.

"Seguir a Thunderbird" asigna el idioma de Thunderbird de la siguiente forma:

| Idioma de Thunderbird | Idioma de la interfaz usado |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Chino tradicional |
| otros `zh-*` | Chino simplificado |
| `pt-*` | Portugués (Brasil) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | el idioma con la misma subetiqueta principal |
| cualquier otro idioma | Inglés |

La lista de idiomas de destino muestra el nombre de cada idioma en el idioma de la interfaz seguido del nombre del idioma en sí mismo, por ejemplo "japonés (日本語)". Los prompts enviados a los servicios de IA usan siempre el nombre del idioma en inglés, porque los modelos siguen con más fiabilidad las instrucciones en inglés.

En la primera instalación, el idioma de destino se establece a partir del idioma de la interfaz: un Thunderbird en japonés empieza con el japonés como idioma de destino, y uno en inglés, con el inglés. Un idioma de destino ya existente nunca se sobrescribe.

## Idiomas de interfaz admitidos

| Código | Idioma |
| --- | --- |
| `en` | English |
| `zh_CN` | 简体中文 (chino simplificado) |
| `zh_TW` | 繁體中文 (chino tradicional) |
| `ja` | 日本語 (japonés) |
| `ko` | 한국어 (coreano) |
| `fr` | Français (francés) |
| `de` | Deutsch (alemán) |
| `es` | Español (español) |
| `pt_BR` | Português (Brasil) (portugués de Brasil) |
| `ru` | Русский (ruso) |
| `tr` | Türkçe (turco) |
| `vi` | Tiếng Việt (vietnamita) |

La lista de idiomas de destino es independiente y contiene 20 idiomas, entre ellos italiano, ucraniano, polaco, neerlandés, tailandés, indonesio, árabe e hindi.

## Configuración de los proveedores

### Servicios gratuitos y autoalojados

| Servicio | Configuración | Notas |
| --- | --- | --- |
| Google Translate (gratuito, predeterminado) | Ninguna | Llama al endpoint `client=gtx` de `translate.googleapis.com`; un POST lleva varios parámetros `q`, de modo que varios párrafos comparten una solicitud |
| Microsoft Translator (gratuito) | Ninguna | Primero intenta obtener un token de `edge.microsoft.com/translate/auth` y llamar a `api-edge.cognitive.microsofttranslator.com`; si Microsoft ha retirado el endpoint del token, cambia a `edge.microsoft.com/translate/translatetext`. Ambas rutas aceptan arrays de forma nativa |
| DeepLX | Endpoint obligatorio | Un servicio DeepLX autoalojado o de terceros; el token es opcional. Si el endpoint contiene `{{apiKey}}`, el token lo sustituye; si no, se envía como `Authorization: Bearer` |

### Proveedores de IA

Todos los proveedores de IA se llaman mediante `generateText` del Vercel AI SDK. Los proveedores con un paquete `@ai-sdk/*` oficial usan ese paquete; los demás usan `@ai-sdk/openai-compatible`. El endpoint, la clave de API, el modelo y la temperatura se pueden cambiar para cada proveedor. El campo del modelo sugiere modelos habituales y acepta también cualquier nombre de modelo.

| Proveedor | Paquete del SDK | Endpoint predeterminado | Modelo predeterminado | Requiere clave |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Sí |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Sí |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Sí |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-chat` | Sí |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | Sí |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Sí |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Sí |
| Ollama (local) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | No |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Sí |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Sí |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Sí |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Sí |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Sí |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Sí |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Sí |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Sí |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Sí |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Sí |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | Sí |
| Azure OpenAI | `@ai-sdk/azure` | Hay que rellenarlo | `gpt-4.1-mini` | Sí |
| LM Studio (local) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | No |
| Personalizado compatible con OpenAI | `@ai-sdk/openai-compatible` | Hay que rellenarlo | Hay que rellenarlo | No |

Algunos proveedores tienen requisitos adicionales:

- Anthropic Claude: la extensión añade la cabecera `anthropic-dangerous-direct-browser-access: true`, que Anthropic exige para las solicitudes desde un contexto de navegador. La serie Claude 5 y Opus 4.7 y 4.8 rechazan una temperatura personalizada, por lo que la extensión no envía temperatura para estos modelos y el campo de temperatura del modelo predeterminado está vacío.
- Azure OpenAI: el endpoint es `https://<resource>.openai.azure.com/openai` y el campo del modelo recibe el nombre de la implementación.
- Ollama: de forma predeterminada, Ollama rechaza las solicitudes de origen cruzado procedentes de páginas de extensiones. Inicie Ollama con la variable de entorno `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: el endpoint predeterminado es el del sitio de China, `api.moonshot.cn`; las cuentas del sitio internacional usan `https://api.moonshot.ai/v1`.
- Volcengine Doubao: el campo del modelo recibe un nombre de modelo o el ID de un endpoint de inferencia creado en la consola de Ark.

## Funcionamiento de la agrupación

Un mensaje suele tener entre diez y unas pocas decenas de párrafos. Con una solicitud por párrafo, cada párrafo lleva su propia copia del prompt del sistema y de las instrucciones, y cada párrafo consume una solicitud del límite de frecuencia. La agrupación combina en una sola solicitud los párrafos que llegan con poca separación, de modo que ambos costes se pagan por lote y no por párrafo.

### Flujo

1. El script de contenido entrega al script de segundo plano cada párrafo que hay que traducir.
2. El script de segundo plano consulta primero la caché y, si encuentra el párrafo, responde directamente. La clave de la caché se compone del proveedor, el modelo, el idioma de destino, una firma del prompt del sistema y un hash del texto del párrafo. Si el mismo texto ya se está traduciendo, las solicitudes posteriores comparten el mismo resultado.
3. Los párrafos que no están en la caché entran en la cola de lotes, agrupados por proveedor + modelo + endpoint + idioma de destino. Los párrafos de un grupo se acumulan durante 50 ms. Un grupo se envía cuando termina la ventana, cuando se alcanza el límite de párrafos o cuando el siguiente párrafo superaría el límite de caracteres. Un párrafo que por sí solo supera el límite de caracteres forma su propio lote.
4. La cola de solicitudes ejecuta cada lote. Limita la concurrencia y reintenta los errores 429, 5xx y de red con espera exponencial; si el servidor envía `Retry-After`, espera ese tiempo. Los errores como 401 y 400 se notifican sin reintentar.
5. Los resultados pasan a la caché en memoria y se escriben en `storage.local` en una sola escritura al cabo de 1 segundo. La caché descarta primero las entradas usadas menos recientemente (LRU, least recently used).

### Cómo combina los párrafos cada servicio

- Google: un POST con varios parámetros `q`; el array devuelto se corresponde uno a uno con la entrada.
- Microsoft: el propio cuerpo de la solicitud es un array.
- DeepLX: el endpoint acepta un párrafo por solicitud, así que los párrafos de un lote se solicitan de forma concurrente.
- Proveedores de IA: los párrafos se numeran y se colocan en un solo mensaje, y se pide al modelo que devuelva un array JSON de la misma longitud. El analizador prueba, por orden: un array JSON (posiblemente dentro de un bloque de código o rodeado de explicaciones; se reparan los saltos de línea sin escapar dentro de cadenas y las comas finales), bloques `<seg>` numerados, líneas numeradas y el separador `%%`. Si todos fallan o el número no coincide, ese lote se vuelve a enviar con un párrafo por solicitud, y el usuario ve el mismo resultado. Los errores que no son de análisis, como los fallos de autenticación, no activan esta alternativa, de modo que el mismo error no se repite N veces.

### Estimación del coste

Sean $s$ los tokens que ocupan el prompt del sistema y las instrucciones, $t$ los tokens medios de cada párrafo, $N$ el número total de párrafos, $B$ el tamaño del lote y $c$ los tokens adicionales por párrafo para la numeración y las comillas del JSON.

Con una solicitud por párrafo, el número total de tokens de entrada es

$$
I_{\text{individual}} = N(s + t).
$$

Con agrupación hay $\lceil N/B \rceil$ solicitudes, y el número total de tokens de entrada es

$$
I_{\text{lote}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

La diferencia es

$$
I_{\text{individual}} - I_{\text{lote}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

Mientras $s$ sea claramente mayor que $c$, los lotes más grandes ahorran más. Con $s = 150$, $t = 60$, $c = 10$, $N = 20$ y $B = 30$:

$$
I_{\text{individual}} = 20 \times 210 = 4200, \qquad I_{\text{lote}} = 150 + 20 \times 70 = 1550.
$$

Los tokens de entrada se reducen en torno a un 63 %, y el número de solicitudes baja de 20 a 1. Los tokens de salida son aproximadamente los mismos en ambos casos, ya que la longitud de la traducción no cambia. Reducir las solicitudes también importa en los endpoints gratuitos: Google y Microsoft limitan sus endpoints gratuitos por frecuencia de solicitudes, y un mensaje de 20 párrafos ocupa una sola solicitud.

## Privacidad

- Las claves de API se guardan solo en `storage.local` del perfil actual de Thunderbird y solo se envían en las solicitudes al endpoint del proveedor correspondiente.
- El script de contenido se ejecuta dentro de la página del mensaje; la configuración que recibe del script de segundo plano nunca contiene claves.
- El texto del mensaje se envía solo al servicio de traducción seleccionado en ese momento. La extensión no recopila estadísticas ni contacta con ninguna dirección de red aparte del servicio de traducción.
- La caché de traducciones se guarda localmente y se puede desactivar o vaciar en la página de configuración.
- El texto del mensaje sale de su ordenador y va al servicio de traducción seleccionado. Para el correo confidencial, los modelos locales como Ollama o LM Studio mantienen todas las solicitudes en su propio equipo.

## Limitaciones conocidas

- Las traducciones son texto sin formato. Los enlaces, la negrita y el resto del formato en línea del original no se conservan en la traducción. En el modo bilingüe el original sigue siendo plenamente utilizable; en el modo solo traducción puede pasar el puntero por encima para ver el original o volver al modo bilingüe.
- Los endpoints gratuitos de Google y Microsoft no están documentados y pueden cambiar o tener limitaciones de frecuencia. Microsoft retiró el endpoint del token `edge.microsoft.com/translate/auth` en julio de 2026 (devuelve 404). La extensión sigue probando el endpoint del token en la primera solicitud, recurre al endpoint directo tras un fallo y no vuelve a probar el endpoint del token durante una hora.
- Para decidir si un párrafo ya está en el idioma de destino, el chino, el japonés, el coreano y escrituras similares se evalúan por clase de carácter, y los idiomas de escritura latina usan primero `i18n.detectLanguage` de la API de extensiones. Cuando esa API no está disponible o su resultado no es fiable, solo el inglés se detecta de forma fiable; los párrafos en otros idiomas de escritura latina se envían a traducir de la forma habitual.
- El script de contenido se registra mediante `messageDisplayScripts` y solo llega a los mensajes abiertos después del registro. Al iniciarse, la extensión intenta inyectarlo en los mensajes ya abiertos; si eso falla, basta con volver a seleccionar el mensaje.
- Los mensajes de error que produce la extensión están traducidos. Los textos de error devueltos por un servicio de traducción o por el AI SDK (por ejemplo, el cuerpo de una respuesta HTTP 401) se muestran tal como se reciben, normalmente en inglés.
- El nombre de la extensión, su descripción en el Administrador de complementos y las descripciones de los atajos siguen el idioma de la interfaz de Thunderbird, no la opción de idioma de la interfaz.

## Pruebas

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

Las pruebas unitarias cubren la agrupación en lotes y las colas, el análisis de la salida de IA y la alternativa de reserva, la detección de párrafos con el dibujado y la restauración en modo bilingüe y solo traducción (en jsdom), la construcción de solicitudes y el análisis de respuestas de Google, Microsoft y DeepLX (con un fetch simulado), la URL de solicitud y las cabeceras de autenticación de cada configuración predefinida de IA, y la localización: conjuntos de claves y marcadores idénticos en todos los idiomas, cada referencia `__MSG_*__` del manifiesto, la asignación de los idiomas de Thunderbird a los idiomas admitidos, el recurso al inglés para las claves que faltan y la ausencia de texto de interfaz escrito directamente en las páginas HTML y en el código fuente.

`npm run build:debug` genera un xpi de depuración que empieza a traducir en cuanto se abre un mensaje y escribe el progreso en la consola, para comprobar el flujo completo en un Thunderbird real.

## Estructura del proyecto

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

## Traducir la interfaz

Los textos de la interfaz están en `locales/<language>.json`, un objeto plano clave → texto por idioma. `locales/en.json` es la referencia: todos los demás archivos tienen exactamente las mismas claves. De `$1` a `$9` son sustituciones y deben aparecer en cada traducción con los mismos números que en inglés; `{{apiKey}}` y `{{to}}` son marcadores literales y no se modifican. Los nombres de productos como Google Translate, OpenAI o DeepLX no se traducen.

`npm run build` convierte estos archivos en `dist/_locales/<language>/messages.json`, el formato que lee Thunderbird. El propio entorno de i18n de la extensión carga los mismos archivos en tiempo de ejecución, por lo que el idioma de la interfaz puede cambiar sin reiniciar Thunderbird. Las claves que faltan recurren al inglés.

Para añadir un idioma, cree `locales/<code>.json` con todas las claves, añada el código a `SUPPORTED_LOCALES` en `src/shared/locales.ts` junto con su nombre nativo y ejecute `npm run locales:check` y `npm test`.

## Agradecimientos

El diseño de la detección de párrafos, la cola de lotes, los prompts y la configuración de los proveedores sigue a [Read Frog](https://github.com/mengxi-ream/read-frog), una extensión de navegador para traducir páginas web publicada bajo la licencia GPL-3.0. Este proyecto traslada esas ideas al lector de mensajes de Thunderbird y las adapta al correo electrónico, por ejemplo dividiendo el correo de texto sin formato en las líneas en blanco y uniendo las líneas cortadas con saltos de línea fijos.

## Licencia

GPL-3.0-or-later. Consulte [LICENSE](../LICENSE) para leer el texto completo.
