# Multitraductor para Thunderbird

Multitraductor para Thunderbird es una extensión de Thunderbird que traduce el cuerpo del mensaje que está leyendo, directamente en el panel de mensajes. Funciona nada más instalarla con el servicio gratuito Google Translate. Hasta la versión 1.13 se llamaba Thunderbird Translate.

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | Español | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

![Diccionario, traducción automática y traducción de IA llegan una tras otra](../docs/media/tiers-en.gif)

Vídeo de presentación: [YouTube](https://www.youtube.com/watch?v=OZmiMGeuhJ0) (1 min) · [Bilibili](https://www.bilibili.com/video/BV1JaWw6YENX) (2 min)

## Contenido

- [Funciones](#funciones)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Uso](#uso)
- [Niveles de traducción](#niveles-de-traducción)
- [Servicios de traducción](#servicios-de-traducción)
- [Prompts](#prompts)
- [Privacidad](#privacidad)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Documentación](#documentación)
- [Agradecimientos](#agradecimientos)
- [Licencia](#licencia)

## Funciones

- Traduce los párrafos, elementos de lista, celdas de tabla, encabezados y citas del correo HTML, y los párrafos separados por líneas en blanco del correo de texto sin formato. Se omiten el código, los números, los enlaces sueltos y los párrafos que ya están en el idioma de destino.
- Dos modos de visualización: bilingüe (la traducción debajo de cada párrafo original) o solo traducción, y en ambos la negrita, las listas y los enlaces de las traducciones de IA aparecen con formato. Al desactivar la traducción, el mensaje original se restaura exactamente.
- Tres niveles de traducción trabajan a la vez: un diccionario sin conexión, un traductor automático y un servicio de IA. El resultado más rápido aparece primero y el del nivel más alto lo sustituye.
- Traducción automática sin cuenta (Google Translate, el predeterminado, y Microsoft Translator) o con una clave propia (DeepL, Baidu, Youdao, Caiyun).
- Traducción sin conexión con paquetes de diccionario y los modelos Bergamot de Mozilla; ningún texto sale de su equipo.
- 22 configuraciones predefinidas de proveedores de IA, entre ellas OpenAI, Claude, Gemini, DeepSeek, Qwen, Ollama y LM Studio en local, y cualquier servicio compatible con OpenAI.
- Traducción precisa: el nivel de IA ve el mensaje completo, de modo que los nombres y los términos se mantienen coherentes. Con ella, un servicio de IA puede leer el texto de las imágenes de un mensaje y mostrar el original y su traducción bajo cada imagen.
- Resumen y tareas: un servicio de IA enumera, encima del mensaje, el resumen, las tareas, las preguntas por responder y las fechas. El ajuste "Resumen automático" lo abre sin un clic, cuando se traduce el mensaje o para cada mensaje abierto. Con la traducción precisa, un mensaje demasiado largo para una sola solicitud necesita un análisis antes de traducirse; cuando el resumen usa el mismo servicio de IA y el mismo modelo que el nivel de IA, una sola solicitud escribe el análisis y el resumen.
- Tres prompts editables con preajustes para variedades regionales, estilos de redacción y palabras difíciles.
- Traducción automática opcional de todo mensaje que no esté en el idioma de destino.
- Interfaz en 12 idiomas y una guía de configuración que se abre después de la instalación.

## Instalación

1. Descargue el archivo `thunderbird-translate-<versión>.xpi` más reciente de la [página Releases](https://github.com/willlllliams/thunderbird-translate/releases).
2. En Thunderbird, abra Herramientas → Complementos y temas (también accesible desde el menú ≡ de la esquina superior derecha).
3. Haga clic en el icono de engranaje situado encima de la lista de extensiones, elija "Instalar complemento desde archivo…", seleccione el archivo xpi y confirme.

Se requiere Thunderbird 128 o posterior. La versión preliminar `nightly` es una compilación automática de la última confirmación y está pensada para pruebas.

## Inicio rápido

Después de la instalación, la guía de configuración se abre en una pestaña nueva. Hace una pregunta por paso: idiomas, modo de visualización y estilo de la traducción, servicio de cada nivel (con una breve demostración del resultado), descargas sin conexión, claves de los servicios y prompts. Cada elección se guarda al instante y se puede omitir cualquier paso. El último paso traduce un mensaje de ejemplo con su configuración. Puede volver a abrir la guía desde el enlace "Guía de configuración" de la ventana emergente o desde el botón de la parte superior de la página de configuración. Sin cambiar nada, abra un mensaje y pulse Alt+A: Google Translate lo traduce.

## Uso

Abra un mensaje y haga clic en el botón "Traducir mensaje" de la barra de herramientas de la cabecera del mensaje. La ventana emergente tiene estos controles:

- "Traducir este mensaje" inicia la traducción. Mientras se muestra una traducción, el botón dice "Mostrar original".
- "Volver a traducir" consulta de nuevo a todos los niveles e ignora la caché; "Resumen y tareas" muestra el resumen del mensaje encima de él.
- Modo de visualización, idioma de origen ("Detectar automáticamente" de forma predeterminada), idioma de destino, una lista de servicios por nivel, la traducción precisa con el modo de la traducción de imágenes (desactivada, preguntar bajo cada imagen, activada; en gris y con el botón "Activar la traducción precisa" mientras la traducción precisa está desactivada) y el interruptor "Traducir automáticamente los mensajes que no estén en el idioma de destino".

| Atajo | Acción |
| --- | --- |
| Alt+A | Traducir el mensaje o mostrar el original |
| Alt+S | Cambiar entre bilingüe y solo traducción |
| Alt+R | Volver a traducir ignorando la caché (solo mientras el mensaje está traducido) |

Los atajos se pueden cambiar en "Administrar atajos de teclado de extensiones", dentro del menú de engranaje del Administrador de complementos, donde el resumen recibe un atajo a su elección.

El modo bilingüe coloca cada traducción debajo de su párrafo original. El modo solo traducción sustituye el original; al pasar el ratón sobre una traducción se ve el texto original.

El resto de la configuración está en la página de configuración: el botón "Opciones" de la extensión en el Administrador de complementos. Los cambios se guardan automáticamente, y al pasar el ratón sobre un control se muestra para qué sirve. Cada ajuste se describe en [docs/settings.md](../docs/settings.md) (en inglés).

## Niveles de traducción

| Nivel | Servicios | Velocidad | Calidad | Sin conexión | Coste |
| --- | --- | --- | --- | --- | --- |
| 1 Diccionario | Diccionario | unos milisegundos | palabra por palabra, sin gramática | sí | gratuito; unos MB por par de idiomas |
| 2 Traducción automática | Google, Microsoft, DeepL, Baidu, Youdao, Caiyun, DeepLX, Bergamot | de uno a dos segundos por mensaje | completa y legible | solo Bergamot | gratuito; DeepL y Baidu tienen una cuota gratuita mensual, Youdao y Caiyun cobran por caracteres tras el crédito de prueba de una cuenta nueva; Bergamot descarga de 13 a 48 MB por dirección |
| 3 Traducción de IA | 22 proveedores de IA | de unos segundos a un minuto | la más natural; sigue sus prompts | solo modelos locales | se factura por uso a su clave de API; los modelos locales son gratuitos |

Cada nivel usa un servicio o "No se usa"; al menos un nivel necesita un servicio. La configuración predeterminada es Google Translate en el nivel 2 y nada más.

Cada párrafo se envía a la vez a todos los niveles en uso. El resultado de un nivel inferior aparece primero como traducción provisional, en cursiva y con el nombre de su nivel. El nivel más alto en uso la sustituye por la traducción final; si el nivel más alto falla, se mantiene la traducción provisional.

Cuando el diccionario o el Bergamot seleccionado no tiene los datos de los idiomas de un mensaje, un aviso encima del mensaje indica qué descargar, con un enlace a la configuración y una casilla "No volver a avisarme para estos idiomas".

## Servicios de traducción

| Grupo | Servicios | Qué necesita |
| --- | --- | --- |
| Gratuitos | Google Translate | nada |
| | Microsoft Translator | nada; modo opcional "Usar mi clave (Azure Translator)" con una clave y una región de Azure |
| | DeepLX | el punto de conexión de un servidor DeepLX; el token es opcional |
| Con su clave | DeepL API, Baidu Translate, Youdao, Caiyun | una clave de su propia cuenta; Baidu y Youdao, también un ID de aplicación |
| Sin conexión | Diccionario | descargar pares de idiomas en la sección Diccionarios; unos MB cada uno |
| | Bergamot (Mozilla) | descargar direcciones en "Modelos de traducción sin conexión (Bergamot)"; de 13 a 48 MB cada una, todos los modelos tienen el inglés en un lado |
| IA | 22 configuraciones predefinidas | una clave de API; Ollama, LM Studio y los servicios personalizados compatibles con OpenAI no necesitan ninguna |

Obtener una clave de API: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). En local: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

La traducción precisa envía el mensaje completo como contexto en cada solicitud a la IA y cuesta más; el interruptor "Modo de razonamiento" de cada proveedor de IA está desactivado de forma predeterminada, porque el razonamiento hace la traducción más lenta y más cara. Los puntos de conexión, los modelos predeterminados, el ajuste `OLLAMA_ORIGINS` de Ollama y los parámetros de razonamiento figuran en [docs/providers.md](../docs/providers.md) (en inglés).

## Prompts

El nivel de IA usa uno de tres prompts: visualización bilingüe (cercana al original), visualización solo traducción (texto fluido) y traducción precisa (términos coherentes en todo el mensaje). Cada uno se puede editar y restaurar con "Restaurar el prompt integrado".

Los preajustes añaden reglas a un prompt: una variedad regional, como el inglés británico o el uso de Taiwán, un estilo de redacción, el término original junto a las palabras difíciles o explicaciones breves de las palabras difíciles. Los detalles están en [docs/settings.md](../docs/settings.md#prompt-presets) (en inglés).

## Privacidad

- El texto del mensaje solo va a los servicios de los niveles en uso. El diccionario y Bergamot traducen en su equipo. Un resumen, abierto con un clic o automáticamente, envía el mensaje completo, con su remitente, su fecha y su asunto, a su servicio de IA.
- Antes de que el texto de un mensaje vaya por primera vez a un servicio en línea, un panel sobre el mensaje indica el servicio y su dirección y pregunta una vez por servicio y dirección. No se envía nada hasta hacer clic en «Permitir y traducir»; la página de configuración muestra los servicios permitidos y permite revocarlos. Con solo el diccionario y Bergamot no se pregunta nada.
- Una imagen solo va a un servicio de IA con la traducción precisa activada: tras un clic en el botón que tiene debajo, o sola cuando la traducción de imágenes está «Activada». Antes de la primera imagen, un panel bajo ella pregunta una vez por servicio, aparte del texto. La imagen se reduce y se codifica de nuevo, sin su nombre de archivo ni sus metadatos. Las imágenes remotas nunca se traducen.
- Una dirección que usted escribe (Ollama, LM Studio, DeepLX, un servicio personalizado, una dirección modificada) necesita permiso de conexión, que se da una vez con «Permitir acceso» o «Probar conexión» en la configuración.
- Las claves de API se guardan solo en su perfil de Thunderbird y se envían solo al punto de conexión de su propio servicio.
- Dos listas proceden de la red, sin ningún texto de mensajes: el índice de paquetes de diccionario de las versiones de GitHub de este repositorio y los registros de modelos Bergamot de Mozilla. La página de configuración y la guía de configuración las leen para mostrar las listas sin conexión. Mientras el diccionario o Bergamot está seleccionado en un nivel, también se leen al iniciar Thunderbird, al cambiar la configuración y al abrir la ventana emergente. Traducir un mensaje nunca las lee. La página de configuración y la guía de configuración también envían la frase fija de "Probar conexión" a Google Translate (gratis) y Microsoft Translator (gratis), una vez por página y servicio, cuando muestran el servicio como añadido, para saber si esta red llega a él.
- Los paquetes y los modelos se descargan solo cuando usted hace clic en un botón de descarga. La caché de traducciones se guarda en local y se puede desactivar o vaciar. La extensión no recopila estadísticas.
- Para el correo sensible, use solo el diccionario, Bergamot y modelos de IA locales (Ollama, LM Studio).

## Limitaciones conocidas

- Los enlaces y el formato en línea del original no pasan a la traducción. La negrita, las listas y los enlaces aparecen en una traducción solo cuando un servicio de IA los escribe en Markdown; las traducciones del diccionario y de la traducción automática, y las traducciones provisionales, son texto sin formato.
- Los puntos de conexión gratuitos de Google y Microsoft no están documentados y pueden cambiar o tener límite de frecuencia.
- El diccionario da una glosa palabra por palabra en el orden de las palabras de origen, y ni él ni Bergamot traducen entre chino simplificado y chino tradicional.
- Cada nivel en uso envía sus propias solicitudes, de modo que el nivel de traducción automática también cuenta para los límites de frecuencia gratuitos cuando se usa el nivel de IA.
- Los textos de error que devuelve un servicio se muestran tal como llegan, normalmente en inglés.

La lista completa está en [docs/settings.md](../docs/settings.md#known-limitations) (en inglés).

## Documentación

Los documentos siguientes están en inglés, salvo dictionary-packs.md, que está en chino.

- [docs/settings.md](../docs/settings.md): cada ajuste, las listas sin conexión, los avisos de datos ausentes y la caché.
- [docs/providers.md](../docs/providers.md): puntos de conexión, modelos predeterminados, parámetros de razonamiento y los modelos que leen imágenes, de cada servicio.
- [docs/batching.md](../docs/batching.md): cómo se combinan los párrafos en solicitudes, los tiempos de espera y los costes.
- [docs/bergamot.md](../docs/bergamot.md): el motor sin conexión Bergamot, la elección y el almacenamiento de sus modelos y su compilación.
- [docs/dictionary-packs.md](../docs/dictionary-packs.md): fuentes de datos, formato y compilación de los paquetes de diccionario (en chino).
- [docs/development.md](../docs/development.md): compilar desde el código fuente, pruebas, estructura del proyecto, traducir la interfaz y el proceso de publicación.

## Agradecimientos

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0): el diseño de la detección de párrafos, la cola de lotes, los prompts y la configuración de proveedores.
- [Mozilla Bergamot](https://browser.mt/): el motor sin conexión y los modelos de Firefox Translations (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors): los paquetes de diccionario, salvo inglés → chino simplificado, están adaptados (extraídos, filtrados y recortados) de Wiktionary, extraído con [wiktextract](https://github.com/tatuylonen/wiktextract) y publicado por [kaikki.org](https://kaikki.org/); licencia CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>).
- [ECDICT](https://github.com/skywind3000/ECDICT), Copyright (c) 2025 Linwei, licencia MIT: el paquete de diccionario inglés → chino simplificado está adaptado (extraído, filtrado y recortado) de él.

## Licencia

GPL-3.0-or-later. El texto completo está en [LICENSE](../LICENSE).
