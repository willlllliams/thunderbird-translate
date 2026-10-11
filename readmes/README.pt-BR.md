# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Português (Brasil) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

O Thunderbird Translate é uma extensão do Thunderbird que traduz o corpo da mensagem que você está lendo, diretamente no painel de mensagens. A tradução pode aparecer abaixo de cada parágrafo original (modo bilíngue) ou substituí-lo (modo só tradução). Ao desativar a tradução, a mensagem original é restaurada exatamente como era. A tradução é feita em três níveis ao mesmo tempo: um dicionário offline, um tradutor automático (Google Tradutor, Microsoft Translator, DeepLX ou os modelos offline do Bergamot) e um serviço de IA (22 provedores, entre eles OpenAI, Claude, Gemini, DeepSeek e Qwen). O resultado mais rápido aparece primeiro, e o resultado do nível mais alto o substitui. O Google Tradutor (gratuito) é o serviço padrão e funciona logo após a instalação.

Este documento foi escrito para quem nunca usou uma extensão do Thunderbird. Ele segue a ordem: instalação, uso, configuração e funcionamento interno.

![Demonstração: traduzir uma mensagem, alternar entre bilíngue e somente tradução, trocar o idioma de destino](../docs/demo.gif)

## Recursos

- Tradução do corpo: a extensão encontra o conteúdo em nível de parágrafo no corpo da mensagem: parágrafos, itens de lista, células de tabela, títulos, citações em bloco, divs que contêm apenas texto e, em mensagens de texto simples, parágrafos separados por linhas em branco. Código, parágrafos que já estão no idioma de destino, números, links soltos e espaços em branco são ignorados.
- Dois modos de exibição: o modo bilíngue insere abaixo do original um bloco de tradução com uma borda esquerda clara, legível também em temas escuros. O modo só tradução substitui o original pela tradução; o original fica guardado na memória e volta ao lugar quando a tradução é desativada.
- Atualização imediata: mudar o modo de exibição ou o idioma de destino enquanto uma mensagem está traduzida redesenha a página sem reabrir a mensagem. Mudar o modo de exibição redesenha as traduções do dicionário e da tradução automática já recebidas; o nível de IA é consultado de novo com o prompt do novo modo, e o cache responde quando já tem essa tradução.
- Pontos de acesso: o botão "Traduzir mensagem" na barra de ferramentas do cabeçalho da mensagem, com seu pop-up, e os atalhos Alt+A (traduzir / mostrar original) e Alt+S (alternar bilíngue / só tradução).
- Traduzir automaticamente ao abrir (opcional): mensagens que não estão no idioma de destino são traduzidas assim que são abertas.
- Agrupamento de requisições: o script em segundo plano reúne parágrafos durante 50 ms e os junta em uma única requisição, com limite de concorrência por serviço, novas tentativas com espera exponencial (exponential backoff), tempo limite por requisição e cache local. Um parágrafo maior do que uma requisição comporta é dividido nos limites das frases.
- Três níveis de tradução: dicionário, tradução automática e IA. Cada nível tem seu próprio serviço ou fica sem uso; cada parágrafo vai ao mesmo tempo a todos os níveis em uso. Um nível inferior é exibido como tradução provisória até que o nível mais alto o substitua, e permanece quando o nível mais alto falha.
- Serviços: um dicionário offline, 4 tradutores automáticos (Google Tradutor, Microsoft Translator, DeepLX, modelos offline do Bergamot) e 22 predefinições de provedores de IA, uma das quais é "Compatível com OpenAI (personalizado)". Apenas os serviços que você adicionou aparecem nas listas dos níveis.
- Idioma de origem: detecção automática ou um idioma fixo, repassado a cada serviço.
- Três prompts para o nível de IA: um para a exibição bilíngue, um para a exibição só da tradução e um para a tradução precisa.
- Predefinições de prompt: regras prontas para uma variante regional do idioma de destino, para palavras difíceis com o original entre parênteses, para explicações curtas de palavras difíceis e para quatro estilos de escrita. Cada predefinição pode ser acrescentada a qualquer um dos três prompts.
- Guia de configuração: abre após a instalação e configura passo a passo os idiomas, o modo de exibição, os níveis, os downloads offline, os serviços e os prompts. Termina com uma tradução de teste de uma mensagem de exemplo.
- Tradução precisa (nível de IA): a mensagem inteira serve de contexto para cada requisição, de modo que nomes, termos e formas de tratamento permanecem consistentes entre os parágrafos.
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

`npm run build` empacota com o esbuild o script em segundo plano, o script de conteúdo, o pop-up, a página de configurações, o guia de configuração e o worker do Bergamot em `dist/`, gera `dist/_locales/<language>/messages.json` a partir dos arquivos em `locales/` e compacta `dist/` em `web-ext-artifacts/thunderbird-translate-<version>.xpi`. A compactação usa a biblioteca fflate, escrita em JavaScript puro, e não precisa do comando zip do sistema. O script em segundo plano é um módulo ES: o AI SDK fica em um chunk separado em `dist/chunks/`, carregado quando o nível de IA entra em uso, e por isso o Thunderbird inicia a extensão sem ele. O primeiro build baixa da Mozilla o motor Bergamot (wasm) na versão fixada e o grava em `.cache/`, veja [docs/bergamot.md](../docs/bergamot.md).

Durante o desenvolvimento, é possível carregar a extensão sem empacotá-la: no Thunderbird, abra Ferramentas → Ferramentas de desenvolvimento → Depurar extensões, clique em "Carregar extensão temporária" e selecione `dist/manifest.json`.

## Guia de configuração

Depois de uma instalação nova, o Thunderbird abre o guia de configuração em uma aba. As atualizações da extensão ou do Thunderbird não o abrem. Mais tarde, o guia pode ser aberto pelo link "Guia de configuração" do pop-up e pelo botão "Guia de configuração" no topo da página de configurações.

Cada etapa pede uma única decisão e a salva na hora. Há três formas de passar de uma etapa a outra:

- "Voltar", "Avançar" e "Pular esta etapa" mudam de etapa.
- A lista numerada abaixo da barra de progresso leva direto a qualquer etapa.
- "Sair do guia" fecha a aba a qualquer momento.

A visita seguinte começa na etapa em que o guia foi deixado. Depois de "Concluir", ela começa do início.

| Etapa | Conteúdo | Exibida quando |
| --- | --- | --- |
| 1 Idiomas | idioma da interface, idioma de origem ("Detectar automaticamente" por padrão), idioma de destino | sempre |
| 2 Exibição | bilíngue ou só tradução, com uma pré-visualização de uma mensagem de exemplo no estilo de tradução atual | sempre |
| 3 Níveis de tradução | velocidade, qualidade, privacidade e custo dos níveis de dicionário, tradução automática e IA; o serviço de cada nível ou "Não usado", com pelo menos um nível com serviço | sempre |
| 4 Tradução offline | os pacotes de dicionário e as direções do Bergamot de que os idiomas da etapa 1 precisam, com tamanho, licença e atribuição; marque os que quer baixar e clique em "Baixar selecionados", que mostra o progresso | o nível de dicionário está em uso ou o nível de tradução automática usa o Bergamot |
| 5 Tradução automática on-line | os campos do tradutor automático: nada a preencher para o Google, modo gratuito ou modo com chave do Azure para a Microsoft, endpoint e token para o DeepLX; "Testar conexão" | o nível de tradução automática usa o Google, a Microsoft ou o DeepLX |
| 6 Tradução por IA | o provedor de IA, a chave de API, o modelo, a temperatura e o modo de raciocínio, "Testar conexão" e a opção "Tradução precisa"; um aviso de que o modo de raciocínio e a tradução precisa deixam a tradução mais lenta e mais cara | o nível de IA está em uso |
| 7 Prompts | os três prompts e a biblioteca de predefinições (veja "Predefinições de prompt") | o nível de IA está em uso |
| 8 Pronto | como traduzir (botão da barra de ferramentas, Alt+A, Alt+S), a opção "Traduzir automaticamente mensagens que não estão no idioma de destino" e "Traduzir a mensagem de exemplo" | sempre |

Uma etapa de que as escolhas anteriores não precisam continua na lista, riscada, e a navegação a pula. Por exemplo, escolher um serviço de IA na etapa 3 traz de volta as etapas 6 e 7.

Com japonês como idioma de origem e chinês simplificado como idioma de destino, a etapa 4 recomenda estes downloads:

- Dicionário: o pacote japonês → chinês quando a release o inclui; caso contrário, os dois pacotes japonês → inglês e inglês → chinês.
- Bergamot: as direções ja → en e en → zh-Hans, porque todo modelo do Bergamot tem o inglês em um dos lados.

Com "Detectar automaticamente", a etapa 4 recomenda os pacotes e as direções a partir do inglês. Um aviso pede então que você instale a direção para o inglês de cada um dos outros idiomas em que recebe mensagens.

"Traduzir a mensagem de exemplo", na etapa 8, renderiza na página um e-mail curto (no idioma de origem quando ele é inglês ou alemão, senão em inglês, ou em alemão quando o idioma de destino é o inglês) e o traduz com as configurações atuais. A página usa a detecção de parágrafos e a renderização do script de conteúdo. Ela envia as requisições ao script em segundo plano pela mesma conexão de uma mensagem exibida. Por isso, o resultado mostra como uma mensagem real vai ficar, incluindo os níveis em uso.

O guia usa os mesmos componentes da página de configurações: os campos dos serviços com o teste de conexão, as listas de dicionários e de modelos do Bergamot e o editor de prompts com as predefinições.

## Uso

Abra uma mensagem. Um botão "Traduzir mensagem" aparece na barra de ferramentas do cabeçalho da mensagem. Ao clicar nele, abre-se um pop-up com estes controles:

- "Traduzir esta mensagem": inicia a tradução. Enquanto uma tradução está em andamento ou sendo exibida, o botão passa a mostrar "Mostrar original" e, ao ser clicado, restaura o original.
- Exibição: alterna entre bilíngue e só tradução; a mudança vale imediatamente para a mensagem atual.
- Idioma de origem e idioma de destino: "Detectar automaticamente" é o idioma de origem padrão. Depois de mudar qualquer um dos dois, uma mensagem em tradução é traduzida de novo. Um aviso aparece quando os dois são o mesmo idioma.
- Níveis de tradução: uma lista por nível (1 Dicionário, 2 Tradução automática, 3 Tradução por IA), cada uma com "Não usado" e os serviços adicionados daquele nível. Pelo menos um nível precisa de um serviço; escolher "Não usado" para o último nível com serviço é recusado com um aviso. "+ Adicionar serviço de tradução", abaixo das listas, abre a página de configurações na seção de serviços de tradução.
- Tradução precisa: aparece enquanto o nível de IA tem um serviço.
- Traduzir automaticamente mensagens que não estão no idioma de destino: quando marcada, uma mensagem cujo corpo não está no idioma de destino é traduzida assim que é aberta.
- Guia de configuração: abre o guia de configuração em uma nova aba.

O pop-up mostra o progresso, por exemplo "8 de 12 traduzidos". Os parágrafos que ainda mostram a tradução provisória de um nível inferior são contados à parte, por exemplo "7 de 9 traduzidos (2 provisórios)". Quando todos os níveis falham para um parágrafo, aparece depois dele o aviso vermelho "Falha na tradução, clique para tentar novamente"; ao passar o mouse sobre ele, o erro é exibido, e ao clicar, aquele parágrafo é traduzido de novo.

Alt+A traduz a mensagem atual ou restaura o original; Alt+S alterna entre bilíngue e só tradução. Os dois atalhos podem ser alterados em "Gerenciar atalhos de extensões", no menu de engrenagem do Gerenciador de extensões.

No modo só tradução, passar o mouse sobre uma tradução mostra o texto original em uma dica de ferramenta.

## Configurações

Abra a página de configurações pelo botão "Opções" desta extensão no Gerenciador de extensões. As configurações são salvas automaticamente; "Salvo" aparece no canto superior direito assim que elas são gravadas. O botão "Guia de configuração", ao lado desse aviso, abre o guia de configuração.

| Seção | Conteúdo |
| --- | --- |
| Geral | Idioma da interface, idioma de origem, idioma de destino, modo de exibição padrão, opção "Traduzir automaticamente mensagens que não estão no idioma de destino" |
| Níveis de tradução | O serviço de cada nível ou "Não usado"; tradução precisa |
| Serviços de tradução | Serviços em dois grupos, "Adicionados" e "Disponíveis"; endpoint, chave de API, modelo, temperatura e modo de raciocínio de cada serviço; botões "Testar conexão", "Adicionar", "Usar este serviço" e "Remover" |
| Dicionários | Pares de idiomas do nível de dicionário, com tamanho, licença e atribuição; baixar e excluir; tag de versão dos pacotes (avançado) |
| Modelos de tradução offline (Bergamot) | Pares de direções dos modelos do Bergamot, com tamanho e versão; filtro por idioma; baixar, atualizar, cancelar e excluir; as direções de que os idiomas atuais precisam |
| Prompts (nível de IA) | A biblioteca de predefinições; os prompts da exibição bilíngue, da exibição só da tradução e da tradução precisa, cada um com "Restaurar prompt embutido" |
| Agrupamento de requisições | Janela de coleta, máximo de caracteres e de parágrafos por requisição, concorrência, novas tentativas, tempo limite por requisição (60 segundos por padrão), juntar ou não as requisições de IA |
| Estilo da tradução | Borda esquerda, borda esquerda tracejada, destaque ou simples; cor de destaque, opacidade do texto, proporção do tamanho da fonte; pré-visualização ao vivo |
| Cache | Cache ativado ou desativado, máximo de parágrafos em cache, número atual de entradas, limpar cache |

"Testar conexão" envia uma frase de teste com os valores que estão nos campos naquele momento. Em caso de sucesso, mostra a tradução; em caso de falha, mostra o erro retornado pelo serviço, por exemplo uma chave inválida ou um nome de modelo desconhecido.

## Adicionar e remover serviços

A lista lateral da seção de serviços de tradução tem dois grupos. "Adicionados" reúne os serviços que aparecem nas listas de serviços do pop-up e da página de configurações; "Disponíveis" reúne todos os demais. Ao selecionar um serviço, aparecem sua configuração e seus botões:

- Um serviço que não foi adicionado tem o botão "Adicionar". Digitar uma chave de API (no DeepLX, o endpoint) também adiciona o serviço.
- Um serviço adicionado tem "Usar este serviço", que o coloca no seu nível, e "Remover". Remover tira o serviço das listas e mantém sua configuração; ao adicioná-lo de novo, a chave e o modelo voltam.
- Um serviço usado por um nível não pode ser removido. O botão "Remover" fica então desativado, e uma linha abaixo dele informa o nível. Os serviços em uso levam a etiqueta "Em uso" na lista lateral.

Uma instalação nova começa com o Google Tradutor e o Microsoft Translator adicionados. O dicionário e o Bergamot precisam de dados que você baixa, por isso são adicionados manualmente. Quando as configurações da versão 1.1 ou anterior são carregadas, um serviço conta como adicionado nestes casos:

| Serviço | Conta como adicionado quando |
| --- | --- |
| Google Tradutor, Microsoft Translator | sempre |
| DeepLX | um endpoint foi preenchido |
| Serviços de IA que exigem chave | uma chave de API foi salva |
| Ollama, LM Studio, compatível com OpenAI (personalizado) | o endpoint, o modelo ou a temperatura foi alterado |
| os serviços dos níveis | sempre |

## Níveis de tradução

| Nível | Serviços | O que fornece |
| --- | --- | --- |
| 1 Dicionário | Dicionário (offline) | uma tradução palavra por palavra a partir dos pacotes de dicionário instalados, disponível na hora e sem rede |
| 2 Tradução automática | Google Tradutor, Microsoft Translator, DeepLX, Bergamot (offline) | uma tradução completa em um ou dois segundos |
| 3 Tradução por IA | os 22 provedores de IA | a melhor tradução, seguindo o prompt do modo de exibição |

Cada nível tem um serviço ou "Não usado", e pelo menos um nível tem um serviço. O padrão é o Google Tradutor no nível 2 e nenhum outro nível em uso.

Cada parágrafo vai ao mesmo tempo a todos os níveis em uso. Cada nível usa o agrupamento e o cache normais. O que a mensagem mostra segue uma única regra: vence o nível mais alto que já respondeu.

| Caso | O que a mensagem mostra |
| --- | --- |
| Um nível inferior responde primeiro | a tradução dele, em itálico e com uma etiqueta que indica o nível ("Dicionário", "Tradução automática"); ao passar o mouse, uma dica informa qual nível ainda está em andamento. Um nível mais alto a substitui quando chega. |
| O nível mais alto em uso responde | a tradução dele, sem etiqueta: é a tradução final. Níveis inferiores que respondem depois são ignorados. |
| O nível mais alto falha | a melhor tradução de nível inferior permanece, marcada com "Falha em Tradução por IA" (ou com o nome do nível mais alto); ao passar o mouse, o motivo é exibido, e ao clicar, apenas os níveis que falharam são consultados de novo |
| Todos os níveis falham | o aviso vermelho "Falha na tradução, clique para tentar novamente" |
| A tradução do nível mais alto já está no cache | essa tradução, na hora; os níveis inferiores não são consultados |

Trocar o modo de exibição redesenha as traduções do dicionário e da tradução automática como estão. O nível de IA usa um prompt por modo de exibição, por isso é consultado de novo com o prompt do novo modo; uma tradução já guardada em cache para esse prompt volta sem nova requisição. O pop-up conta as traduções finais como traduzidas e as traduções de níveis inferiores como provisórias.

As configurações salvas pela versão 1.3 ou anterior são convertidas uma única vez: um serviço de IA que era o serviço atual passa a ser o nível 3, e o serviço rápido da antiga tradução em corrida passa a ser o nível 2 se essa tradução estava ativada; qualquer outro serviço atual passa a ser o nível 2. O nível de dicionário começa sem uso.

## Idioma de origem

O idioma de origem é "Detectar automaticamente" por padrão, ou um dos 20 idiomas da lista de idiomas de destino. Ele é repassado a cada serviço:

| Serviço | Detecção automática | Idioma fixo |
| --- | --- | --- |
| Google Tradutor | `sl=auto` | `sl=<code>` |
| Microsoft Translator, gratuito e com chave | sem o parâmetro `from` | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (variantes do chinês como `ZH`) |
| Serviços de IA | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Dicionário | detectado em cada parágrafo | o idioma definido |
| Bergamot | detectado em cada parágrafo; os parágrafos de cada idioma são traduzidos juntos | o idioma definido |

Os parágrafos detectados como já estando no idioma de destino continuam sendo ignorados. Com o chinês como idioma de destino, o parágrafo também precisa estar escrito na variante do destino: um parágrafo em chinês simplificado é traduzido quando o destino é o chinês tradicional, e vice-versa. Decidem os caracteres que existem em uma única variante (们/們, 这/這, 说/說…); um parágrafo sem esses caracteres é lido igual nas duas variantes e é ignorado. Com um idioma de origem fixo, os parágrafos cujo idioma não pode ser detectado com segurança contam como estando nesse idioma. As chaves de cache e os lotes contêm o idioma de origem, por isso mudá-lo nunca devolve traduções feitas com a configuração anterior.

## Prompts

O nível de IA tem três prompts de sistema. Cada um pode ser editado na página de configurações e restaurado com "Restaurar prompt embutido". As configurações guardam apenas os prompts que você alterou: um prompt inalterado é guardado vazio e representa o texto embutido, que é o que a caixa mostra, de modo que uma versão posterior da extensão traz a você seus prompts embutidos aprimorados. "Restaurar prompt embutido" e uma caixa cujo texto é igual ao do prompt embutido guardam ambos um valor vazio. Cópias de um prompt embutido gravadas por versões anteriores são reconhecidas e apagadas quando as configurações são lidas. `{{to}}` é substituído pelo nome em inglês do idioma de destino. A própria extensão acrescenta a cada requisição o idioma de origem e o formato do lote.

| Prompt | Usado para | O prompt embutido pede |
| --- | --- | --- |
| Exibição bilíngue | o nível de IA no modo bilíngue | uma tradução próxima do original, frase por frase e na mesma ordem, sem acrescentar nem omitir nada, já que o leitor a compara com o original |
| Exibição só da tradução | o nível de IA no modo só tradução | um texto fluente, que se lê como um e-mail escrito no idioma de destino; orações podem ser reordenadas e frases divididas ou unidas, desde que o sentido completo seja mantido |
| Tradução precisa | o nível de IA enquanto a tradução precisa está ativada, nos dois modos de exibição | termos, nomes e formas de tratamento consistentes em toda a mensagem, com base no glossário, no resumo e nos parágrafos vizinhos |

As chaves de cache e de lote contêm o tipo de prompt e um hash do seu texto. Por isso, editar um prompt nunca devolve traduções feitas com o texto anterior. Um prompt de sistema personalizado salvo pela versão 1.3 ou anterior passa a ser o prompt dos dois modos de exibição; o prompt da tradução precisa começa com o texto embutido.

### Predefinições de prompt

A biblioteca de predefinições fica acima dos três prompts na página de configurações e na etapa 7 do guia de configuração. Para aplicar uma predefinição:

1. Escolha uma predefinição em "Predefinição". Se a predefinição tiver variantes, escolha também uma variante em "Variante".
2. Escolha em "Acrescentar ao prompt" o prompt que recebe a predefinição.
3. Clique em "Aplicar predefinição".

A linha "Exemplo" mostra uma frase de origem e o resultado esperado com a predefinição escolhida.

| Predefinição | Variantes | Regra acrescentada ao prompt |
| --- | --- | --- |
| Dialeto ou uso regional | conforme o idioma de destino: cantonês (Hong Kong) e sichuanês para o chinês simplificado; cantonês (Hong Kong) e uso de Taiwan para o chinês tradicional; inglês britânico e inglês americano; português brasileiro e português europeu; espanhol mexicano e espanhol da Espanha; francês canadense (Quebec); alemão padrão suíço | escrever nessa variante, com a ortografia, o vocabulário e as formas de tratamento dela |
| Palavras difíceis com o original | nenhuma | traduzir normalmente e colocar o termo original entre parênteses depois de cada palavra difícil ou termo técnico, uma vez por parágrafo, por exemplo "auditoria prévia (due diligence)" |
| Explicação de palavras difíceis | nenhuma | traduzir o parágrafo e depois explicar as palavras difíceis dele no idioma de destino, no fim do mesmo parágrafo, dentro de um único colchete: 〔Nota: termo: explicação; …〕 |
| Estilo de escrita | formal de negócios, descontraído, linguagem simples para estudantes, literário | usar esse registro e manter o sentido completo |

A lista de variantes acompanha o idioma de destino. Um idioma de destino sem variantes regionais, como o japonês, não oferece a predefinição "Dialeto ou uso regional".

Uma predefinição acrescenta um bloco de regras em inglês ao fim do prompt, depois de uma linha em branco. O bloco começa com um título como `Style (this rule takes precedence over the rules above):`. Por isso, ele prevalece sobre as regras gerais do prompt embutido, como "Do not add explanations". Aplicar a mesma predefinição de novo substitui o bloco dela; predefinições diferentes se somam. A caixa do prompt mostra o texto combinado e continua editável. "Restaurar prompt embutido" remove todos os acréscimos.

As predefinições mantêm uma tradução por parágrafo. As explicações de palavras difíceis ficam dentro da tradução do parágrafo delas, e o bloco proíbe devolvê-las como parágrafo ou elemento de array separado. Por isso, um lote continua voltando como array JSON (ou segmentos numerados) com exatamente uma entrada por parágrafo. Os testes aplicam as quatro predefinições a um mesmo prompt e analisam a resposta de um modelo simulado nos dois formatos.

## Tradução precisa

A tradução precisa vale para o nível de IA e envia a mensagem como contexto em cada requisição de IA. Ela é ativada no pop-up ou na seção "Níveis de tradução" da página de configurações. Quando a tradução começa, o script de conteúdo junta os parágrafos encontrados no texto simples da mensagem (cortado após 20000 caracteres, com um aviso de que o texto continua) e o registra uma única vez no script em segundo plano. A mensagem é identificada por um hash do seu texto completo; o corte vale apenas para o texto enviado como contexto.

O fluxo depende do tamanho dos parágrafos a traduzir:

1. Se eles cabem em uma única requisição (dentro de "Máximo de caracteres por requisição" e "Máximo de parágrafos por requisição"), uma requisição traduz todos; a própria requisição leva a mensagem inteira.
2. Caso contrário, uma requisição extra analisa primeiro a mensagem inteira e devolve um resumo de duas a três frases, um glossário de nomes, produtos e outros nomes próprios com a tradução a usar, e o tom e a forma de tratamento. Se essa resposta não puder ser lida, a tradução continua sem ela.
3. Cada requisição começa então com o mesmo prefixo: o prompt de sistema, a análise e, para mensagens de até cerca de 8000 caracteres, o texto completo. Depois do prefixo vêm os parágrafos do lote, cada um com o parágrafo anterior e o seguinte como referência, que não são traduzidos.

O prefixo é idêntico, caractere por caractere, em todas as requisições de uma mensagem, por isso os provedores que guardam em cache prefixos de prompt repetidos podem atendê-lo a partir do cache deles. Para a Anthropic, o prefixo é marcado com `cacheControl: { type: "ephemeral" }`. A análise é guardada em cache como as traduções, com uma chave formada por provedor, modelo, idioma de destino e hash do texto da mensagem; os lotes de uma mesma mensagem esperam pela mesma requisição de análise.

As traduções feitas no modo preciso são guardadas em cache com uma chave que contém o hash da mensagem, e os lotes nunca misturam parágrafos de mensagens diferentes. A mesma frase em outra mensagem é, portanto, traduzida de novo, com aquela mensagem como contexto. A requisição de análise e os prompts mais longos tornam a tradução precisa mais cara que a tradução normal.

## Tradução por dicionário

O serviço de dicionário traduz palavra por palavra com pacotes de dicionário armazenados no perfil do Thunderbird. Depois que um pacote está instalado, ele não precisa de rede e responde em milissegundos, por isso preenche o tempo até que os níveis de tradução automática e de IA respondam. O resultado é uma glosa: as palavras na ordem do original, sem gramática.

### Pacotes

Os pacotes são publicados como arquivos anexos (assets) de uma release deste repositório no GitHub, por padrão a release `dicts-v1`. A tag de versão pode ser alterada em "Tag de versão dos pacotes de dicionários (avançado)", na seção Dicionários. Cada direção é um arquivo `dict-<src>-<tgt>.tsv.gz`, um arquivo de texto UTF-8 compactado com gzip:

```text
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
w	<key>	<translation>
f	<key>	<lemmaKey>
```

A primeira linha descreve o pacote. As linhas que começam com `w` são entradas; as linhas que começam com `f` associam uma forma flexionada à chave do seu lema, por exemplo `went` a `go`. Uma chave é normalizada em NFC, convertida para minúsculas com as regras do idioma de origem e tem os espaços das extremidades removidos; ela pode ser uma expressão de várias palavras. O índice `dict-index.json` lista cada pacote com tamanho, número de entradas e de formas, soma de verificação SHA-256, fonte, licença e atribuição. Os pacotes cobrem inglês, chinês simplificado e tradicional, japonês, coreano, francês, alemão, espanhol, português, russo, turco e vietnamita. [docs/dictionary-packs.md](../docs/dictionary-packs.md) descreve como eles são gerados.

A seção Dicionários lê o índice e lista cada pacote com seu tamanho, licença e atribuição. "Baixar" busca o arquivo mostrando o progresso, confere a soma de verificação SHA-256 e o cabeçalho e o guarda no banco de dados IndexedDB `tt-dictionary` da extensão; "Excluir" o remove. Se o índice não puder ser carregado, a seção informa o motivo, e os pacotes instalados continuam podendo ser excluídos.

### Tradução

1. O idioma de origem é o definido ou, com a detecção automática, o idioma do parágrafo (escrita, detector do navegador, palavras vazias do inglês).
2. `Intl.Segmenter` divide o parágrafo em palavras. Em cada palavra, vence a expressão mais longa, de até três palavras, que tem uma entrada; em seguida, a palavra isolada. Uma palavra sem entrada é procurada pelo seu lema; se isso também falhar, ela fica como está. Pontuação e números ficam como estão.
3. Quando o idioma de destino é chinês ou japonês, as palavras são unidas sem espaços; nos demais idiomas de destino, com espaços.
4. Entre dois idiomas diferentes do inglês, o texto passa pelo inglês: de francês para alemão são usados os pacotes francês → inglês e inglês → alemão.
5. Quando falta um pacote necessário, o erro indica o par de idiomas e remete à seção Dicionários.

O script em segundo plano lê um pacote do IndexedDB no primeiro uso e o mantém na memória; depois de cinco minutos sem traduções por dicionário, libera essa memória.

### Fontes dos dados

Os pacotes são gerados a partir do Wiktionary, extraído pelo wiktextract e publicado pelo kaikki.org (CC BY-SA 4.0, © colaboradores do Wiktionary), e do ECDICT, de skywind3000 (Licença MIT). Cada pacote indica sua própria fonte e licença no índice, e a página de configurações as mostra ao lado do pacote.

## Tradução offline (Bergamot)

O serviço Bergamot traduz no seu computador com o mecanismo e os modelos do Firefox Translations, publicados pela Mozilla sob a MPL-2.0. O mecanismo vem junto com a extensão; cada direção de tradução é baixada uma única vez da Mozilla, com 13 a 48 MB, e guardada no IndexedDB da extensão. Uma direção carregada ocupa cerca de 200 MB de memória e é liberada após cinco minutos sem uso. Todos os modelos têm o inglês de um dos lados, por isso de japonês para chinês são usadas as direções japonês → inglês e inglês → chinês.

A seção "Modelos de tradução offline (Bergamot)" da página de configurações lista os 114 pares de direções entre 58 idiomas, com tamanho e versão, e permite filtrar por idioma. Ela indica as direções de que os idiomas de origem e de destino atuais precisam e as coloca no início da lista. Os downloads mostram o progresso e podem ser cancelados; um par instalado para o qual a Mozilla oferece uma versão mais nova mostra "Atualizar". Excluir um par de que os idiomas atuais precisam pede confirmação. A instalação, a tradução e a remoção são executadas no script em segundo plano, onde fica o mecanismo. [docs/bergamot.md](../docs/bergamot.md) descreve a seleção dos modelos, a verificação, o armazenamento e o mecanismo.

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
| Dicionário (offline) | Baixar pares de idiomas na seção Dicionários | Tradução palavra por palavra com os pacotes instalados, ver "Tradução por dicionário" |
| Bergamot (offline) | Baixar pares de direções na seção "Modelos de tradução offline" | Tradução no seu computador com os modelos da Mozilla, ver "Tradução offline (Bergamot)" |
| Microsoft Translator (gratuito) | Nenhuma | Chama `edge.microsoft.com/translate/translatetext`, o endpoint que o navegador Edge usa; o corpo da requisição é um array de parágrafos. A opção “Usar minha chave (Azure Translator)” do painel chama, em vez disso, a API oficial `api.cognitive.microsofttranslator.com`: crie um recurso do Translator no portal do Azure e copie a chave e a região de “Chaves e Ponto de Extremidade” para o painel (a região pode ficar vazia em um recurso global). |
| DeepLX | Endpoint obrigatório | Um serviço DeepLX auto-hospedado ou de terceiros; o token é opcional. Se o endpoint contiver `{{apiKey}}`, o token o substitui; caso contrário, é enviado como `Authorization: Bearer` |

### Provedores de IA

Todos os provedores de IA são chamados por meio de `generateText` do Vercel AI SDK. Os provedores que têm um pacote oficial `@ai-sdk/*` usam esse pacote; os demais usam `@ai-sdk/openai-compatible`. Endpoint, chave de API, modelo e temperatura podem ser alterados para cada provedor. O campo de modelo sugere modelos comuns e também aceita qualquer nome de modelo.

| Provedor | Pacote do SDK | Endpoint padrão | Modelo padrão | Exige chave |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Sim |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Sim |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Sim |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Sim |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-4.3` | Sim |
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
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-mini-260428` | Sim |
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
|  | `grok-4.5`, `grok-4.6`, `grok-4.7` | `"low"` (não pode ser desativado) | `"high"` | mesma fonte |
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

1. O script de conteúdo entrega ao script em segundo plano cada parágrafo a ser traduzido, uma única vez para todos os níveis em uso.
2. Para cada nível, o script em segundo plano consulta primeiro o cache e, em caso de acerto, responde diretamente. A chave do cache é formada pelo provedor, pelo modelo, pelos idiomas de origem e de destino, por um hash de tudo o mais que molda o resultado e por um hash do texto do parágrafo. Esse hash abrange o endpoint e, no Microsoft Translator, o modo gratuito ou com chave; nos serviços de IA, o tipo de prompt e o seu texto, a chave de raciocínio e a temperatura; no dicionário, os pacotes instalados e as suas versões; no modo preciso, a mensagem é acrescentada. Alterar qualquer um desses elementos nunca devolve uma tradução feita com a configuração anterior. Quando o mesmo texto já está sendo traduzido, as requisições seguintes compartilham o mesmo resultado; uma requisição que falhou ou estourou o tempo limite é descartada, e a requisição seguinte inicia uma nova.
3. Os parágrafos que não estão no cache entram na fila de lotes, agrupados por provedor + modelo + endpoint + idioma de origem + idioma de destino; os serviços de IA também por prompt, chave de raciocínio e temperatura, o Microsoft Translator também por modo gratuito ou com chave e, no modo preciso, também por mensagem. Os parágrafos de um grupo se acumulam durante 50 ms. Um grupo é enviado quando a janela termina, quando o limite de parágrafos é atingido ou quando o próximo parágrafo ultrapassaria o limite de caracteres. Um parágrafo mais longo que o limite de caracteres é dividido em pedaços que cabem: frases inteiras enquanto couberem (`Intl.Segmenter`), uma frase mais longa é cortada por tamanho, e uma quebra de linha sempre encerra um pedaço. Os pedaços são traduzidos como parágrafos e juntados na sua ordem, com um espaço entre eles (nenhum em chinês e japonês) e as quebras de linha do original. O cache guarda o parágrafo inteiro.
4. Cada serviço tem a sua própria fila de requisições, de modo que um serviço de IA lento nunca atrasa o dicionário nem o tradutor automático. A fila limita as requisições simultâneas do seu serviço e repete, com espera exponencial, as requisições que falham com 408, 429, 5xx, erros de rede ou tempo limite; quando o servidor envia `Retry-After`, espera esse tempo, no máximo 30 segundos. Erros como 401 e 400 são informados sem novas tentativas. Uma requisição sem resposta após o tempo limite por requisição das configurações (60 segundos por padrão) é cancelada e informada como "sem resposta em 60 s", com uma dica para aumentar o tempo limite. O motor offline do Bergamot encerra o seu worker quando ele não responde em 2 minutos; a requisição seguinte inicia um novo.
5. Os resultados vão para o cache em memória e são gravados em `storage.local` de uma só vez após 1 segundo. O cache descarta as entradas usadas há mais tempo (LRU, least recently used).

### Como cada serviço junta os parágrafos

- Dicionário e Bergamot: o lote inteiro é traduzido em uma única chamada local, e cada parágrafo recebe o seu próprio resultado: um parágrafo cujo idioma não tem pacote ou modelo falha sozinho. Com a detecção automática, o Bergamot detecta o idioma de cada parágrafo e traduz juntos os parágrafos de cada idioma; um parágrafo curto demais para o detector assume o idioma encontrado com mais frequência no lote ou, se não houver, o inglês.
- Google: um único POST com vários parâmetros `q`; o array retornado corresponde à entrada um a um. Quando a resposta tem um formato inesperado, o lote é solicitado de novo com um parágrafo por requisição, pela mesma fila de requisições, com o seu limite de concorrência e as suas novas tentativas; uma falha afeta então apenas o seu parágrafo.
- Microsoft: o próprio corpo da requisição é um array.
- DeepLX: o endpoint aceita um parágrafo por requisição, por isso os parágrafos de um lote são solicitados de forma simultânea.
- Provedores de IA: os parágrafos são numerados e colocados em uma única mensagem, e o modelo é instruído a retornar um array JSON do mesmo tamanho. O analisador tenta, nesta ordem: um array JSON (possivelmente dentro de um bloco de código ou cercado de explicações; quebras de linha soltas dentro de strings e vírgulas finais são corrigidas), blocos `<seg>` numerados, linhas numeradas e o separador `%%`. Se todas as tentativas falharem, a contagem não bater ou uma tradução vier vazia enquanto o seu parágrafo tem letras ou dígitos, aquele lote é enviado de novo com um parágrafo por requisição, e o usuário vê o mesmo resultado. Erros que não são de análise, como falhas de autenticação, não acionam esse recurso alternativo, para que o mesmo erro não se repita N vezes.

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
- O script de conteúdo roda dentro da página da mensagem; as configurações que ele recebe do script em segundo plano não contêm nem chaves nem endpoints, pois um endpoint pode conter um token.
- As mensagens de erro mascaram o que pode ser um segredo: a chave de API ou o token do serviço onde quer que apareça, os segmentos do caminho de uma URL que parecem um token (20 ou mais caracteres com letras e dígitos), nomes de usuário e senhas em URLs, e parâmetros de URL cujos nomes contêm key, token, auth, secret, sig, pass, credential ou session. As partes mascaradas aparecem como `***`.
- O texto da mensagem é enviado apenas aos serviços dos níveis em uso. O dicionário e o Bergamot traduzem no seu computador e não enviam texto a lugar nenhum. A página de configurações e o guia de configuração leem a lista de pacotes de dicionário nas releases deste repositório no GitHub e a lista de modelos do Bergamot na Mozilla; os pacotes e os modelos em si são baixados apenas quando você clica em "Baixar". Nenhuma dessas requisições leva texto de mensagem. A extensão não coleta estatísticas e não acessa nenhum outro endereço de rede.
- O cache de traduções é armazenado localmente e pode ser desativado ou limpo na página de configurações.
- Com o Google, a Microsoft, o DeepLX ou um serviço de IA online, o texto da mensagem sai do seu computador. Para mensagens sensíveis, use apenas o dicionário, o Bergamot e modelos de IA locais como o Ollama ou o LM Studio, que mantêm todas as requisições na sua própria máquina.

## Limitações conhecidas

- As traduções são texto simples. Links, negrito e outras formatações em linha do original não são preservados na tradução. No modo bilíngue, o original continua totalmente utilizável; no modo só tradução, você pode passar o mouse para ver o original ou voltar para o modo bilíngue.
- Os endpoints gratuitos do Google e da Microsoft não são documentados e podem mudar ou sofrer limitação de taxa. A Microsoft desativou o endpoint de token `edge.microsoft.com/translate/auth` em julho de 2026; a extensão usa apenas o endpoint direto.
- Para decidir se um parágrafo já está no idioma de destino, chinês, japonês, coreano e escritas semelhantes são avaliados pela classe dos caracteres, e os idiomas de escrita latina e cirílica usam primeiro `i18n.detectLanguage` da API de extensões. Quando essa API não está disponível ou o resultado dela não é confiável, apenas o inglês é detectado com segurança; parágrafos em outros idiomas de escrita latina são enviados para tradução normalmente.
- O script de conteúdo é registrado por meio de `messageDisplayScripts` e só alcança mensagens abertas depois do registro. Ao iniciar, a extensão tenta injetá-lo nas mensagens que já estão abertas; se isso falhar, basta selecionar a mensagem de novo.
- As mensagens de erro geradas pela extensão são traduzidas. Os textos de erro retornados por um serviço de tradução ou pelo AI SDK (por exemplo, o corpo de uma resposta HTTP 401) são exibidos como foram recebidos, em geral em inglês.
- O nome da extensão, a descrição no Gerenciador de extensões e as descrições dos atalhos seguem o idioma da interface do Thunderbird, e não a opção de idioma da interface.
- A tradução precisa identifica uma mensagem por um hash do texto do corpo, porque o script de conteúdo não tem acesso ao ID da mensagem. Duas cópias do mesmo texto compartilham suas traduções e sua análise.
- O cache de prompt depende do provedor. A Anthropic guarda em cache apenas prefixos acima de um tamanho mínimo que depende do modelo; prefixos menores são enviados e cobrados normalmente.
- A chave de raciocínio funciona por correspondência de nomes de modelo. Um modelo novo cujo nome não coincide com nenhum padrão não recebe parâmetro de raciocínio até que a tabela em `src/background/providers/thinking.ts` seja ampliada.
- Cada nível em uso envia suas próprias requisições. Com o nível de IA e o de tradução automática em uso ao mesmo tempo, cada mensagem também gera requisições ao tradutor automático, que contam para os limites de taxa dos endpoints gratuitos do Google e da Microsoft.
- A tradução por dicionário é uma glosa palavra por palavra: mantém a ordem das palavras do original e não faz flexão. Palavras ausentes dos pacotes ficam sem tradução.
- A mensagem de exemplo do guia de configuração está em inglês, ou em alemão quando o idioma de destino é o inglês. Com um idioma de origem fixo diferente desses dois, o teste envia mesmo assim esse idioma de origem junto com o texto em inglês.
- Alt+A pressionado enquanto o guia de configuração é a aba ativa traduz ou restaura a mensagem de exemplo. O rótulo do botão de teste não acompanha essa mudança.
- As predefinições são instruções para o modelo. O quanto um dialeto ou estilo é seguido depende do modelo; modelos pequenos misturam variantes regionais com mais frequência.
- Com a detecção automática, o Bergamot atribui a um parágrafo curto demais para o detector (menos de 12 letras) o idioma mais frequente do seu lote. Um parágrafo curto em um idioma diferente do dos parágrafos vizinhos é, portanto, traduzido como se fosse desse idioma.
- O chinês simplificado e o tradicional são distinguidos por uma tabela de 83 caracteres frequentes. Um parágrafo que não usa nenhum deles conta como já escrito em qualquer um dos dois destinos chineses.

## Testes

```bash
npm test               # testes unitários do vitest
npm run test:coverage  # testes unitários com cobertura; falham abaixo dos limites de vitest.config.ts
npm run e2e            # Thunderbird sem interface (THUNDERBIRD_BIN) contra um servidor simulado local: três camadas, troca de modo, restauração; downloads offline do guia de configuração
npm run typecheck      # verificação de tipos do TypeScript
npm run locales:check  # verifica cada locales/<language>.json em relação a locales/en.json
npm run live-test      # chama os endpoints reais do Google e da Microsoft pelos módulos da própria extensão, com e sem idioma de origem
```

Os testes unitários cobrem o agrupamento e as filas de lotes, a análise da saída da IA e o recurso alternativo, a detecção de parágrafos com a renderização e a restauração nos modos bilíngue e só tradução (no jsdom), a montagem das requisições e a análise das respostas do Google, da Microsoft e do DeepLX (com fetch simulado), a URL da requisição e os cabeçalhos de autenticação de cada predefinição de IA, os parâmetros de raciocínio de cada provedor, a migração das configurações para serviços adicionados e para níveis e prompts, as listas dos níveis no pop-up e na página de configurações, a recusa de deixar todos os níveis vazios e a proteção contra remoção, os níveis (nível inferior primeiro e depois substituído, nível mais alto primeiro com os resultados inferiores posteriores ignorados, falha do nível mais alto com o resultado inferior mantido, falha de todos os níveis, níveis sem uso, nível mais alto em cache), a escolha do prompt e as chaves de cache, a troca do modo de exibição que consulta de novo o nível de IA e apenas redesenha os demais, o idioma de origem nas requisições de cada serviço e na chave de cache, os pacotes de dicionário (análise, divisão em palavras e correspondência de expressões, formas flexionadas, tradução passando pelo inglês, pacotes ausentes, download com soma de verificação, com um IndexedDB em memória), o serviço Bergamot e o gerenciamento dos seus modelos com um mecanismo simulado, a tradução precisa (requisição única, análise com lotes, análise com falha, chaves de cache e lotes por mensagem, prefixo de prompt idêntico com o controle de cache da Anthropic), o guia de configuração (abertura apenas em uma instalação nova, navegação entre etapas com etapas puladas e retomada, gravação de cada etapa, pacotes de dicionário e direções do Bergamot recomendados e o download deles, configuração dos serviços e teste de conexão, predefinições nos prompts, tradução de teste pelos módulos do script de conteúdo), as predefinições de prompt (variantes conforme o idioma de destino, combinação com cada um dos três prompts, substituição da mesma predefinição, análise de lotes com todas as predefinições aplicadas) e a localização: conjuntos de chaves e marcadores idênticos em todos os idiomas, cada referência `__MSG_*__` no manifesto, o mapeamento dos idiomas do Thunderbird para os idiomas suportados, o retorno ao inglês para chaves ausentes e a ausência de texto de interface fixo no código das páginas HTML e dos fontes. Os testes dos serviços rodam sobre o caminho de produção `translateForPage()`: níveis lado a lado com filas de requisições separadas, tempos limite, a falha de um único parágrafo, lotes que misturam idiomas e parágrafos mais longos que um lote.

`npm run e2e` executa três cenários, cada um em seu próprio Thunderbird sem interface com um perfil temporário, e encerra apenas os processos que iniciou:

| Cenário | O que verifica |
| --- | --- |
| Mensagem HTML | detecção de parágrafos, a ordem dicionário → Google → IA para cada parágrafo, traduções provisórias e finais, a troca para somente tradução (só o nível de IA é consultado de novo), restauração do DOM original |
| Mensagem em texto simples | o mesmo para uma mensagem em texto simples com uma citação |
| Downloads offline do guia de configuração | o Thunderbird inicia sem mensagem e abre o guia de configuração; o teste vai à etapa offline, baixa o pacote de dicionário e o modelo do Bergamot do servidor simulado com o progresso, verifica que ambos foram gravados e os exclui de novo |

`npm run build:debug` gera um xpi de depuração que começa a traduzir assim que uma mensagem é aberta e registra o progresso no console, para verificar o fluxo completo em um Thunderbird real.

## Estrutura do projeto

```
src/
  background/    script em segundo plano: serviço de tradução, filas de lotes e de requisições, cache, fábrica de provedores, tradutores, dicionário, gerenciamento dos modelos offline
  content/       script de conteúdo: detecção de parágrafos, renderização, detecção de idioma, estado da tradução
  popup/         pop-up
  options/       página de configurações e as partes que o guia de configuração compartilha: campos dos serviços, listas de dicionários e do Bergamot, editor de prompts, leitura e gravação das configurações
  welcome/       guia de configuração: etapas e navegação
  offline/       módulo do mecanismo Bergamot: lista de modelos, download, armazenamento, worker
  shared/        configurações compartilhadas, predefinições de provedores, prompts, tabela e detecção de idiomas, tipos de mensagem, runtime de i18n
  e2e/           ganchos do build de teste e2e (fora de todos os outros builds)
locales/         textos da interface, um arquivo JSON por idioma; en.json é a referência
static/          manifest.json, HTML, CSS, ícone SVG
scripts/         build, download do motor Bergamot, geração e verificação das traduções, teste dos endpoints reais
vendor/          script de ligação do motor Bergamot (bergamot-translator.js)
tools/           dict-build: o pipeline que gera os pacotes de dicionário
readmes/         versões traduzidas deste README
docs/            notas para desenvolvedores sobre o Bergamot e os pacotes de dicionário, GIF de demonstração usado neste README
tests/           testes do vitest
e2e/             teste de ponta a ponta num Thunderbird real: executor, servidor simulado, mensagens de exemplo
.github/         workflows: build e release, pacotes de dicionário
```

## Traduzir a interface

Os textos da interface ficam em `locales/<language>.json`, um objeto plano de chave → texto por idioma. `locales/en.json` é a referência: todos os outros arquivos têm exatamente as mesmas chaves. `$1` a `$9` são substituições e precisam aparecer em cada tradução com os mesmos números do inglês; `{{apiKey}}` e `{{to}}` são tokens literais e permanecem inalterados. Nomes de produtos como Google Translate, OpenAI ou DeepLX não são traduzidos.

`npm run build` converte esses arquivos em `dist/_locales/<language>/messages.json`, o formato que o Thunderbird lê. O próprio runtime de i18n da extensão carrega os mesmos arquivos em tempo de execução, por isso o idioma da interface pode mudar sem reiniciar o Thunderbird. Chaves ausentes recorrem ao inglês.

Para adicionar um idioma, crie `locales/<code>.json` com todas as chaves, adicione o código a `SUPPORTED_LOCALES` em `src/shared/locales.ts` junto com o nome nativo do idioma e execute `npm run locales:check` e `npm test`.

## Agradecimentos

O design da detecção de parágrafos, da fila de lotes, dos prompts e da configuração dos provedores segue o [Read Frog](https://github.com/mengxi-ream/read-frog), uma extensão de navegador para traduzir páginas da web lançada sob a GPL-3.0. Este projeto leva essas ideias para o leitor de mensagens do Thunderbird e as adapta ao e-mail, por exemplo dividindo mensagens de texto simples nas linhas em branco e unindo linhas quebradas manualmente.

Os dados dos dicionários vêm do [Wiktionary](https://en.wiktionary.org/) (© colaboradores do Wiktionary, CC BY-SA 4.0), extraídos pelo [wiktextract](https://github.com/tatuylonen/wiktextract) e publicados pelo [kaikki.org](https://kaikki.org/), e do [ECDICT](https://github.com/skywind3000/ECDICT), de skywind3000 (Licença MIT). A tradução offline usa o mecanismo [Bergamot](https://browser.mt/) e os modelos de tradução do Firefox Translations, publicados pela Mozilla sob a MPL-2.0.

## Licença

GPL-3.0-or-later. Consulte [LICENSE](../LICENSE) para o texto completo.
