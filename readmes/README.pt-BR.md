# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Português (Brasil) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

O Thunderbird Translate é uma extensão do Thunderbird que traduz o corpo da mensagem que você está lendo, diretamente no painel de mensagens. A tradução pode aparecer abaixo de cada parágrafo original (modo bilíngue) ou substituí-lo (modo só tradução). Ao desativar a tradução, a mensagem original é restaurada exatamente como era. O Google Tradutor (gratuito) é o serviço padrão e funciona logo após a instalação. Também é possível conectar 22 provedores de IA, entre eles OpenAI, Claude, Gemini, DeepSeek e Qwen.

Este documento foi escrito para quem nunca usou uma extensão do Thunderbird. Ele segue a ordem: instalação, uso, configuração e funcionamento interno.

![Demonstração: traduzir uma mensagem, alternar entre bilíngue e somente tradução, trocar o idioma de destino](../docs/demo.gif)

## Recursos

- Tradução do corpo: a extensão encontra o conteúdo em nível de parágrafo no corpo da mensagem: parágrafos, itens de lista, células de tabela, títulos, citações em bloco, divs que contêm apenas texto e, em mensagens de texto simples, parágrafos separados por linhas em branco. Código, parágrafos que já estão no idioma de destino, números, links soltos e espaços em branco são ignorados.
- Dois modos de exibição: o modo bilíngue insere abaixo do original um bloco de tradução com uma borda esquerda clara, legível também em temas escuros. O modo só tradução substitui o original pela tradução; o original fica guardado na memória e volta ao lugar quando a tradução é desativada.
- Atualização imediata: mudar o modo de exibição ou o idioma de destino enquanto uma mensagem está traduzida redesenha a página sem reabrir a mensagem. Mudar o modo de exibição redesenha a partir das traduções já recebidas e não envia novas requisições.
- Pontos de acesso: o botão "Traduzir mensagem" na barra de ferramentas do cabeçalho da mensagem, com seu pop-up, e os atalhos Alt+A (traduzir / mostrar original) e Alt+S (alternar bilíngue / só tradução).
- Tradução automática opcional: mensagens que não estão no idioma de destino são traduzidas assim que são abertas.
- Agrupamento de requisições: o script em segundo plano reúne parágrafos durante 50 ms e os junta em uma única requisição, com limite de concorrência, novas tentativas com espera exponencial (exponential backoff) e cache local.
- Serviços: 3 serviços de tradução gratuitos ou auto-hospedados e 22 predefinições de provedores de IA, uma das quais é "Compatível com OpenAI (personalizado)". Apenas os serviços que você adicionou aparecem nas listas de serviços.
- Tradução em corrida (serviços de IA): um tradutor gratuito responde primeiro e seu resultado é exibido como tradução provisória até que a tradução por IA o substitua.
- Tradução precisa (serviços de IA): a mensagem inteira serve de contexto para cada requisição, de modo que nomes, termos e formas de tratamento permanecem consistentes entre os parágrafos.
- Chave de modo de raciocínio para cada provedor de IA, desativada por padrão.
- Interface em 12 idiomas. Por padrão, o idioma da interface segue o Thunderbird e pode ser escolhido na página de configurações.

## Instalação

### A partir das Releases

1. Baixe o arquivo `thunderbird-translate-<version>.xpi` mais recente na página Releases deste repositório.
2. No Thunderbird, abra Ferramentas → Extensões e temas (também acessível pelo menu ≡ no canto superior direito).
3. Clique no ícone de engrenagem acima da lista de extensões, escolha "Instalar extensão de arquivo", selecione o arquivo xpi baixado e confirme.

É necessário o Thunderbird 128 ou posterior.

### Compilar a partir do código-fonte

É necessário o Node.js 22 ou posterior (o desenvolvimento usa Node 24 e npm 11).

```bash
npm ci
npm test
npm run build
```

`npm run build` empacota com o esbuild o script em segundo plano, o script de conteúdo, o pop-up e a página de configurações em `dist/`, gera `dist/_locales/<language>/messages.json` a partir dos arquivos em `locales/` e compacta `dist/` em `web-ext-artifacts/thunderbird-translate-<version>.xpi`. A compactação usa a biblioteca fflate, escrita em JavaScript puro, e não precisa do comando zip do sistema.

Durante o desenvolvimento, é possível carregar a extensão sem empacotá-la: no Thunderbird, abra Ferramentas → Ferramentas de desenvolvimento → Depurar extensões, clique em "Carregar extensão temporária" e selecione `dist/manifest.json`.

## Uso

Abra uma mensagem. Um botão "Traduzir mensagem" aparece na barra de ferramentas do cabeçalho da mensagem. Ao clicar nele, abre-se um pop-up com estes controles:

- "Traduzir esta mensagem": inicia a tradução. Enquanto uma tradução está em andamento ou sendo exibida, o botão passa a mostrar "Mostrar original" e, ao ser clicado, restaura o original.
- Exibição: alterna entre bilíngue e só tradução; a mudança vale imediatamente para a mensagem atual.
- Idioma de destino: depois de uma mudança, uma mensagem em tradução é traduzida de novo para o novo idioma.
- Serviço de tradução: seleciona o serviço em uso. A lista contém apenas os serviços adicionados. "+ Adicionar serviço de tradução", abaixo dela, abre a página de configurações na seção de serviços de tradução.
- Tradução em corrida e Tradução precisa: aparecem enquanto o serviço atual é um serviço de IA; ativam ou desativam os dois modos de tradução por IA.
- Traduzir automaticamente mensagens que não estão no idioma de destino: quando marcada, uma mensagem cujo corpo não está no idioma de destino é traduzida assim que é aberta.

O pop-up mostra o progresso, por exemplo "8 de 12 traduzidos". Com a tradução em corrida, os parágrafos que ainda mostram a tradução provisória rápida são contados à parte, por exemplo "7 de 9 traduzidos (2 provisórios)". Quando um parágrafo falha, aparece depois dele o aviso vermelho "Falha na tradução, clique para tentar novamente"; ao passar o mouse sobre ele, o erro é exibido, e ao clicar, aquele parágrafo é traduzido de novo.

Alt+A traduz a mensagem atual ou restaura o original; Alt+S alterna entre bilíngue e só tradução. Os dois atalhos podem ser alterados em "Gerenciar atalhos de extensões", no menu de engrenagem do Gerenciador de extensões.

No modo só tradução, passar o mouse sobre uma tradução mostra o texto original em uma dica de ferramenta.

## Configurações

Abra a página de configurações pelo botão "Opções" desta extensão no Gerenciador de extensões. As configurações são salvas automaticamente; "Salvo" aparece no canto superior direito assim que elas são gravadas.

| Seção | Conteúdo |
| --- | --- |
| Geral | Idioma da interface, idioma de destino, modo de exibição padrão, serviço atual, tradução automática |
| Serviços de tradução | Serviços em dois grupos, "Adicionados" e "Disponíveis"; endpoint, chave de API, modelo, temperatura e modo de raciocínio de cada serviço; botões "Testar conexão", "Adicionar", "Usar este serviço" e "Remover" |
| Modos de tradução por IA | Tradução em corrida com a escolha do serviço rápido; tradução precisa |
| Prompt de sistema | Prompt de sistema personalizado para os serviços de IA; `{{to}}` é substituído pelo nome do idioma de destino; vazio significa usar o prompt embutido |
| Agrupamento de requisições | Janela de coleta, máximo de caracteres e de parágrafos por requisição, concorrência, novas tentativas, juntar ou não as requisições de IA |
| Estilo da tradução | Borda esquerda, borda esquerda tracejada, destaque ou simples; cor de destaque, opacidade do texto, proporção do tamanho da fonte; pré-visualização ao vivo |
| Cache | Cache ativado ou desativado, máximo de parágrafos em cache, número atual de entradas, limpar cache |

"Testar conexão" envia uma frase de teste com os valores que estão nos campos naquele momento. Em caso de sucesso, mostra a tradução; em caso de falha, mostra o erro retornado pelo serviço, por exemplo uma chave inválida ou um nome de modelo desconhecido.

## Adicionar e remover serviços

A lista lateral da seção de serviços de tradução tem dois grupos. "Adicionados" reúne os serviços que aparecem nas listas de serviços do pop-up e da página de configurações; "Disponíveis" reúne todos os demais. Ao selecionar um serviço, aparecem sua configuração e seus botões:

- Um serviço que não foi adicionado tem o botão "Adicionar". Digitar uma chave de API (no DeepLX, o endpoint) também adiciona o serviço.
- Um serviço adicionado tem "Usar este serviço" e "Remover". Remover tira o serviço das listas e mantém sua configuração; ao adicioná-lo de novo, a chave e o modelo voltam.
- O serviço atual não pode ser removido, e o serviço rápido da tradução em corrida também não, enquanto ela estiver ativada. O botão "Remover" fica então desativado, e uma linha abaixo dele informa o motivo.

Uma instalação nova começa com o Google Tradutor e o Microsoft Translator adicionados. Quando as configurações da versão 1.1 ou anterior são carregadas, um serviço conta como adicionado nestes casos:

| Serviço | Conta como adicionado quando |
| --- | --- |
| Google Tradutor, Microsoft Translator | sempre |
| DeepLX | um endpoint foi preenchido |
| Serviços de IA que exigem chave | uma chave de API foi salva |
| Ollama, LM Studio, compatível com OpenAI (personalizado) | o endpoint, o modelo ou a temperatura foi alterado |
| o serviço atual | sempre |

## Modos de tradução por IA

Os dois modos valem apenas enquanto o serviço atual é um serviço de IA. Podem ser ativados na seção "Modos de tradução por IA" da página de configurações ou no pop-up.

### Tradução em corrida

Cada parágrafo vai ao serviço de IA e a um serviço rápido (por padrão o Google Tradutor; o Microsoft Translator ou o DeepLX podem ser escolhidos entre os serviços adicionados). As duas requisições usam o agrupamento e o cache normais. O resultado depende de qual resposta chega primeiro:

| Caso | O que a mensagem mostra |
| --- | --- |
| O serviço rápido responde primeiro | a tradução dele, em itálico e com a etiqueta "Provisória"; ao passar o mouse, uma dica explica que a tradução por IA está em andamento. A tradução por IA a substitui quando chega. |
| O serviço de IA responde primeiro | a tradução por IA; o resultado do serviço rápido é descartado |
| A requisição de IA falha | a tradução rápida permanece, marcada com "Falha na tradução por IA"; ao passar o mouse, o motivo é exibido, e ao clicar, o parágrafo é traduzido de novo |
| A tradução por IA já está no cache | a tradução por IA em cache; o serviço rápido não é consultado |

Trocar o modo de exibição mantém as marcas de provisório e de falha, e "Mostrar original" remove essas marcas junto com as traduções. A tradução em corrida não gasta tokens de IA adicionais, mas dobra o número de requisições ao serviço rápido.

### Tradução precisa

A tradução precisa envia a mensagem como contexto em cada requisição de IA. Quando a tradução começa, o script de conteúdo junta os parágrafos encontrados no texto simples da mensagem (cortado após 20000 caracteres, com um aviso de que o texto continua) e o registra uma única vez no script em segundo plano. A mensagem é identificada por um hash do seu texto completo; o corte vale apenas para o texto enviado como contexto.

O fluxo depende do tamanho dos parágrafos a traduzir:

1. Se eles cabem em uma única requisição (dentro de "Máximo de caracteres por requisição" e "Máximo de parágrafos por requisição"), uma requisição traduz todos; a própria requisição leva a mensagem inteira.
2. Caso contrário, uma requisição extra analisa primeiro a mensagem inteira e devolve um resumo de duas a três frases, um glossário de nomes, produtos e outros nomes próprios com a tradução a usar, e o tom e a forma de tratamento. Se essa resposta não puder ser lida, a tradução continua sem ela.
3. Cada requisição começa então com o mesmo prefixo: o prompt de sistema, a análise e, para mensagens de até cerca de 8000 caracteres, o texto completo. Depois do prefixo vêm os parágrafos do lote, cada um com o parágrafo anterior e o seguinte como referência, que não são traduzidos.

O prefixo é idêntico, caractere por caractere, em todas as requisições de uma mensagem, por isso os provedores que guardam em cache prefixos de prompt repetidos podem atendê-lo a partir do cache deles. Para a Anthropic, o prefixo é marcado com `cacheControl: { type: "ephemeral" }`. A análise é guardada em cache como as traduções, com uma chave formada por provedor, modelo, idioma de destino e hash do texto da mensagem; os lotes de uma mesma mensagem esperam pela mesma requisição de análise.

As traduções feitas no modo preciso são guardadas em cache com uma chave que contém o hash da mensagem, e os lotes nunca misturam parágrafos de mensagens diferentes. A mesma frase em outra mensagem é, portanto, traduzida de novo, com aquela mensagem como contexto. A requisição de análise e os prompts mais longos tornam a tradução precisa mais cara que a tradução normal.

## Idioma da interface

A opção "Idioma da interface", na seção Geral, aceita dois tipos de valor:

- "Seguir o Thunderbird" (padrão): a extensão usa o idioma suportado mais próximo do idioma da interface do próprio Thunderbird. O rótulo da opção mostra o idioma escolhido no momento, por exemplo "Seguir o Thunderbird (Deutsch)".
- Um dos 12 idiomas suportados: a extensão usa esse idioma independentemente do idioma do Thunderbird.

A escolha vale para o pop-up, a página de configurações, os rótulos dentro das mensagens ("Traduzindo…", "Falha na tradução, clique para tentar novamente"), as mensagens de erro, o resultado do teste de conexão e a dica do botão da barra de ferramentas. Uma página de configurações ou um pop-up abertos trocam o texto na hora. Os rótulos dentro de uma mensagem já traduzida mudam na próxima vez em que forem desenhados.

Alguns textos são lidos pelo próprio Thunderbird a partir do manifesto da extensão e sempre seguem o idioma da interface do Thunderbird: o nome e a descrição da extensão no Gerenciador de extensões e as descrições dos atalhos em "Gerenciar atalhos de extensões". A página de configurações informa isso abaixo da opção.

"Seguir o Thunderbird" mapeia o idioma do Thunderbird da seguinte forma:

| Idioma do Thunderbird | Idioma da interface usado |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Chinês tradicional |
| outros `zh-*` | Chinês simplificado |
| `pt-*` | Português (Brasil) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | o idioma com a mesma subtag primária |
| qualquer outro idioma | Inglês |

A lista de idiomas de destino mostra o nome de cada idioma no idioma da interface, seguido do nome do idioma nele mesmo, por exemplo "japonês (日本語)". Os prompts enviados aos serviços de IA usam sempre o nome do idioma em inglês, porque os modelos seguem instruções em inglês com mais confiabilidade.

Na primeira instalação, o idioma de destino é definido a partir do idioma da interface: um Thunderbird em japonês começa com japonês como idioma de destino, um Thunderbird em inglês começa com inglês. Um idioma de destino já existente nunca é sobrescrito.

## Idiomas de interface suportados

| Código | Idioma |
| --- | --- |
| `en` | English |
| `zh_CN` | 简体中文 (chinês simplificado) |
| `zh_TW` | 繁體中文 (chinês tradicional) |
| `ja` | 日本語 (japonês) |
| `ko` | 한국어 (coreano) |
| `fr` | Français (francês) |
| `de` | Deutsch (alemão) |
| `es` | Español (espanhol) |
| `pt_BR` | Português (Brasil) (português do Brasil) |
| `ru` | Русский (russo) |
| `tr` | Türkçe (turco) |
| `vi` | Tiếng Việt (vietnamita) |

A lista de idiomas de destino é separada e contém 20 idiomas, entre eles italiano, ucraniano, polonês, neerlandês, tailandês, indonésio, árabe e hindi.

## Configuração dos provedores

### Serviços gratuitos e auto-hospedados

| Serviço | Configuração | Observações |
| --- | --- | --- |
| Google Tradutor (gratuito, padrão) | Nenhuma | Chama o endpoint `client=gtx` de `translate.googleapis.com`; um único POST leva vários parâmetros `q`, de modo que vários parágrafos compartilham uma requisição |
| Microsoft Translator (gratuito) | Nenhuma | Primeiro tenta obter um token em `edge.microsoft.com/translate/auth` e chamar `api-edge.cognitive.microsofttranslator.com`; quando a Microsoft desativou o endpoint de token, passa a usar `edge.microsoft.com/translate/translatetext`. As duas rotas aceitam arrays nativamente. A opção “Usar minha chave (Azure Translator)” do painel chama, em vez disso, a API oficial `api.cognitive.microsofttranslator.com`: crie um recurso do Translator no portal do Azure e copie a chave e a região de “Chaves e Ponto de Extremidade” para o painel (a região pode ficar vazia em um recurso global). |
| DeepLX | Endpoint obrigatório | Um serviço DeepLX auto-hospedado ou de terceiros; o token é opcional. Se o endpoint contiver `{{apiKey}}`, o token o substitui; caso contrário, é enviado como `Authorization: Bearer` |

### Provedores de IA

Todos os provedores de IA são chamados por meio de `generateText` do Vercel AI SDK. Os provedores que têm um pacote oficial `@ai-sdk/*` usam esse pacote; os demais usam `@ai-sdk/openai-compatible`. Endpoint, chave de API, modelo e temperatura podem ser alterados para cada provedor. O campo de modelo sugere modelos comuns e também aceita qualquer nome de modelo.

| Provedor | Pacote do SDK | Endpoint padrão | Modelo padrão | Exige chave |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Sim |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Sim |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Sim |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Sim |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | Sim |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Sim |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Sim |
| Ollama (local) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | Não |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Sim |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Sim |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Sim |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Sim |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Sim |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Sim |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Sim |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Sim |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Sim |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Sim |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | Sim |
| Azure OpenAI | `@ai-sdk/azure` | Preenchimento obrigatório | `gpt-4.1-mini` | Sim |
| LM Studio (local) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | Não |
| Compatível com OpenAI (personalizado) | `@ai-sdk/openai-compatible` | Preenchimento obrigatório | Preenchimento obrigatório | Não |

Alguns provedores têm requisitos adicionais:

- Anthropic Claude: a extensão adiciona o cabeçalho `anthropic-dangerous-direct-browser-access: true`, que a Anthropic exige para requisições feitas a partir de um contexto de navegador. A série Claude 5 e os modelos Opus 4.7 e 4.8 rejeitam uma temperatura personalizada, por isso a extensão não envia temperatura para esses modelos, e o campo de temperatura do modelo padrão fica vazio.
- Azure OpenAI: o endpoint é `https://<recurso>.openai.azure.com/openai`, e o campo de modelo recebe o nome da implantação.
- Ollama: por padrão, o Ollama rejeita requisições de origem cruzada vindas de páginas de extensões. Inicie o Ollama com a variável de ambiente `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: o endpoint padrão é o do site da China, `api.moonshot.cn`; contas do site internacional usam `https://api.moonshot.ai/v1`.
- Volcengine Doubao: o campo de modelo recebe um nome de modelo ou o ID de um endpoint de inferência criado no console do Ark.

### Modo de raciocínio

Cada provedor de IA tem uma chave "Modo de raciocínio", desativada por padrão. A tradução não exige que o modelo raciocine antes, e o raciocínio deixa as requisições mais lentas e mais caras. Vários modelos atuais raciocinam se nada for indicado, por exemplo `deepseek-flash`, `claude-haiku-5-5` e `gemini-2.5-flash`, por isso o valor "desativado" é enviado de forma explícita.

Cada provedor escreve essa chave de um jeito, e dentro de um mesmo provedor só alguns modelos a aceitam. A extensão compara o nome do modelo com os padrões abaixo e envia as opções do provedor do primeiro que coincidir; um modelo sem correspondência não recebe parâmetro de raciocínio. Com o raciocínio ativado, nenhuma temperatura é enviada aos modelos que coincidem com um padrão da tabela, porque os modelos de raciocínio a ignoram ou a rejeitam.

| Provedor | Modelos | Desativado | Ativado | Fonte |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` e posteriores | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
|  | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | mesma fonte |
|  | `o1`, `o3`, `o4-mini` … | `"low"` (não pode ser desativado) | `"medium"` | mesma fonte |
| Anthropic | série Claude 5, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
|  | Claude 3.7 e 4.x | nada (desativado por padrão) | `{ type: "enabled", budgetTokens: 1024 }` | mesma fonte |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }` (mínimo, não pode ser desativado) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
|  | demais `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | mesma fonte |
|  | Gemini 3 e posteriores | `{ thinkingLevel: "low" }` (sem desativação total) | `{ thinkingLevel: "high" }` | mesma fonte |
| DeepSeek | todos | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
|  | `grok-3-mini` | `"low"` | `"high"` | mesma fonte |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"` com `reasoningFormat: "parsed"` | [Groq reasoning](https://console.groq.com/docs/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | mesma fonte |
| Mistral AI | todos (o SDK só envia o parâmetro para modelos que o aceitam) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | mesma fonte |
| DeepInfra | todos (ignorado por modelos sem raciocínio) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | mesma fonte |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
|  | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | mesma fonte |
| DashScope | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | todos | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | modelos que sempre raciocinam (`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro e 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
|  | todos os outros (ignorado por modelos sem raciocínio) | `{ enabled: false }` | `{ enabled: true }` | mesma fonte |
| Zhipu GLM | GLM-4.5 e posteriores | `zhipu.thinking: { type: "disabled" }`; nada para o GLM-5.3, que o rejeita | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5+, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| Volcengine Doubao | modelos Seed e modelos de raciocínio | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark documentation](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio e os serviços compatíveis com OpenAI (personalizados) não têm parâmetro de raciocínio documentado no endpoint que a extensão usa. A chave deles fica desativada, e a página de configurações informa isso.

Nas predefinições compatíveis com OpenAI (Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao), as opções são gravadas sob o ID da predefinição, e o `@ai-sdk/openai-compatible` as copia no corpo da requisição como estão; `reasoningEffort` é a única chave que ele renomeia, para `reasoning_effort`.

## Como funciona o agrupamento

Uma mensagem costuma ter entre dez e algumas dezenas de parágrafos. Com uma requisição por parágrafo, cada parágrafo leva sua própria cópia do prompt de sistema e das instruções, e cada parágrafo consome uma requisição do limite de taxa. O agrupamento junta em uma única requisição os parágrafos que chegam próximos no tempo, de modo que os dois custos passam a ser pagos por lote, e não por parágrafo.

### Fluxo

1. O script de conteúdo entrega ao script em segundo plano cada parágrafo a ser traduzido.
2. O script em segundo plano consulta primeiro o cache e, em caso de acerto, responde diretamente. A chave do cache é formada pelo provedor, pelo modelo, pelo idioma de destino, por uma assinatura do prompt de sistema, no modo preciso pelo hash da mensagem, e por um hash do texto do parágrafo. Quando o mesmo texto já está sendo traduzido, as requisições seguintes compartilham o mesmo resultado.
3. Os parágrafos que não estão no cache entram na fila de lotes, agrupados por provedor + modelo + endpoint + idioma de destino; os serviços de IA também por prompt de sistema, o Microsoft Translator também por modo gratuito ou com chave e, no modo preciso, também por mensagem. Os parágrafos de um grupo se acumulam durante 50 ms. Um grupo é enviado quando a janela termina, quando o limite de parágrafos é atingido ou quando o próximo parágrafo ultrapassaria o limite de caracteres. Um parágrafo sozinho mais longo que o limite de caracteres forma um lote próprio.
4. A fila de requisições executa cada lote. Ela limita a concorrência e repete, com espera exponencial, as requisições que falham com 408, 429, 5xx ou erros de rede; quando o servidor envia `Retry-After`, espera esse tempo, no máximo 30 segundos. Erros como 401 e 400 são informados sem novas tentativas.
5. Os resultados vão para o cache em memória e são gravados em `storage.local` de uma só vez após 1 segundo. O cache descarta as entradas usadas há mais tempo (LRU, least recently used).

### Como cada serviço junta os parágrafos

- Google: um único POST com vários parâmetros `q`; o array retornado corresponde à entrada um a um.
- Microsoft: o próprio corpo da requisição é um array.
- DeepLX: o endpoint aceita um parágrafo por requisição, por isso os parágrafos de um lote são solicitados de forma simultânea.
- Provedores de IA: os parágrafos são numerados e colocados em uma única mensagem, e o modelo é instruído a retornar um array JSON do mesmo tamanho. O analisador tenta, nesta ordem: um array JSON (possivelmente dentro de um bloco de código ou cercado de explicações; quebras de linha soltas dentro de strings e vírgulas finais são corrigidas), blocos `<seg>` numerados, linhas numeradas e o separador `%%`. Se todas as tentativas falharem ou a contagem não bater, aquele lote é enviado de novo com um parágrafo por requisição, e o usuário vê o mesmo resultado. Erros que não são de análise, como falhas de autenticação, não acionam esse recurso alternativo, para que o mesmo erro não se repita N vezes.

### Estimativa de custo

Suponha que o prompt de sistema e as instruções ocupem $s$ tokens, que cada parágrafo tenha em média $t$ tokens, que haja $N$ parágrafos no total, que o tamanho do lote seja $B$ e que cada parágrafo gaste $c$ tokens extras com numeração e aspas do JSON.

Com uma requisição por parágrafo, o número total de tokens de entrada é

$$
I_{\text{individual}} = N(s + t).
$$

Com agrupamento, há $\lceil N/B \rceil$ requisições, e o número total de tokens de entrada é

$$
I_{\text{lote}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

A diferença é

$$
I_{\text{individual}} - I_{\text{lote}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

Enquanto $s$ for claramente maior que $c$, lotes maiores economizam mais. Com $s = 150$, $t = 60$, $c = 10$, $N = 20$ e $B = 30$:

$$
I_{\text{individual}} = 20 \times 210 = 4200, \qquad I_{\text{lote}} = 150 + 20 \times 70 = 1550.
$$

Os tokens de entrada caem cerca de 63%, e o número de requisições cai de 20 para 1. Os tokens de saída ficam praticamente iguais nos dois casos, já que o tamanho da tradução não muda. Menos requisições também fazem diferença para os endpoints gratuitos: o Google e a Microsoft limitam seus endpoints gratuitos pela taxa de requisições, e uma mensagem de 20 parágrafos ocupa uma única requisição.

## Privacidade

- As chaves de API ficam armazenadas apenas em `storage.local` do perfil atual do Thunderbird e são enviadas apenas nas requisições ao endpoint do provedor correspondente.
- O script de conteúdo roda dentro da página da mensagem; as configurações que ele recebe do script em segundo plano nunca contêm chaves.
- O texto da mensagem é enviado apenas ao serviço de tradução atual e, enquanto a tradução em corrida estiver ativada, ao serviço rápido escolhido. A extensão não coleta estatísticas e não acessa nenhum endereço de rede além desses serviços.
- O cache de traduções é armazenado localmente e pode ser desativado ou limpo na página de configurações.
- O texto da mensagem sai do seu computador e vai para o serviço de tradução selecionado. Para mensagens sensíveis, modelos locais como o Ollama ou o LM Studio mantêm todas as requisições na sua própria máquina.

## Limitações conhecidas

- As traduções são texto simples. Links, negrito e outras formatações em linha do original não são preservados na tradução. No modo bilíngue, o original continua totalmente utilizável; no modo só tradução, você pode passar o mouse para ver o original ou voltar para o modo bilíngue.
- Os endpoints gratuitos do Google e da Microsoft não são documentados e podem mudar ou sofrer limitação de taxa. A Microsoft desativou o endpoint de token `edge.microsoft.com/translate/auth` em julho de 2026 (ele retorna 404). A extensão ainda tenta o endpoint de token na primeira requisição, passa para o endpoint direto após uma falha e não tenta o endpoint de token de novo durante uma hora.
- Para decidir se um parágrafo já está no idioma de destino, chinês, japonês, coreano e escritas semelhantes são avaliados pela classe dos caracteres, e os idiomas de escrita latina e cirílica usam primeiro `i18n.detectLanguage` da API de extensões. Quando essa API não está disponível ou o resultado dela não é confiável, apenas o inglês é detectado com segurança; parágrafos em outros idiomas de escrita latina são enviados para tradução normalmente.
- O script de conteúdo é registrado por meio de `messageDisplayScripts` e só alcança mensagens abertas depois do registro. Ao iniciar, a extensão tenta injetá-lo nas mensagens que já estão abertas; se isso falhar, basta selecionar a mensagem de novo.
- As mensagens de erro geradas pela extensão são traduzidas. Os textos de erro retornados por um serviço de tradução ou pelo AI SDK (por exemplo, o corpo de uma resposta HTTP 401) são exibidos como foram recebidos, em geral em inglês.
- O nome da extensão, a descrição no Gerenciador de extensões e as descrições dos atalhos seguem o idioma da interface do Thunderbird, e não a opção de idioma da interface.
- A tradução precisa identifica uma mensagem por um hash do texto do corpo, porque o script de conteúdo não tem acesso ao ID da mensagem. Duas cópias do mesmo texto compartilham suas traduções e sua análise.
- O cache de prompt depende do provedor. A Anthropic guarda em cache apenas prefixos acima de um tamanho mínimo que depende do modelo; prefixos menores são enviados e cobrados normalmente.
- A chave de raciocínio funciona por correspondência de nomes de modelo. Um modelo novo cujo nome não coincide com nenhum padrão não recebe parâmetro de raciocínio até que a tabela em `src/background/providers/thinking.ts` seja ampliada.
- A tradução em corrida dobra as requisições ao serviço rápido, o que pesa nos limites de taxa dos endpoints gratuitos do Google e da Microsoft.

## Testes

```bash
npm test               # testes unitários do vitest
npm run typecheck      # verificação de tipos do TypeScript
npm run locales:check  # verifica cada locales/<language>.json em relação a locales/en.json
npm run live-test      # chama os endpoints reais do Google e da Microsoft pelos módulos da própria extensão
```

Os testes unitários cobrem o agrupamento e as filas de lotes, a análise da saída da IA e o recurso alternativo, a detecção de parágrafos com a renderização e a restauração nos modos bilíngue e só tradução (no jsdom), a montagem das requisições e a análise das respostas do Google, da Microsoft e do DeepLX (com fetch simulado), a URL da requisição e os cabeçalhos de autenticação de cada predefinição de IA, os parâmetros de raciocínio de cada provedor, a migração das configurações para serviços adicionados, as listas de serviços adicionados no pop-up e na página de configurações e a proteção contra remoção, a tradução em corrida (resultado rápido primeiro, resultado da IA primeiro, falha da IA, acerto no cache, troca do modo de exibição e restauração), a tradução precisa (requisição única, análise com lotes, análise com falha, chaves de cache e lotes por mensagem, prefixo de prompt idêntico com o controle de cache da Anthropic) e a localização: conjuntos de chaves e marcadores idênticos em todos os idiomas, cada referência `__MSG_*__` no manifesto, o mapeamento dos idiomas do Thunderbird para os idiomas suportados, o retorno ao inglês para chaves ausentes e a ausência de texto de interface fixo no código das páginas HTML e dos fontes.

`npm run build:debug` gera um xpi de depuração que começa a traduzir assim que uma mensagem é aberta e registra o progresso no console, para verificar o fluxo completo em um Thunderbird real.

## Estrutura do projeto

```
src/
  background/    script em segundo plano: serviço de tradução, filas de lotes e de requisições, cache, fábrica de provedores, tradutores
  content/       script de conteúdo: detecção de parágrafos, renderização, detecção de idioma, estado da tradução
  popup/         pop-up
  options/       página de configurações
  shared/        configurações compartilhadas, predefinições de provedores, tabela de idiomas, tipos de mensagem, runtime de i18n
locales/         textos da interface, um arquivo JSON por idioma; en.json é a referência
static/          manifest.json, HTML, CSS, ícone SVG
scripts/         build, geração e verificação das traduções, teste dos endpoints reais
readmes/         versões traduzidas deste README
docs/            GIF de demonstração usado neste README
tests/           testes do vitest
```

## Traduzir a interface

Os textos da interface ficam em `locales/<language>.json`, um objeto plano de chave → texto por idioma. `locales/en.json` é a referência: todos os outros arquivos têm exatamente as mesmas chaves. `$1` a `$9` são substituições e precisam aparecer em cada tradução com os mesmos números do inglês; `{{apiKey}}` e `{{to}}` são tokens literais e permanecem inalterados. Nomes de produtos como Google Translate, OpenAI ou DeepLX não são traduzidos.

`npm run build` converte esses arquivos em `dist/_locales/<language>/messages.json`, o formato que o Thunderbird lê. O próprio runtime de i18n da extensão carrega os mesmos arquivos em tempo de execução, por isso o idioma da interface pode mudar sem reiniciar o Thunderbird. Chaves ausentes recorrem ao inglês.

Para adicionar um idioma, crie `locales/<code>.json` com todas as chaves, adicione o código a `SUPPORTED_LOCALES` em `src/shared/locales.ts` junto com o nome nativo do idioma e execute `npm run locales:check` e `npm test`.

## Agradecimentos

O design da detecção de parágrafos, da fila de lotes, dos prompts e da configuração dos provedores segue o [Read Frog](https://github.com/mengxi-ream/read-frog), uma extensão de navegador para traduzir páginas da web lançada sob a GPL-3.0. Este projeto leva essas ideias para o leitor de mensagens do Thunderbird e as adapta ao e-mail, por exemplo dividindo mensagens de texto simples nas linhas em branco e unindo linhas quebradas manualmente.

## Licença

GPL-3.0-or-later. Consulte [LICENSE](../LICENSE) para o texto completo.
