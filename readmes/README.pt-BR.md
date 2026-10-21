# Multitradutor para Thunderbird

O Multitradutor para Thunderbird é uma extensão do Thunderbird que traduz o corpo da mensagem que você está lendo, diretamente no painel de mensagens. Ela funciona logo após a instalação, com o Google Tradutor gratuito. Até a versão 1.13, ela se chamava Thunderbird Translate.

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Português (Brasil) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

![Dicionário, tradução automática e tradução por IA chegam uma após a outra](../docs/media/tiers-en.gif)

Vídeo de apresentação: [YouTube](https://www.youtube.com/watch?v=OZmiMGeuhJ0) (1 min) · [Bilibili](https://www.bilibili.com/video/BV1JaWw6YENX) (2 min)

## Sumário

- [Recursos](#recursos)
- [Instalação](#instalação)
- [Início rápido](#início-rápido)
- [Uso](#uso)
- [Níveis de tradução](#níveis-de-tradução)
- [Serviços de tradução](#serviços-de-tradução)
- [Prompts](#prompts)
- [Privacidade](#privacidade)
- [Limitações conhecidas](#limitações-conhecidas)
- [Documentação](#documentação)
- [Agradecimentos](#agradecimentos)
- [Licença](#licença)

## Recursos

- Traduz parágrafos, itens de lista, células de tabela, títulos e citações de mensagens HTML, e parágrafos separados por linhas em branco em mensagens de texto simples. Código, números, links soltos e parágrafos que já estão no idioma de destino são ignorados. O assunto também é traduzido, em uma linha acima do corpo da mensagem ("Traduzir também o assunto", ativado por padrão).
- Dois modos de exibição: bilíngue (a tradução abaixo de cada parágrafo original) ou só tradução, e nos dois o negrito, as listas e os links das traduções por IA aparecem formatados. Ao desativar a tradução, a mensagem original é restaurada exatamente como era.
- Três níveis de tradução funcionam ao mesmo tempo: um dicionário offline, um tradutor automático e um serviço de IA. O resultado mais rápido aparece primeiro, e o do nível mais alto o substitui.
- Tradução automática sem conta (Google Tradutor, o padrão, e Microsoft Translator) ou com a sua própria chave (DeepL, Baidu, Youdao, Caiyun).
- Tradução offline com pacotes de dicionário e os modelos Bergamot da Mozilla; nenhum texto sai do seu computador.
- 22 predefinições de provedores de IA, entre eles OpenAI, Claude, Gemini, DeepSeek, Qwen, Ollama e LM Studio locais e qualquer serviço compatível com OpenAI.
- Tradução precisa: o nível de IA vê a mensagem inteira, e nomes e termos permanecem consistentes.
- Resumo e tarefas: um serviço de IA lista acima da mensagem o resumo, as tarefas, as perguntas a responder e as datas.
- Três prompts editáveis, com predefinições para variantes regionais, estilos de escrita e palavras difíceis.
- Tradução automática opcional de toda mensagem que não está no idioma de destino.
- Interface em 12 idiomas e um guia de configuração que abre após a instalação.

## Instalação

1. Baixe o arquivo `thunderbird-translate-<versão>.xpi` mais recente na [página Releases](https://github.com/willlllliams/thunderbird-translate/releases).
2. No Thunderbird, abra Ferramentas → Extensões e temas (também acessível pelo menu ≡ no canto superior direito).
3. Clique no ícone de engrenagem acima da lista de extensões, escolha "Instalar extensão de arquivo", selecione o arquivo xpi e confirme.

É necessário o Thunderbird 128 ou posterior. A pré-versão `nightly` é um build automático do commit mais recente, destinado a testes. A versão experimental `multi-translate-experimental-<version>.xpi` acrescenta ainda uma coluna "Assunto traduzido" à lista de mensagens; ela depende de uma interface interna do Thunderbird, e só uma das duas versões pode ser instalada ([docs/experimental.md](../docs/experimental.md), em inglês).

## Início rápido

Após a instalação, o guia de configuração abre em uma nova aba. Cada etapa faz uma única pergunta: idiomas, modo de exibição e estilo da tradução, o serviço de cada nível (com uma breve demonstração do resultado), downloads offline, chaves dos serviços e prompts. Cada escolha é salva na hora, e qualquer etapa pode ser pulada. A última etapa traduz uma mensagem de exemplo com as suas configurações. Você pode abrir o guia de novo pelo link "Guia de configuração" no pop-up ou pelo botão no topo da página de configurações. Sem alterar nada, abra uma mensagem e pressione Alt+A: o Google Tradutor a traduz.

## Uso

Abra uma mensagem e clique no botão "Traduzir mensagem" na barra de ferramentas do cabeçalho da mensagem. O pop-up tem estes controles:

- "Traduzir esta mensagem" inicia a tradução. Enquanto uma tradução é exibida, o botão passa a mostrar "Mostrar original".
- "Traduzir de novo" consulta todos os níveis outra vez e ignora o cache; "Resumo e tarefas" mostra o resumo da mensagem acima dela.
- Modo de exibição, idioma de origem ("Detectar automaticamente" por padrão), idioma de destino, uma lista de serviços por nível, a tradução precisa e a chave "Traduzir automaticamente mensagens que não estão no idioma de destino".

| Atalho | Ação |
| --- | --- |
| Alt+A | Traduzir a mensagem ou mostrar o original |
| Alt+S | Alternar entre bilíngue e só tradução |
| Alt+R | Traduzir de novo, ignorando o cache (só enquanto a mensagem está traduzida) |

Os atalhos podem ser alterados em "Gerenciar atalhos de extensões", no menu de engrenagem do Gerenciador de extensões, onde o resumo recebe o atalho que você escolher.

O modo bilíngue coloca cada tradução abaixo do parágrafo original. O modo só tradução substitui o original; passe o mouse sobre uma tradução para ver o texto original. O botão "Assuntos traduzidos" da barra de ferramentas principal lista as mensagens da pasta atual com os assuntos traduzidos; um clique em uma linha mostra a mensagem.

Todas as outras configurações ficam na página de configurações: o botão "Opções" da extensão no Gerenciador de extensões. As alterações são salvas automaticamente, e passar o mouse sobre um controle mostra o que ele faz. Cada configuração é descrita em [docs/settings.md](../docs/settings.md) (em inglês).

## Níveis de tradução

| Nível | Serviços | Velocidade | Qualidade | Offline | Custo |
| --- | --- | --- | --- | --- | --- |
| 1 Dicionário | Dicionário | alguns milissegundos | palavra por palavra, sem gramática | sim | gratuito; alguns MB por par de idiomas |
| 2 Tradução automática | Google, Microsoft, DeepL, Baidu, Youdao, Caiyun, DeepLX, Bergamot | um a dois segundos por mensagem | completa e legível | só o Bergamot | gratuito, os serviços com a sua chave até a cota gratuita; o Bergamot baixa de 13 a 48 MB por direção |
| 3 Tradução por IA | 22 provedores de IA | de alguns segundos a um minuto | a mais natural; segue os seus prompts | só modelos locais | cobrado por uso na sua chave de API; modelos locais são gratuitos |

Cada nível usa um serviço ou "Não usado"; pelo menos um nível precisa de um serviço. O padrão é o Google Tradutor no nível 2 e nada mais.

Cada parágrafo vai a todos os níveis em uso ao mesmo tempo. O resultado de um nível inferior aparece primeiro como tradução provisória, em itálico e com o nome do nível. O nível mais alto em uso a substitui pela tradução final; se o nível mais alto falha, a tradução provisória permanece.

Quando o dicionário ou o Bergamot selecionado não tem os dados para os idiomas de uma mensagem, um aviso acima da mensagem informa o que baixar, com um link para as configurações e a caixa de seleção "Não me lembrar novamente para estes idiomas".

## Serviços de tradução

| Grupo | Serviços | O que você precisa |
| --- | --- | --- |
| Gratuitos | Google Tradutor | nada |
| | Microsoft Translator | nada; modo opcional "Usar minha chave (Azure Translator)", com uma chave e uma região do Azure |
| | DeepLX | o endpoint de um servidor DeepLX; token opcional |
| Com a sua chave | DeepL API, Baidu Translate, Youdao, Caiyun | uma chave da sua própria conta; Baidu e Youdao também pedem um ID do aplicativo |
| Offline | Dicionário | baixar pares de idiomas na seção Dicionários; alguns MB cada |
| | Bergamot (Mozilla) | baixar direções em "Modelos de tradução offline (Bergamot)"; de 13 a 48 MB cada, e todo modelo tem o inglês em um dos lados |
| IA | 22 predefinições | uma chave de API; Ollama, LM Studio e serviços personalizados compatíveis com OpenAI não precisam de chave |

Obter uma chave de API: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). Locais: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

A tradução precisa envia a mensagem inteira como contexto em cada requisição de IA e custa mais; a chave do modo de raciocínio de cada provedor de IA vem desativada por padrão, porque o raciocínio deixa a tradução mais lenta e mais cara. Endpoints, modelos padrão, a variável `OLLAMA_ORIGINS` do Ollama e os parâmetros de raciocínio estão em [docs/providers.md](../docs/providers.md) (em inglês).

## Prompts

O nível de IA usa um de três prompts: exibição bilíngue (próximo do original), exibição só da tradução (texto fluente) e tradução precisa (termos consistentes em toda a mensagem). Cada um pode ser editado e restaurado com "Restaurar prompt embutido".

As predefinições acrescentam regras a um prompt: uma variante regional, como o inglês britânico ou o uso de Taiwan, um estilo de escrita, o termo original depois de palavras difíceis ou explicações curtas dessas palavras. Os detalhes estão em [docs/settings.md](../docs/settings.md#prompt-presets) (em inglês).

## Privacidade

- O texto da mensagem vai apenas aos serviços dos níveis em uso. O dicionário e o Bergamot traduzem no seu computador. Os assuntos das mensagens seguem a mesma regra. Um resumo que você pedir envia a mensagem inteira, com remetente e data, ao serviço de IA do resumo.
- Antes que o texto de uma mensagem vá pela primeira vez a um serviço on-line, um painel acima da mensagem mostra o serviço e o endereço e pergunta uma vez por serviço. Nada é enviado antes de clicar em "Permitir e traduzir"; a página de configurações lista os serviços permitidos e permite revogá-los. Só com o dicionário e o Bergamot, nada é perguntado.
- Um endereço que você digita (Ollama, LM Studio, DeepLX, um serviço personalizado, um endereço alterado) precisa de permissão de conexão, dada uma vez com "Permitir acesso" ou "Testar conexão" nas configurações.
- As chaves de API ficam guardadas apenas no seu perfil do Thunderbird e são enviadas apenas ao endpoint do próprio serviço.
- Duas listas vêm da rede, sem nenhum texto de mensagem: o índice de pacotes de dicionário das releases deste repositório no GitHub e os registros dos modelos Bergamot da Mozilla. A página de configurações e o guia de configuração as leem para mostrar as listas offline. Enquanto o dicionário ou o Bergamot está selecionado em um nível, elas também são lidas quando o Thunderbird inicia, quando as configurações mudam e quando o pop-up abre. Traduzir uma mensagem nunca as lê.
- Pacotes e modelos só são baixados quando você clica em um botão de download. A extensão não coleta estatísticas.
- O cache de traduções fica guardado localmente e pode ser desativado ou limpo.
- Para mensagens sensíveis, use apenas o dicionário, o Bergamot e modelos de IA locais (Ollama, LM Studio).

## Limitações conhecidas

- Links e formatação inline do original não passam para a tradução. Negrito, listas e links aparecem em uma tradução apenas quando um serviço de IA os escreve em Markdown; as traduções do dicionário e da tradução automática, e as traduções provisórias, são texto simples.
- Os endpoints gratuitos do Google e da Microsoft não são documentados e podem mudar ou ter limite de requisições.
- O dicionário dá uma glosa palavra por palavra na ordem das palavras do idioma de origem, e nem ele nem o Bergamot traduzem entre chinês simplificado e chinês tradicional.
- Cada nível em uso envia suas próprias requisições, portanto o nível de tradução automática também conta nos limites gratuitos quando o nível de IA está em uso.
- Os textos de erro devolvidos por um serviço são exibidos como foram recebidos, em geral em inglês.

A lista completa está em [docs/settings.md](../docs/settings.md#known-limitations) (em inglês).

## Documentação

Os documentos abaixo estão em inglês, exceto dictionary-packs.md, que está em chinês.

- [docs/settings.md](../docs/settings.md): todas as configurações, listas offline, avisos de dados ausentes e o cache.
- [docs/providers.md](../docs/providers.md): endpoints, modelos padrão e parâmetros de raciocínio de cada serviço.
- [docs/batching.md](../docs/batching.md): como os parágrafos são agrupados em requisições, tempos limite e custos.
- [docs/bergamot.md](../docs/bergamot.md): o mecanismo offline Bergamot, a escolha e o armazenamento dos modelos e o build.
- [docs/dictionary-packs.md](../docs/dictionary-packs.md): fontes de dados, formato e geração dos pacotes de dicionário (em chinês).
- [docs/development.md](../docs/development.md): compilar a partir do código-fonte, testes, estrutura do projeto, tradução da interface e processo de release.
- [docs/experimental.md](../docs/experimental.md): a versão experimental com a coluna "Assunto traduzido", sua instalação e seus riscos.

## Agradecimentos

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0): o design da detecção de parágrafos, da fila de lotes, dos prompts e da configuração dos provedores.
- [Mozilla Bergamot](https://browser.mt/): o motor offline e os modelos do Firefox Translations (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors): os pacotes de dicionário, exceto inglês → chinês simplificado, são adaptados (extraídos, filtrados e reduzidos) do Wiktionary, extraído pelo [wiktextract](https://github.com/tatuylonen/wiktextract) e publicado pelo [kaikki.org](https://kaikki.org/); licença CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>).
- [ECDICT](https://github.com/skywind3000/ECDICT), Copyright (c) 2025 Linwei, licença MIT: o pacote de dicionário inglês → chinês simplificado é adaptado (extraído, filtrado e reduzido) dele.

## Licença

GPL-3.0-or-later. Veja o texto completo em [LICENSE](../LICENSE).
