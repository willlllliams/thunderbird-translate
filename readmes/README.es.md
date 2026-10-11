# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | Español | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird Translate es una extensión de Thunderbird que traduce el cuerpo del mensaje que está leyendo, directamente en el panel de mensajes. La traducción puede aparecer debajo de cada párrafo original (modo bilingüe) o sustituirlo (modo solo traducción). Al desactivar la traducción, el mensaje original se restaura exactamente. La traducción se hace en tres niveles a la vez: un diccionario sin conexión, un traductor automático (Google Translate, Microsoft Translator, DeepLX o los modelos sin conexión de Bergamot) y un servicio de IA (22 proveedores, entre ellos OpenAI, Claude, Gemini, DeepSeek y Qwen). El resultado más rápido aparece primero y el del nivel más alto lo sustituye. Google Translate (gratuito) es el servicio predeterminado y funciona nada más instalar la extensión.

Este documento está escrito para lectores que no han usado antes una extensión de Thunderbird. Sigue el orden instalación, uso, configuración y funcionamiento interno.

![Demostración: traducir un mensaje, alternar entre bilingüe y solo traducción, cambiar el idioma de destino](../docs/demo.gif)

## Funciones

- Traducción del cuerpo: la extensión localiza el contenido a nivel de párrafo en el cuerpo del mensaje: párrafos, elementos de lista, celdas de tabla, encabezados, citas en bloque, div que solo contienen texto y párrafos separados por líneas en blanco en el correo de texto sin formato. Se omiten el código, los párrafos que ya están en el idioma de destino, los números, los enlaces sueltos y los espacios en blanco.
- Dos modos de visualización: el modo bilingüe inserta debajo del original un bloque de traducción con un borde izquierdo claro, legible también en temas oscuros. El modo solo traducción sustituye el original por la traducción; el original se conserva en memoria y se repone al desactivar la traducción.
- Actualización inmediata: si cambia el modo de visualización o el idioma de destino mientras un mensaje está traducido, la página se vuelve a dibujar sin reabrir el mensaje. Cambiar el modo de visualización redibuja las traducciones del diccionario y de traducción automática ya recibidas; al nivel de IA se le vuelve a preguntar con el prompt del nuevo modo, y la caché responde cuando ya tiene esa traducción.
- Puntos de acceso: el botón "Traducir mensaje" de la barra de herramientas de la cabecera del mensaje, con su ventana emergente, y los atajos Alt+A (traducir / mostrar original) y Alt+S (cambiar entre bilingüe y solo traducción).
- Traducir automáticamente al abrir (opcional): los mensajes que no están en el idioma de destino se traducen en cuanto se abren.
- Agrupación de solicitudes: el script de segundo plano recoge párrafos durante 50 ms y los combina en una sola solicitud, con un límite de concurrencia, reintentos con espera exponencial y una caché local.
- Tres niveles de traducción: diccionario, traducción automática e IA. Cada nivel tiene su propio servicio o no se usa; cada párrafo se envía a la vez a todos los niveles en uso. Un nivel inferior se muestra como traducción provisional hasta que el nivel más alto lo sustituye, y se mantiene si el nivel más alto falla.
- Servicios: un diccionario sin conexión, 4 traductores automáticos (Google Translate, Microsoft Translator, DeepLX y los modelos sin conexión de Bergamot) y 22 configuraciones predefinidas de proveedores de IA, una de las cuales es "Personalizado compatible con OpenAI". En las listas de los niveles solo aparecen los servicios que se han añadido.
- Idioma de origen: detección automática o un idioma fijo, que se transmite a todos los servicios.
- Tres prompts para el nivel de IA: uno para la visualización bilingüe, otro para la visualización solo de la traducción y otro para la traducción precisa.
- Preajustes de prompt: reglas listas para usar para una variedad regional del idioma de destino, para las palabras difíciles con el original entre paréntesis, para explicaciones breves de las palabras difíciles y para cuatro estilos de redacción. Cada preajuste se puede añadir a cualquiera de los tres prompts.
- Guía de configuración: se abre después de la instalación y configura paso a paso los idiomas, el modo de visualización, los niveles, las descargas sin conexión, los servicios y los prompts. Termina con una traducción de prueba de un mensaje de ejemplo.
- Traducción precisa (nivel de IA): el mensaje completo sirve de contexto a cada solicitud, de modo que los nombres, los términos y las formas de tratamiento se mantienen coherentes entre párrafos.
- Interruptor del modo de razonamiento para cada proveedor de IA, desactivado de forma predeterminada.
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

`npm run build` empaqueta con esbuild el script de segundo plano, el script de contenido, la ventana emergente, la página de configuración, la guía de configuración y el worker de Bergamot en `dist/`, genera `dist/_locales/<language>/messages.json` a partir de los archivos de `locales/` y comprime `dist/` en `web-ext-artifacts/thunderbird-translate-<version>.xpi`. La compresión usa la biblioteca fflate, escrita íntegramente en JavaScript, y no necesita ningún comando zip del sistema. El script de segundo plano es un módulo ES: el AI SDK va en un chunk aparte bajo `dist/chunks/`, que se carga cuando se usa el nivel de IA, de modo que Thunderbird inicia la extensión sin él. El primer build descarga de Mozilla el motor Bergamot (wasm) en la versión fijada y lo guarda en `.cache/`, véase [docs/bergamot.md](../docs/bergamot.md).

Durante el desarrollo puede cargar la extensión sin empaquetarla: en Thunderbird abra Herramientas → Herramientas de desarrollador → Depurar complementos, haga clic en "Cargar complemento temporal…" y seleccione `dist/manifest.json`.

## Guía de configuración

Después de una instalación nueva, Thunderbird abre la guía de configuración en una pestaña. Las actualizaciones de la extensión o de Thunderbird no la abren. Más adelante, la guía se abre con el enlace "Guía de configuración" de la ventana emergente y con el botón "Guía de configuración" de la parte superior de la página de configuración.

Cada paso pide una sola decisión y la guarda al momento. Hay tres formas de moverse entre los pasos:

- "Atrás", "Siguiente" y "Omitir este paso" pasan de un paso a otro.
- La lista numerada bajo la barra de progreso salta a cualquier paso.
- "Salir de la guía" cierra la pestaña en cualquier momento.

La siguiente visita empieza en el paso en que se dejó la guía. Después de "Terminar", empieza desde el principio.

| Paso | Contenido | Se muestra cuando |
| --- | --- | --- |
| 1 Idiomas | idioma de la interfaz, idioma de origen ("Detectar automáticamente" de forma predeterminada), idioma de destino | siempre |
| 2 Visualización | bilingüe o solo traducción, con una vista previa de un mensaje de ejemplo en el estilo de traducción actual | siempre |
| 3 Niveles de traducción | velocidad, calidad, privacidad y coste de los niveles de diccionario, traducción automática e IA; el servicio de cada nivel o "No se usa", con al menos un nivel con servicio | siempre |
| 4 Traducción sin conexión | los paquetes de diccionario y las direcciones de Bergamot que necesitan los idiomas del paso 1, con tamaño, licencia y atribución; se marcan los que se quieren descargar y "Descargar lo seleccionado" los descarga mostrando el progreso | el nivel de diccionario está en uso o el nivel de traducción automática usa Bergamot |
| 5 Traducción automática en línea | los campos del traductor automático: nada que rellenar para Google, modo gratuito o modo con clave de Azure para Microsoft, endpoint y token para DeepLX; "Probar conexión" | el nivel de traducción automática usa Google, Microsoft o DeepLX |
| 6 Traducción de IA | el proveedor de IA, su clave de API, el modelo, la temperatura y el modo de razonamiento, "Probar conexión" y la opción "Traducción precisa"; un aviso de que el modo de razonamiento y la traducción precisa hacen la traducción más lenta y más cara | el nivel de IA está en uso |
| 7 Prompts | los tres prompts y la biblioteca de preajustes (véase "Preajustes de prompt") | el nivel de IA está en uso |
| 8 Listo | cómo traducir (botón de la barra de herramientas, Alt+A, Alt+S), la opción "Traducir automáticamente los mensajes que no estén en el idioma de destino" y "Traducir el mensaje de ejemplo" | siempre |

Un paso que las elecciones anteriores no necesitan sigue en la lista, tachado, y la navegación lo salta. Por ejemplo, elegir un servicio de IA en el paso 3 hace que vuelvan los pasos 6 y 7.

Con japonés como idioma de origen y chino simplificado como idioma de destino, el paso 4 recomienda estas descargas:

- Diccionario: el paquete japonés → chino si la versión publicada lo incluye; si no, los dos paquetes japonés → inglés e inglés → chino.
- Bergamot: las direcciones ja → en y en → zh-Hans, porque todos los modelos de Bergamot tienen el inglés en uno de sus lados.

Con "Detectar automáticamente", el paso 4 recomienda los paquetes y las direcciones desde el inglés. Un aviso pide entonces instalar la dirección hacia el inglés de cada uno de los demás idiomas en que recibe correo.

"Traducir el mensaje de ejemplo", en el paso 8, muestra en la página un correo breve (en el idioma de origen si es inglés o alemán; si no, en inglés, o en alemán cuando el idioma de destino es el inglés) y lo traduce con la configuración actual. La página usa la detección de párrafos y el dibujado del script de contenido. Envía las solicitudes al script de segundo plano por la misma conexión que un mensaje mostrado. Por eso el resultado muestra cómo se verá un mensaje real, incluidos los niveles en uso.

La guía usa los mismos componentes que la página de configuración: los campos de los servicios con la prueba de conexión, las listas de diccionarios y de modelos de Bergamot, y el editor de prompts con sus preajustes.

## Uso

Abra un mensaje. En la barra de herramientas de la cabecera del mensaje aparece el botón "Traducir mensaje". Al hacer clic se abre una ventana emergente con estos controles:

- "Traducir este mensaje": inicia la traducción. Mientras una traducción está en curso o se muestra, el botón dice "Mostrar original" y, al hacer clic, restaura el original.
- Visualización: cambia entre bilingüe y solo traducción; el cambio se aplica de inmediato al mensaje actual.
- Idioma de origen e idioma de destino: "Detectar automáticamente" es el idioma de origen predeterminado. Tras un cambio de cualquiera de los dos, el mensaje que se está traduciendo se vuelve a traducir. Si ambos son el mismo idioma, aparece un aviso.
- Niveles de traducción: una lista por nivel ("Nivel 1: Diccionario", "Nivel 2: Traducción automática", "Nivel 3: Traducción de IA"), cada una con "No se usa" y los servicios añadidos de ese nivel. Al menos un nivel necesita un servicio; si se elige "No se usa" en el último que queda, el cambio se rechaza con un aviso. "+ Añadir servicio de traducción", debajo de las listas, abre la página de configuración en los servicios de traducción.
- Traducción precisa: aparece mientras el nivel de IA tiene un servicio.
- Traducir automáticamente los mensajes que no estén en el idioma de destino: si está marcada, un mensaje cuyo cuerpo no está en el idioma de destino se traduce en cuanto se abre.
- Guía de configuración: abre la guía de configuración en una pestaña nueva.

La ventana emergente muestra el progreso, por ejemplo "Traducidos 8 de 12". Los párrafos que aún muestran la traducción provisional de un nivel inferior se cuentan aparte, por ejemplo "Traducidos 7 de 9 (2 provisionales)". Cuando todos los niveles fallan en un párrafo, aparece a continuación un aviso rojo "Error al traducir, haga clic para reintentar"; al pasar el puntero por encima se muestra el error y al hacer clic se vuelve a intentar ese párrafo.

Alt+A traduce el mensaje actual o restaura el original; Alt+S cambia entre bilingüe y solo traducción. Ambos atajos se pueden cambiar en "Administrar atajos de teclado de extensiones", dentro del menú de engranaje del Administrador de complementos.

En el modo solo traducción, al pasar el puntero sobre una traducción se muestra el texto original en una descripción emergente.

## Configuración

Abra la página de configuración con el botón "Opciones" de esta extensión en el Administrador de complementos. La configuración se guarda automáticamente; cuando se ha escrito, aparece "Guardado" en la esquina superior derecha. El botón "Guía de configuración", junto a ese indicador, abre la guía de configuración.

| Sección | Contenido |
| --- | --- |
| General | Idioma de la interfaz, idioma de origen, idioma de destino, modo de visualización predeterminado, opción "Traducir automáticamente los mensajes que no estén en el idioma de destino" |
| Niveles de traducción | El servicio de cada nivel o "No se usa"; traducción precisa |
| Servicios de traducción | Servicios en dos grupos, "Añadidos" y "Disponibles"; endpoint, clave de API, modelo, temperatura y modo de razonamiento de cada servicio; botones "Probar conexión", "Añadir", "Usar este servicio" y "Quitar" |
| Diccionarios | Pares de idiomas del nivel de diccionario con tamaño, licencia y atribución; descarga y eliminación; etiqueta de versión de los paquetes (avanzado) |
| Modelos de traducción sin conexión (Bergamot) | Pares de direcciones de los modelos de Bergamot con tamaño y versión; filtro por idioma; descarga, actualización, cancelación y eliminación; las direcciones que necesitan los idiomas actuales |
| Prompts (nivel de IA) | La biblioteca de preajustes; los prompts de la visualización bilingüe, de la visualización solo de la traducción y de la traducción precisa, cada uno con "Restaurar el prompt integrado" |
| Agrupación de solicitudes | Ventana de recogida, máximo de caracteres y de párrafos por solicitud, concurrencia, reintentos, si se combinan las solicitudes de IA |
| Estilo de la traducción | Borde izquierdo, borde izquierdo discontinuo, resaltado o sin formato; color de acento, opacidad del texto, proporción del tamaño de letra; vista previa inmediata |
| Caché | Caché activada o desactivada, máximo de párrafos en caché, número actual de entradas, vaciar caché |

"Probar conexión" envía una frase de prueba con los valores que hay en ese momento en los campos. Si tiene éxito, muestra la traducción; si falla, muestra el error devuelto por el servicio, por ejemplo una clave no válida o un nombre de modelo desconocido.

## Añadir y quitar servicios

La lista lateral de la sección de servicios de traducción tiene dos grupos. "Añadidos" contiene los servicios que aparecen en las listas de servicios de la ventana emergente y de la página de configuración; "Disponibles" contiene todos los demás. Al seleccionar un servicio se muestran su configuración y sus botones:

- Un servicio que no está añadido tiene un botón "Añadir". Escribir una clave de API (en DeepLX, el endpoint) también añade el servicio.
- Un servicio añadido tiene "Usar este servicio", que lo coloca en su nivel, y "Quitar". Quitarlo lo saca de las listas y conserva su configuración, de modo que al volver a añadirlo se recuperan la clave y el modelo.
- Un servicio que usa un nivel no se puede quitar. El botón "Quitar" queda entonces desactivado y una línea debajo indica el nivel. Los servicios en uso llevan la etiqueta "En uso" en la lista lateral.

Una instalación nueva empieza con Google Translate y Microsoft Translator añadidos. El diccionario y Bergamot necesitan datos que hay que descargar, por lo que se añaden a mano. Cuando se cargan ajustes de la versión 1.1 o anterior, un servicio cuenta como añadido en estos casos:

| Servicio | Cuenta como añadido cuando |
| --- | --- |
| Google Translate, Microsoft Translator | siempre |
| DeepLX | se ha rellenado un endpoint |
| Servicios de IA que necesitan clave | hay una clave de API guardada |
| Ollama, LM Studio, personalizado compatible con OpenAI | se ha cambiado el endpoint, el modelo o la temperatura |
| los servicios de los niveles | siempre |

## Niveles de traducción

| Nivel | Servicios | Qué aporta |
| --- | --- | --- |
| 1 Diccionario | Diccionario (sin conexión) | una glosa palabra por palabra a partir de los paquetes de diccionario instalados, disponible al instante y sin red |
| 2 Traducción automática | Google Translate, Microsoft Translator, DeepLX, Bergamot (sin conexión) | una traducción completa en uno o dos segundos |
| 3 Traducción de IA | los 22 proveedores de IA | la mejor traducción, según el prompt del modo de visualización |

Cada nivel tiene un servicio o "No se usa", y al menos un nivel tiene un servicio. El valor predeterminado es Google Translate en el nivel 2 y nada más.

Cada párrafo se envía a la vez a todos los niveles en uso. Cada nivel usa la agrupación y la caché habituales. Lo que muestra el mensaje sigue una sola regla: gana el nivel más alto que ya ha respondido.

| Caso | Qué muestra el mensaje |
| --- | --- |
| Un nivel inferior responde primero | su traducción, en cursiva con una etiqueta que nombra su nivel ("Diccionario", "Traducción automática"); al pasar el puntero se indica qué nivel sigue en curso. Un nivel superior la sustituye cuando llega. |
| Responde el nivel más alto en uso | su traducción, sin etiqueta: la traducción definitiva. Los niveles inferiores que respondan después se ignoran. |
| El nivel más alto falla | se mantiene la mejor traducción inferior, marcada con "Error en Traducción de IA" (o con el nombre del nivel más alto); al pasar el puntero se muestra el motivo y al hacer clic se reintentan solo los niveles que fallaron |
| Todos los niveles fallan | el aviso rojo "Error al traducir, haga clic para reintentar" |
| La traducción del nivel más alto ya está en la caché | esa traducción, al instante; no se consulta a los niveles inferiores |

Cambiar el modo de visualización vuelve a dibujar tal cual las traducciones del diccionario y de la traducción automática. El nivel de IA usa un prompt por modo de visualización, así que se le vuelve a consultar con el prompt del nuevo modo; una traducción que ya está en la caché para ese prompt se recupera sin solicitud. La ventana emergente cuenta las traducciones definitivas como traducidas y las de niveles inferiores como provisionales.

Los ajustes guardados por la versión 1.3 o anterior se convierten una sola vez: un servicio de IA que era el servicio actual pasa al nivel 3, junto con el servicio rápido de la antigua traducción en carrera como nivel 2 si esta estaba activada; cualquier otro servicio actual pasa al nivel 2. El nivel de diccionario empieza sin usarse.

## Idioma de origen

El idioma de origen es "Detectar automáticamente" de forma predeterminada, o uno de los 20 idiomas de la lista de idiomas de destino. Se transmite a todos los servicios:

| Servicio | Detección automática | Idioma fijo |
| --- | --- | --- |
| Google Translate | `sl=auto` | `sl=<code>` |
| Microsoft Translator, gratuito y con clave | sin parámetro `from` | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (las variantes del chino como `ZH`) |
| Servicios de IA | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Diccionario | se detecta en cada párrafo | el idioma configurado |
| Bergamot | `"auto"`, con el idioma determinado por la escritura y las palabras vacías del inglés como alternativa | el idioma configurado |

Los párrafos detectados como del idioma de destino se siguen omitiendo como antes. Con un idioma de origen fijo, los párrafos cuyo idioma no se puede detectar de forma fiable se tratan como de ese idioma. Las claves de caché y los lotes contienen el idioma de origen, de modo que al cambiarlo nunca se devuelven traducciones hechas con el ajuste anterior.

## Prompts

El nivel de IA tiene tres prompts del sistema. Cada uno se puede editar en la página de configuración y restaurar con "Restaurar el prompt integrado"; un campo vacío también significa el prompt integrado. `{{to}}` se sustituye por el nombre en inglés del idioma de destino. La propia extensión añade a cada solicitud el idioma de origen y el formato del lote.

| Prompt | Se usa para | El prompt integrado pide |
| --- | --- | --- |
| Visualización bilingüe | el nivel de IA en modo bilingüe | una traducción cercana al original, frase por frase y en el mismo orden, sin añadir ni omitir nada, porque el lector la compara con el original |
| Visualización solo de la traducción | el nivel de IA en modo solo traducción | un texto fluido que se lee como un correo escrito en el idioma de destino; se pueden reordenar oraciones subordinadas y dividir o unir frases, conservando el significado completo |
| Traducción precisa | el nivel de IA mientras la traducción precisa está activada, en ambos modos de visualización | términos, nombres y formas de tratamiento coherentes en todo el mensaje, usando el glosario, el resumen y los párrafos vecinos |

Las claves de caché y las claves de lote contienen el tipo de prompt y un hash de su texto. Por eso, editar un prompt nunca devuelve traducciones hechas con el texto anterior. Un prompt del sistema personalizado guardado por la versión 1.3 o anterior pasa a ser el prompt de ambos modos de visualización; el prompt preciso empieza con su texto integrado.

### Preajustes de prompt

La biblioteca de preajustes está encima de los tres prompts en la página de configuración y en el paso 7 de la guía de configuración. Para aplicar un preajuste:

1. Elija un preajuste en "Preajuste". Si el preajuste tiene variantes, elija también una variante en "Variante".
2. Elija en "Añadir al prompt" el prompt que recibe el preajuste.
3. Haga clic en "Aplicar preajuste".

La línea "Ejemplo" muestra una frase de origen y el resultado esperado con el preajuste elegido.

| Preajuste | Variantes | Regla que se añade al prompt |
| --- | --- | --- |
| Dialecto o uso regional | según el idioma de destino: cantonés (Hong Kong) y sichuanés para el chino simplificado; cantonés (Hong Kong) y uso de Taiwán para el chino tradicional; inglés británico e inglés estadounidense; portugués de Brasil y portugués europeo; español de México y español de España; francés canadiense (Quebec); alemán estándar suizo | escribir en esa variedad, con su ortografía, su vocabulario y sus formas de tratamiento |
| Palabras difíciles con el original | ninguna | traducir con normalidad y poner el término original entre paréntesis después de cada palabra difícil o término técnico, una vez por párrafo, por ejemplo "auditoría previa (due diligence)" |
| Explicación de palabras difíciles | ninguna | traducir el párrafo y después explicar sus palabras difíciles en el idioma de destino al final del mismo párrafo, dentro de un solo corchete: 〔Nota: término: explicación; …〕 |
| Estilo de redacción | formal de negocios, coloquial, lenguaje sencillo para estudiantes, literario | usar ese registro y conservar el significado completo |

La lista de variantes depende del idioma de destino. Un idioma de destino sin variedades, como el japonés, no ofrece el preajuste "Dialecto o uso regional".

Un preajuste añade un bloque de reglas en inglés al final del prompt, tras una línea en blanco. El bloque empieza con un encabezado como `Style (this rule takes precedence over the rules above):`. Por eso prevalece sobre las reglas generales del prompt integrado, como "Do not add explanations". Volver a aplicar el mismo preajuste sustituye su bloque; los preajustes distintos se suman. El cuadro del prompt muestra el texto combinado y sigue siendo editable. "Restaurar el prompt integrado" elimina todos los añadidos.

Los preajustes mantienen una traducción por párrafo. Las explicaciones de las palabras difíciles quedan dentro de la traducción de su párrafo, y el bloque prohíbe devolverlas como párrafo o elemento de array aparte. Por eso un lote sigue volviendo como array JSON (o como segmentos numerados) con exactamente una entrada por párrafo. Las pruebas aplican los cuatro preajustes a un mismo prompt y analizan la respuesta de un modelo simulado en ambos formatos.

## Traducción precisa

La traducción precisa se aplica al nivel de IA y envía el mensaje como contexto con cada solicitud de IA. Se activa en la ventana emergente o en la sección "Niveles de traducción" de la página de configuración. Al empezar la traducción, el script de contenido une los párrafos encontrados en el texto sin formato del mensaje (cortado a los 20 000 caracteres, con una nota de que el texto continúa) y lo registra una sola vez en el script de segundo plano. El mensaje se identifica mediante un hash de su texto completo; el corte solo afecta al texto que se envía como contexto.

El flujo depende del tamaño de los párrafos que hay que traducir:

1. Si caben en una sola solicitud (dentro de "Máximo de caracteres por solicitud" y "Máximo de párrafos por solicitud"), una solicitud los traduce todos; la propia solicitud lleva el mensaje completo.
2. En caso contrario, una solicitud adicional analiza primero el mensaje completo y devuelve un resumen de dos o tres frases, un glosario de nombres, productos y otros nombres propios con la traducción que se debe usar, y el tono y la forma de tratamiento. Si esa respuesta no se puede leer, la traducción continúa sin ella.
3. Cada solicitud empieza entonces con el mismo prefijo: el prompt del sistema, el análisis y, en los mensajes de hasta unos 8000 caracteres, el texto completo. Tras el prefijo van los párrafos del lote, cada uno con el párrafo anterior y el posterior como referencia que no se traduce.

El prefijo es idéntico, carácter por carácter, en todas las solicitudes de un mensaje, de modo que los proveedores que guardan en caché los prefijos de prompt repetidos pueden servirlo desde su caché. En Anthropic el prefijo se marca con `cacheControl: { type: "ephemeral" }`. El análisis se guarda en caché igual que las traducciones, con el proveedor, el modelo, el idioma de destino y el hash del texto del mensaje como clave; los lotes de un mismo mensaje esperan a la misma solicitud de análisis.

Las traducciones hechas en modo preciso se guardan en la caché con una clave que contiene el hash del mensaje, y los lotes nunca mezclan párrafos de mensajes distintos. La misma frase en otro mensaje se traduce por tanto de nuevo, con ese mensaje como contexto. La solicitud de análisis y los prompts más largos hacen que la traducción precisa sea más cara que la traducción normal.

## Traducción con diccionario

El servicio de diccionario traduce palabra por palabra con paquetes de diccionario guardados en el perfil de Thunderbird. Una vez instalado un paquete no necesita red y responde en milisegundos, así que ocupa el tiempo hasta que responden los niveles de traducción automática y de IA. El resultado es una glosa: las palabras en el orden del original, sin gramática.

### Paquetes

Los paquetes se publican como archivos adjuntos de una versión (release) de GitHub de este repositorio, de forma predeterminada la versión `dicts-v1`. La etiqueta de versión se puede cambiar en "Etiqueta de versión de los paquetes de diccionarios (avanzado)", en la sección Diccionarios. Cada dirección es un archivo `dict-<src>-<tgt>.tsv.gz`, un archivo de texto UTF-8 comprimido con gzip:

```text
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
w	<key>	<translation>
f	<key>	<lemmaKey>
```

La primera línea describe el paquete. Las líneas que empiezan por `w` son entradas; las que empiezan por `f` asignan una forma flexionada a la clave de su lema, por ejemplo `went` a `go`. Una clave está normalizada en NFC, pasada a minúsculas con las reglas del idioma de origen y sin espacios en los extremos; puede ser una expresión de varias palabras. El índice `dict-index.json` enumera cada paquete con su tamaño, número de entradas y de formas, suma de comprobación SHA-256, fuente, licencia y atribución. Los paquetes cubren inglés, chino simplificado y tradicional, japonés, coreano, francés, alemán, español, portugués, ruso, turco y vietnamita. [docs/dictionary-packs.md](../docs/dictionary-packs.md) describe cómo se generan.

La sección Diccionarios lee el índice y muestra cada paquete con su tamaño, licencia y atribución. "Descargar" obtiene el archivo mostrando el progreso, comprueba su suma de comprobación SHA-256 y su cabecera, y lo guarda en la base de datos IndexedDB `tt-dictionary` de la extensión; "Eliminar" lo borra. Si el índice no se puede cargar, la sección indica el motivo, y los paquetes instalados se pueden seguir eliminando.

### Traducción

1. El idioma de origen es el configurado o, con la detección automática, el idioma del párrafo (escritura, detector del navegador, palabras vacías del inglés).
2. `Intl.Segmenter` divide el párrafo en palabras. En cada palabra gana la expresión más larga de hasta tres palabras que tenga una entrada y, si no la hay, la palabra sola. Una palabra sin entrada se busca a través de su lema; si eso también falla, se deja tal cual. La puntuación y los números se dejan tal cual.
3. Si el idioma de destino es el chino o el japonés, las palabras se unen sin espacios; en los demás idiomas de destino, con espacios.
4. Entre dos idiomas distintos del inglés, el texto pasa por el inglés: del francés al alemán se usan los paquetes francés → inglés e inglés → alemán.
5. Si falta un paquete necesario, el error nombra el par de idiomas y remite a la sección Diccionarios.

El script de segundo plano lee un paquete de IndexedDB la primera vez que se usa y lo mantiene en memoria; tras cinco minutos sin traducciones con diccionario libera la memoria.

### Fuentes de datos

Los paquetes se generan a partir de Wiktionary, extraído con wiktextract y publicado por kaikki.org (CC BY-SA 4.0, © colaboradores de Wiktionary), y de ECDICT de skywind3000 (licencia MIT). Cada paquete indica su propia fuente y licencia en el índice, y la página de configuración las muestra junto al paquete.

## Traducción sin conexión (Bergamot)

El servicio Bergamot traduce en su ordenador con el motor y los modelos de Firefox Translations, publicados por Mozilla bajo la licencia MPL-2.0. El motor viene incluido en la extensión; cada dirección de traducción se descarga una sola vez de Mozilla, entre 13 y 48 MB, y se guarda en la IndexedDB de la extensión. Una dirección cargada ocupa unos 200 MB de memoria y se libera tras cinco minutos sin uso. Todos los modelos tienen el inglés en uno de los lados, así que del japonés al chino se usan japonés → inglés e inglés → chino.

La sección "Modelos de traducción sin conexión (Bergamot)" de la página de configuración muestra los 114 pares de direcciones entre 58 idiomas con su tamaño y su versión, y se puede filtrar por idioma. Nombra las direcciones que necesitan el idioma de origen y el de destino actuales y las coloca al principio. Las descargas muestran su progreso y se pueden cancelar; un par instalado para el que Mozilla ofrece una versión más reciente muestra "Actualizar". Eliminar un par que necesitan los idiomas actuales pide confirmación. La instalación, la traducción y la eliminación se ejecutan en el script de segundo plano, donde reside el motor. [docs/bergamot.md](../docs/bergamot.md) describe la selección de modelos, la verificación, el almacenamiento y el motor.

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
| Diccionario (sin conexión) | Descargar pares de idiomas en la sección Diccionarios | Traducción palabra por palabra con los paquetes instalados, véase "Traducción con diccionario" |
| Bergamot (sin conexión) | Descargar pares de direcciones en la sección "Modelos de traducción sin conexión" | Traducción en su ordenador con los modelos de Mozilla, véase "Traducción sin conexión (Bergamot)" |
| Microsoft Translator (gratuito) | Ninguna | Llama a `edge.microsoft.com/translate/translatetext`, el endpoint que usa el navegador Edge; el cuerpo de la solicitud es un array de párrafos. La opción «Usar mi clave (Azure Translator)» del panel llama en su lugar a la API oficial `api.cognitive.microsofttranslator.com`: cree un recurso de Translator en el portal de Azure y copie su clave y su región desde «Claves y punto de conexión» en el panel (la región puede quedar vacía en un recurso global). |
| DeepLX | Endpoint obligatorio | Un servicio DeepLX autoalojado o de terceros; el token es opcional. Si el endpoint contiene `{{apiKey}}`, el token lo sustituye; si no, se envía como `Authorization: Bearer` |

### Proveedores de IA

Todos los proveedores de IA se llaman mediante `generateText` del Vercel AI SDK. Los proveedores con un paquete `@ai-sdk/*` oficial usan ese paquete; los demás usan `@ai-sdk/openai-compatible`. El endpoint, la clave de API, el modelo y la temperatura se pueden cambiar para cada proveedor. El campo del modelo sugiere modelos habituales y acepta también cualquier nombre de modelo.

| Proveedor | Paquete del SDK | Endpoint predeterminado | Modelo predeterminado | Requiere clave |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Sí |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Sí |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Sí |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Sí |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-4.3` | Sí |
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
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-mini-260428` | Sí |
| Azure OpenAI | `@ai-sdk/azure` | Hay que rellenarlo | `gpt-4.1-mini` | Sí |
| LM Studio (local) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | No |
| Personalizado compatible con OpenAI | `@ai-sdk/openai-compatible` | Hay que rellenarlo | Hay que rellenarlo | No |

Algunos proveedores tienen requisitos adicionales:

- Anthropic Claude: la extensión añade la cabecera `anthropic-dangerous-direct-browser-access: true`, que Anthropic exige para las solicitudes desde un contexto de navegador. La serie Claude 5 y Opus 4.7 y 4.8 rechazan una temperatura personalizada, por lo que la extensión no envía temperatura para estos modelos y el campo de temperatura del modelo predeterminado está vacío.
- Azure OpenAI: el endpoint es `https://<resource>.openai.azure.com/openai` y el campo del modelo recibe el nombre de la implementación.
- Ollama: de forma predeterminada, Ollama rechaza las solicitudes de origen cruzado procedentes de páginas de extensiones. Inicie Ollama con la variable de entorno `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: el endpoint predeterminado es el del sitio de China, `api.moonshot.cn`; las cuentas del sitio internacional usan `https://api.moonshot.ai/v1`.
- Volcengine Doubao: el campo del modelo recibe un nombre de modelo o el ID de un endpoint de inferencia creado en la consola de Ark.

### Modo de razonamiento

Cada proveedor de IA tiene un interruptor "Modo de razonamiento", desactivado de forma predeterminada. La traducción no necesita que el modelo razone antes, y el razonamiento hace las solicitudes más lentas y más caras. Varios modelos actuales razonan salvo que se indique lo contrario, por ejemplo `deepseek-flash`, `claude-haiku-5-5` y `gemini-2.5-flash`, por lo que "desactivado" se envía de forma explícita.

Cada proveedor escribe el interruptor a su manera, y dentro de un mismo proveedor solo algunos modelos lo aceptan. La extensión compara el nombre del modelo con los patrones siguientes y envía las opciones de proveedor de la primera coincidencia; un modelo sin coincidencia no recibe ningún parámetro de razonamiento. Mientras el razonamiento está activado no se envía temperatura a los modelos que coinciden con un patrón de la tabla, porque los modelos de razonamiento la ignoran o la rechazan.

| Proveedor | Modelos | Desactivado | Activado | Fuente |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` y posteriores | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
| | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | ídem |
| | `o1`, `o3`, `o4-mini` … | `"low"` (no se puede desactivar) | `"medium"` | ídem |
| Anthropic | serie Claude 5, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
| | Claude 3.7 y 4.x | nada (desactivado de forma predeterminada) | `{ type: "enabled", budgetTokens: 1024 }` | ídem |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }` (mínimo, no se puede desactivar) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
| | otros `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | ídem |
| | Gemini 3 y posteriores | `{ thinkingLevel: "low" }` (sin desactivación completa) | `{ thinkingLevel: "high" }` | ídem |
| DeepSeek | todos | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
| | `grok-4.5`, `grok-4.6`, `grok-4.7` | `"low"` (no se puede desactivar) | `"high"` | ídem |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"` con `reasoningFormat: "parsed"` | [Groq reasoning](https://console.groq.com/docs/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | ídem |
| Mistral AI | todos (el SDK solo lo envía para los modelos que lo aceptan) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | ídem |
| DeepInfra | todos (los modelos sin razonamiento lo ignoran) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | ídem |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
| | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | ídem |
| DashScope | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | todos | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | modelos que siempre razonan (`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro y 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| | todos los demás (los modelos sin razonamiento lo ignoran) | `{ enabled: false }` | `{ enabled: true }` | ídem |
| Zhipu GLM | GLM-4.5 y posteriores | `zhipu.thinking: { type: "disabled" }`; nada para GLM-5.3, que lo rechaza | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5+, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| Volcengine Doubao | modelos Seed y modelos con razonamiento | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark documentation](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio y los servicios personalizados compatibles con OpenAI no tienen ningún parámetro de razonamiento documentado en el endpoint que usa la extensión. Su interruptor está desactivado, y la página de configuración lo indica.

En las configuraciones predefinidas compatibles con OpenAI (Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao) las opciones se escriben bajo el ID de la configuración, y `@ai-sdk/openai-compatible` las copia tal cual en el cuerpo de la solicitud; `reasoningEffort` es la única clave que renombra, a `reasoning_effort`.

## Funcionamiento de la agrupación

Un mensaje suele tener entre diez y unas pocas decenas de párrafos. Con una solicitud por párrafo, cada párrafo lleva su propia copia del prompt del sistema y de las instrucciones, y cada párrafo consume una solicitud del límite de frecuencia. La agrupación combina en una sola solicitud los párrafos que llegan con poca separación, de modo que ambos costes se pagan por lote y no por párrafo.

### Flujo

1. El script de contenido entrega al script de segundo plano cada párrafo que hay que traducir, una sola vez para todos los niveles en uso.
2. Para cada nivel, el script de segundo plano consulta primero la caché y, si encuentra el párrafo, responde directamente. La clave de la caché se compone del proveedor, el modelo, el idioma de origen y el de destino, en los servicios de IA el tipo de prompt y un hash de su texto, en modo preciso el hash del mensaje, y un hash del texto del párrafo. Si el mismo texto ya se está traduciendo, las solicitudes posteriores comparten el mismo resultado.
3. Los párrafos que no están en la caché entran en la cola de lotes, agrupados por proveedor + modelo + endpoint + idioma de origen + idioma de destino; los servicios de IA se agrupan además por prompt, Microsoft Translator por modo gratuito o con clave, y en modo preciso también por mensaje. Los párrafos de un grupo se acumulan durante 50 ms. Un grupo se envía cuando termina la ventana, cuando se alcanza el límite de párrafos o cuando el siguiente párrafo superaría el límite de caracteres. Un párrafo que por sí solo supera el límite de caracteres forma su propio lote.
4. La cola de solicitudes ejecuta cada lote. Limita la concurrencia y reintenta los errores 408, 429, 5xx y de red con espera exponencial; si el servidor envía `Retry-After`, espera ese tiempo, con un máximo de 30 segundos. Los errores como 401 y 400 se notifican sin reintentar.
5. Los resultados pasan a la caché en memoria y se escriben en `storage.local` en una sola escritura al cabo de 1 segundo. La caché descarta primero las entradas usadas menos recientemente (LRU, least recently used).

### Cómo combina los párrafos cada servicio

- Diccionario y Bergamot: todo el lote se traduce en una sola llamada local.
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
- El texto del mensaje se envía solo a los servicios de los niveles en uso. El diccionario y Bergamot traducen en su ordenador y no envían texto a ningún sitio. La página de configuración y la guía de configuración leen la lista de paquetes de diccionario de las versiones (releases) de GitHub de este repositorio y la lista de modelos de Bergamot de Mozilla; los paquetes y los modelos en sí solo se descargan cuando hace clic en "Descargar". Ninguna de estas solicitudes lleva texto de mensajes. La extensión no recopila estadísticas ni contacta con ninguna otra dirección de red.
- La caché de traducciones se guarda localmente y se puede desactivar o vaciar en la página de configuración.
- Con Google, Microsoft, DeepLX o un servicio de IA en línea, el texto del mensaje sale de su ordenador. Para el correo confidencial, use solo el diccionario, Bergamot y modelos de IA locales como Ollama o LM Studio, que mantienen todas las solicitudes en su propio equipo.

## Limitaciones conocidas

- Las traducciones son texto sin formato. Los enlaces, la negrita y el resto del formato en línea del original no se conservan en la traducción. En el modo bilingüe el original sigue siendo plenamente utilizable; en el modo solo traducción puede pasar el puntero por encima para ver el original o volver al modo bilingüe.
- Los endpoints gratuitos de Google y Microsoft no están documentados y pueden cambiar o tener limitaciones de frecuencia. Microsoft retiró el endpoint del token `edge.microsoft.com/translate/auth` en julio de 2026; la extensión usa solo el endpoint directo.
- Para decidir si un párrafo ya está en el idioma de destino, el chino, el japonés, el coreano y escrituras similares se evalúan por clase de carácter, y los idiomas de escritura latina y cirílica usan primero `i18n.detectLanguage` de la API de extensiones. Cuando esa API no está disponible o su resultado no es fiable, solo el inglés se detecta de forma fiable; los párrafos en otros idiomas de escritura latina se envían a traducir de la forma habitual.
- El script de contenido se registra mediante `messageDisplayScripts` y solo llega a los mensajes abiertos después del registro. Al iniciarse, la extensión intenta inyectarlo en los mensajes ya abiertos; si eso falla, basta con volver a seleccionar el mensaje.
- Los mensajes de error que produce la extensión están traducidos. Los textos de error devueltos por un servicio de traducción o por el AI SDK (por ejemplo, el cuerpo de una respuesta HTTP 401) se muestran tal como se reciben, normalmente en inglés.
- El nombre de la extensión, su descripción en el Administrador de complementos y las descripciones de los atajos siguen el idioma de la interfaz de Thunderbird, no la opción de idioma de la interfaz.
- La traducción precisa identifica un mensaje mediante un hash de su texto, porque el script de contenido no tiene acceso al ID del mensaje. Dos copias del mismo texto comparten sus traducciones y su análisis.
- El almacenamiento en caché de prompts depende del proveedor. Anthropic solo guarda en caché los prefijos que superan una longitud mínima que depende del modelo; los prefijos más cortos se envían y se facturan de forma normal.
- El interruptor de razonamiento funciona comparando nombres de modelo. Un modelo nuevo cuyo nombre no coincide con ningún patrón no recibe ningún parámetro de razonamiento hasta que se amplíe la tabla de `src/background/providers/thinking.ts`.
- Cada nivel en uso envía sus propias solicitudes. Con el nivel de IA y el de traducción automática en uso a la vez, cada mensaje cuesta también solicitudes al traductor automático, que cuentan para los límites de frecuencia de los endpoints gratuitos de Google y Microsoft.
- La traducción con diccionario es una glosa palabra por palabra: conserva el orden de las palabras del original y no flexiona. Las palabras que no están en los paquetes quedan sin traducir.
- El mensaje de ejemplo de la guía de configuración está en inglés, o en alemán cuando el idioma de destino es el inglés. Con un idioma de origen fijo distinto de esos dos, la prueba envía igualmente ese idioma de origen junto con el texto en inglés.
- Si se pulsa Alt+A mientras la guía de configuración es la pestaña activa, se traduce o se restaura el mensaje de ejemplo. La etiqueta del botón de prueba no sigue ese cambio.
- Los preajustes son instrucciones para el modelo. Hasta qué punto se respeta un dialecto o un estilo depende del modelo; los modelos pequeños mezclan variedades regionales con más frecuencia.
- Bergamot y el diccionario traducen un lote con un solo idioma de origen. Con la detección automática, Bergamot detecta el idioma del lote completo, de modo que un lote que mezcla idiomas se traduce como si estuviera en el idioma predominante.

## Pruebas

```bash
npm test               # vitest unit tests
npm run test:coverage  # unit tests with coverage; fails below the thresholds in vitest.config.ts
npm run e2e            # headless Thunderbird (THUNDERBIRD_BIN) against a local mock server: three tiers, mode switch, restore
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules, with and without a source language
```

Las pruebas unitarias cubren la agrupación en lotes y las colas, el análisis de la salida de IA y la alternativa de reserva, la detección de párrafos con el dibujado y la restauración en modo bilingüe y solo traducción (en jsdom), la construcción de solicitudes y el análisis de respuestas de Google, Microsoft y DeepLX (con un fetch simulado), la URL de solicitud y las cabeceras de autenticación de cada configuración predefinida de IA, los parámetros de razonamiento de cada proveedor, la migración de los ajustes a servicios añadidos y a niveles y prompts, las listas de niveles de la ventana emergente y de la página de configuración, el rechazo de que todos los niveles queden vacíos y la protección contra la eliminación, los niveles (nivel inferior primero y después sustituido, nivel más alto primero con los resultados inferiores posteriores ignorados, fallo del nivel más alto con el resultado inferior conservado, fallo de todos los niveles, niveles sin usar, nivel más alto en caché), la selección de prompts y las claves de caché, un cambio del modo de visualización que vuelve a consultar al nivel de IA y solo vuelve a dibujar los demás, el idioma de origen en las solicitudes de cada servicio y en la clave de caché, los paquetes de diccionario (análisis, división en palabras y coincidencia de expresiones, formas flexionadas, traducción a través del inglés, paquetes que faltan, descarga con suma de comprobación, con una IndexedDB en memoria), el servicio Bergamot y su gestión de modelos con un motor simulado, la traducción precisa (solicitud única, análisis con lotes, análisis fallido, claves de caché y lotes por mensaje, prefijo de prompt idéntico con el control de caché de Anthropic), la guía de configuración (apertura solo en una instalación nueva, navegación entre pasos con pasos omitidos y continuación, guardado de cada paso, paquetes de diccionario y direcciones de Bergamot recomendados y su descarga, configuración de los servicios y prueba de conexión, preajustes en los prompts, traducción de prueba a través de los módulos del script de contenido), los preajustes de prompt (variantes según el idioma de destino, combinación con cada uno de los tres prompts, sustitución del mismo preajuste, análisis de lotes con todos los preajustes aplicados), y la localización: conjuntos de claves y marcadores idénticos en todos los idiomas, cada referencia `__MSG_*__` del manifiesto, la asignación de los idiomas de Thunderbird a los idiomas admitidos, el recurso al inglés para las claves que faltan y la ausencia de texto de interfaz escrito directamente en las páginas HTML y en el código fuente.

`npm run build:debug` genera un xpi de depuración que empieza a traducir en cuanto se abre un mensaje y escribe el progreso en la consola, para comprobar el flujo completo en un Thunderbird real.

## Estructura del proyecto

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators, dictionary, offline model management
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page and the parts the setup guide shares: service fields, dictionary and Bergamot lists, prompt editor, settings session
  welcome/       setup guide: steps and navigation
  offline/       Bergamot engine module: model list, download, storage, worker
  shared/        shared settings, provider presets, prompts, language table and detection, message types, i18n runtime
  e2e/           hooks of the e2e test build (left out of every other build)
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, Bergamot engine download, locale generation and checks, live endpoint test
vendor/          Bergamot engine glue script (bergamot-translator.js)
tools/           dict-build: the pipeline that builds the dictionary packs
readmes/         translated versions of this README
docs/            developer notes on Bergamot and the dictionary packs, demo GIF used in this README
tests/           vitest tests
e2e/             end-to-end test in a real Thunderbird: runner, mock server, fixture messages
.github/         workflows: build and release, dictionary packs
```

## Traducir la interfaz

Los textos de la interfaz están en `locales/<language>.json`, un objeto plano clave → texto por idioma. `locales/en.json` es la referencia: todos los demás archivos tienen exactamente las mismas claves. De `$1` a `$9` son sustituciones y deben aparecer en cada traducción con los mismos números que en inglés; `{{apiKey}}` y `{{to}}` son marcadores literales y no se modifican. Los nombres de productos como Google Translate, OpenAI o DeepLX no se traducen.

`npm run build` convierte estos archivos en `dist/_locales/<language>/messages.json`, el formato que lee Thunderbird. El propio entorno de i18n de la extensión carga los mismos archivos en tiempo de ejecución, por lo que el idioma de la interfaz puede cambiar sin reiniciar Thunderbird. Las claves que faltan recurren al inglés.

Para añadir un idioma, cree `locales/<code>.json` con todas las claves, añada el código a `SUPPORTED_LOCALES` en `src/shared/locales.ts` junto con su nombre nativo y ejecute `npm run locales:check` y `npm test`.

## Agradecimientos

El diseño de la detección de párrafos, la cola de lotes, los prompts y la configuración de los proveedores sigue a [Read Frog](https://github.com/mengxi-ream/read-frog), una extensión de navegador para traducir páginas web publicada bajo la licencia GPL-3.0. Este proyecto traslada esas ideas al lector de mensajes de Thunderbird y las adapta al correo electrónico, por ejemplo dividiendo el correo de texto sin formato en las líneas en blanco y uniendo las líneas cortadas con saltos de línea fijos.

Los datos de los diccionarios proceden de [Wiktionary](https://en.wiktionary.org/) (© colaboradores de Wiktionary, CC BY-SA 4.0), extraídos con [wiktextract](https://github.com/tatuylonen/wiktextract) y publicados por [kaikki.org](https://kaikki.org/), y de [ECDICT](https://github.com/skywind3000/ECDICT) de skywind3000 (licencia MIT). La traducción sin conexión usa el motor [Bergamot](https://browser.mt/) y los modelos de traducción de Firefox Translations, publicados por Mozilla bajo la licencia MPL-2.0.

## Licencia

GPL-3.0-or-later. Consulte [LICENSE](../LICENSE) para leer el texto completo.
