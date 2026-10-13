# Thunderbird Translate

Thunderbird Translate est une extension Thunderbird qui traduit le corps du message en cours de lecture, directement dans le panneau de lecture. Elle fonctionne dès l’installation avec Google Translate, gratuit.

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Français | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Utilisation](#utilisation)
- [Niveaux de traduction](#niveaux-de-traduction)
- [Services de traduction](#services-de-traduction)
- [Invites](#invites)
- [Confidentialité](#confidentialité)
- [Limites connues](#limites-connues)
- [Documentation](#documentation)
- [Remerciements](#remerciements)
- [Licence](#licence)

## Fonctionnalités

- Traduction des paragraphes, éléments de liste, cellules de tableau, titres et citations des messages HTML, ainsi que des paragraphes séparés par une ligne vide dans les messages en texte brut. Le code, les nombres, les liens nus et les paragraphes déjà dans la langue cible sont ignorés.
- Deux modes d’affichage : bilingue (la traduction sous chaque paragraphe original) ou traduction seule. Désactiver la traduction restaure exactement le message original.
- Trois niveaux de traduction fonctionnent en même temps : un dictionnaire hors ligne, un traducteur automatique et un service d’IA. Le résultat le plus rapide s’affiche en premier, puis celui du niveau le plus élevé le remplace.
- Services gratuits sans compte : Google Translate (par défaut) et Microsoft Translator.
- Traduction hors ligne avec des paquets de dictionnaires et les modèles Bergamot de Mozilla ; aucun texte ne quitte votre ordinateur.
- 22 préréglages de fournisseurs d’IA, dont OpenAI, Claude, Gemini, DeepSeek, Qwen, Ollama et LM Studio en local, ainsi que tout service compatible OpenAI.
- Traduction précise : le niveau IA voit le message entier, si bien que les noms et les termes restent cohérents.
- Trois invites modifiables, avec des préréglages pour les variantes régionales, les styles d’écriture et les mots difficiles.
- Traduction automatique facultative de chaque message qui n’est pas dans la langue cible.
- Interface en 12 langues et guide de configuration qui s’ouvre après l’installation.

## Installation

1. Téléchargez le dernier fichier `thunderbird-translate-<version>.xpi` depuis la [page Releases](https://github.com/willlllliams/thunderbird-translate/releases).
2. Dans Thunderbird, ouvrez Outils → Modules complémentaires et thèmes (aussi accessible depuis le menu ≡ en haut à droite).
3. Cliquez sur l’icône d’engrenage au-dessus de la liste des extensions, choisissez « Installer un module depuis un fichier… », sélectionnez le fichier xpi et confirmez.

Thunderbird 128 ou une version ultérieure est nécessaire. La préversion `nightly` est une compilation automatique du dernier commit, destinée aux tests.

## Démarrage rapide

Après l’installation, le guide de configuration s’ouvre dans un nouvel onglet. Chaque étape pose une seule question : langues, mode d’affichage et style de traduction, service de chaque niveau (avec une courte démonstration du résultat), téléchargements hors ligne, clés des services et invites. Chaque choix est enregistré immédiatement, et toute étape peut être ignorée. La dernière étape traduit un message d’exemple avec vos paramètres.

Vous pouvez rouvrir le guide depuis le lien « Guide de configuration » de la fenêtre contextuelle ou depuis le bouton en haut de la page de paramètres. Sans rien modifier, ouvrez un message et appuyez sur Alt+A : Google Translate le traduit.

## Utilisation

Ouvrez un message et cliquez sur le bouton « Traduire le message » de la barre d’outils de l’en-tête du message. La fenêtre contextuelle contient ces commandes :

- « Traduire ce message » lance la traduction. Tant qu’une traduction est affichée, le bouton indique « Afficher l’original ».
- « Retraduire » interroge de nouveau tous les niveaux et ignore le cache.
- Le mode d’affichage, la langue source (« Détecter automatiquement » par défaut) et la langue cible.
- Une liste de services par niveau, la traduction précise et l’interrupteur « Traduire automatiquement les messages qui ne sont pas dans la langue cible ».

| Raccourci | Action |
| --- | --- |
| Alt+A | Traduire le message, ou afficher l’original |
| Alt+S | Basculer entre bilingue et traduction seule |
| Alt+R | Retraduire en ignorant le cache (seulement lorsque le message est traduit) |

Les raccourcis se modifient via « Gérer les raccourcis d’extensions » dans le menu d’engrenage du gestionnaire de modules complémentaires.

Le mode bilingue place chaque traduction sous son paragraphe original. Le mode traduction seule remplace l’original ; survolez une traduction pour voir le texte original.

Tous les autres paramètres se trouvent sur la page de paramètres : le bouton « Options » de l’extension dans le gestionnaire de modules complémentaires. Les modifications sont enregistrées automatiquement, et le survol d’un contrôle affiche ce qu’il fait. Chaque paramètre est décrit dans [docs/settings.md](../docs/settings.md) (en anglais).

## Niveaux de traduction

| Niveau | Services | Vitesse | Qualité | Hors ligne | Coût |
| --- | --- | --- | --- | --- | --- |
| 1 Dictionnaire | Dictionnaire | quelques millisecondes | mot à mot, sans grammaire | oui | gratuit ; quelques Mo par paire de langues |
| 2 Traduction automatique | Google, Microsoft, DeepLX, Bergamot | une à deux secondes par message | complète et lisible | Bergamot seulement | gratuit ; Bergamot télécharge 13 à 48 Mo par direction |
| 3 Traduction par l’IA | 22 fournisseurs d’IA | de quelques secondes à une minute | la plus naturelle ; suit vos invites | modèles locaux seulement | facturé à l’usage sur votre clé d’API ; gratuit avec les modèles locaux |

Chaque niveau utilise un service ou « Non utilisé » ; au moins un niveau a besoin d’un service. Par défaut, seul le niveau 2 est actif, avec Google Translate.

Chaque paragraphe part vers tous les niveaux utilisés en même temps. Le résultat d’un niveau inférieur s’affiche d’abord comme traduction provisoire, en italique et accompagnée du nom de son niveau. Le niveau le plus élevé utilisé la remplace par la traduction définitive ; si ce niveau échoue, la traduction provisoire reste affichée.

Lorsque le dictionnaire ou le modèle Bergamot sélectionné n’a pas les données des langues d’un message, un avis au-dessus du message indique ce qu’il faut télécharger, avec un lien vers les paramètres et une case à cocher « Ne plus me le rappeler pour ces langues ».

## Services de traduction

| Groupe | Services | Ce qu’il faut |
| --- | --- | --- |
| Gratuit | Google Translate | rien |
| | Microsoft Translator | rien ; mode facultatif « Utiliser ma clé (Azure Translator) » avec une clé et une région Azure |
| | DeepLX | l’adresse d’un serveur DeepLX ; jeton facultatif |
| Hors ligne | Dictionnaire | télécharger des paires de langues dans la section « Dictionnaires » ; quelques Mo chacune |
| | Bergamot (Mozilla) | télécharger des directions dans « Modèles de traduction hors ligne (Bergamot) » ; 13 à 48 Mo chacune, chaque modèle a l’anglais d’un côté |
| IA | 22 préréglages | une clé d’API ; Ollama, LM Studio et les services personnalisés compatibles OpenAI n’en demandent pas |

Obtenir une clé d’API : [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). En local : [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

La traduction précise envoie le message entier comme contexte avec chaque requête d’IA et coûte plus cher. L’interrupteur « Mode réflexion » de chaque fournisseur d’IA est désactivé par défaut, car le raisonnement rend la traduction plus lente et plus chère. Les adresses d’API, les modèles par défaut, le réglage `OLLAMA_ORIGINS` d’Ollama et les paramètres de réflexion sont listés dans [docs/providers.md](../docs/providers.md) (en anglais).

## Invites

Le niveau IA utilise l’une des trois invites : affichage bilingue (proche de l’original), affichage en traduction seule (texte fluide) et traduction précise (termes cohérents dans tout le message). Chacune peut être modifiée et rétablie avec « Rétablir l’invite intégrée ».

Les préréglages ajoutent des règles à une invite : une variante régionale comme l’anglais britannique ou l’usage de Taïwan, un style d’écriture, l’original après les mots difficiles, ou de courtes explications des mots difficiles. Les détails se trouvent dans [docs/settings.md](../docs/settings.md#prompts) (en anglais).

## Confidentialité

- Le texte des messages va uniquement aux services des niveaux utilisés. Le dictionnaire et Bergamot traduisent sur votre ordinateur.
- Les clés d’API sont stockées uniquement dans votre profil Thunderbird et ne sont envoyées qu’à l’adresse de leur propre service.
- Deux listes proviennent du réseau, sans aucun texte de message : l’index des paquets de dictionnaires, tiré des releases GitHub de ce dépôt, et les enregistrements des modèles Bergamot, tirés de Mozilla. La page de paramètres et le guide de configuration les lisent pour afficher les listes hors ligne. Tant que le dictionnaire ou Bergamot est sélectionné dans un niveau, elles sont aussi lues au démarrage de Thunderbird, lors d’un changement de paramètres et à l’ouverture de la fenêtre contextuelle. La traduction d’un message ne les lit jamais.
- Les paquets et les modèles ne sont téléchargés que lorsque vous cliquez sur un bouton de téléchargement. L’extension ne collecte aucune statistique.
- Le cache de traduction est stocké localement ; il peut être désactivé ou vidé.
- Pour le courrier sensible, utilisez uniquement le dictionnaire, Bergamot et des modèles d’IA locaux (Ollama, LM Studio).

## Limites connues

- Les traductions sont du texte brut : les liens et la mise en forme interne de l’original ne sont pas conservés dans la traduction.
- Les points d’accès gratuits de Google et de Microsoft ne sont pas documentés ; ils peuvent changer ou être soumis à une limitation de débit.
- Le dictionnaire donne une glose mot à mot dans l’ordre des mots de la langue source.
- Le dictionnaire et Bergamot ne traduisent pas entre le chinois simplifié et le chinois traditionnel.
- Chaque niveau utilisé envoie ses propres requêtes ; le niveau de traduction automatique compte donc aussi dans les limites de débit gratuites lorsque le niveau IA est utilisé.
- Les messages d’erreur renvoyés par un service sont affichés tels quels, généralement en anglais.

La liste complète se trouve dans [docs/settings.md](../docs/settings.md#known-limitations) (en anglais).

## Documentation

Les documents ci-dessous sont en anglais, sauf dictionary-packs.md, qui est en chinois.

- [docs/settings.md](../docs/settings.md) : chaque paramètre, les listes hors ligne, les avis de données manquantes et le cache.
- [docs/providers.md](../docs/providers.md) : adresses d’API, modèles par défaut et paramètres de réflexion de chaque service.
- [docs/batching.md](../docs/batching.md) : comment les paragraphes sont regroupés en requêtes, délais d’attente et coûts.
- [docs/bergamot.md](../docs/bergamot.md) : le moteur hors ligne Bergamot, le choix et le stockage de ses modèles et sa compilation.
- [docs/dictionary-packs.md](../docs/dictionary-packs.md) : sources des données, format et construction des paquets de dictionnaire (en chinois).
- [docs/development.md](../docs/development.md) : compilation depuis les sources, tests, structure du projet, traduction de l’interface et processus de publication.

## Remerciements

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0) : la conception de la détection des paragraphes, de la file de traitement par lots, des invites et de la configuration des fournisseurs.
- [Mozilla Bergamot](https://browser.mt/) : le moteur hors ligne et les modèles Firefox Translations (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors) : les packs de dictionnaire, sauf anglais → chinois simplifié, sont adaptés (extraits, filtrés et réduits) de Wiktionary, extrait par [wiktextract](https://github.com/tatuylonen/wiktextract) et publié par [kaikki.org](https://kaikki.org/) ; licence CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>).
- [ECDICT](https://github.com/skywind3000/ECDICT), Copyright (c) 2025 Linwei, licence MIT : le pack de dictionnaire anglais → chinois simplifié en est adapté (extrait, filtré et réduit).

## Licence

GPL-3.0-or-later. Le texte complet se trouve dans [LICENSE](../LICENSE).
