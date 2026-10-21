# Multi-traduction pour Thunderbird

Multi-traduction pour Thunderbird est une extension Thunderbird qui traduit le corps du message en cours de lecture, directement dans le panneau de lecture. Elle fonctionne dès l’installation avec Google Translate, gratuit. Jusqu’à la version 1.13, elle s’appelait Thunderbird Translate.

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Français | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

![Dictionnaire, traduction automatique et traduction par l’IA arrivent l’une après l’autre](../docs/media/tiers-en.gif)

Vidéo de présentation : [YouTube](https://www.youtube.com/watch?v=OZmiMGeuhJ0) (1 min) · [Bilibili](https://www.bilibili.com/video/BV1JaWw6YENX) (2 min)

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

- Traduction des paragraphes, éléments de liste, cellules de tableau, titres et citations des messages HTML, ainsi que des paragraphes séparés par une ligne vide dans les messages en texte brut. Le code, les nombres, les liens nus et les paragraphes déjà dans la langue cible sont ignorés. L’objet est traduit lui aussi, sur une ligne au-dessus du corps du message (« Traduire aussi l’objet », activé par défaut).
- Deux modes d’affichage : bilingue (la traduction sous chaque paragraphe original) ou traduction seule, avec dans les deux le gras, les listes et les liens des traductions par l’IA mis en forme. Désactiver la traduction restaure exactement le message original.
- Trois niveaux de traduction fonctionnent en même temps : un dictionnaire hors ligne, un traducteur automatique et un service d’IA. Le résultat le plus rapide s’affiche en premier, puis celui du niveau le plus élevé le remplace.
- Traduction automatique sans compte (Google Translate, par défaut, et Microsoft Translator) ou avec votre propre clé (DeepL, Baidu, Youdao, Caiyun).
- Traduction hors ligne avec des paquets de dictionnaires et les modèles Bergamot de Mozilla ; aucun texte ne quitte votre ordinateur.
- 22 préréglages de fournisseurs d’IA, dont OpenAI, Claude, Gemini, DeepSeek, Qwen, Ollama et LM Studio en local, ainsi que tout service compatible OpenAI.
- Traduction précise : le niveau IA voit le message entier, si bien que les noms et les termes restent cohérents. Avec elle, un service d’IA peut aussi lire le texte des images d’un message et afficher l’original et sa traduction sous chaque image.
- Résumé et tâches : un service d’IA liste au-dessus du message le résumé, les tâches, les questions auxquelles répondre et les dates.
- Trois invites modifiables, avec des préréglages pour les variantes régionales, les styles d’écriture et les mots difficiles.
- Traduction automatique facultative de chaque message qui n’est pas dans la langue cible.
- Interface en 12 langues et guide de configuration qui s’ouvre après l’installation.

## Installation

1. Téléchargez le dernier fichier `thunderbird-translate-<version>.xpi` depuis la [page Releases](https://github.com/willlllliams/thunderbird-translate/releases).
2. Dans Thunderbird, ouvrez Outils → Modules complémentaires et thèmes (aussi accessible depuis le menu ≡ en haut à droite).
3. Cliquez sur l’icône d’engrenage au-dessus de la liste des extensions, choisissez « Installer un module depuis un fichier… », sélectionnez le fichier xpi et confirmez.

Thunderbird 128 ou une version ultérieure est nécessaire. La préversion `nightly` est une compilation automatique du dernier commit, destinée aux tests. La version expérimentale `multi-translate-experimental-<version>.xpi` ajoute en plus une colonne « Objet traduit » à la liste des messages ; elle dépend d’une interface interne de Thunderbird, et une seule des deux versions peut être installée ([docs/experimental.md](../docs/experimental.md), en anglais).

## Démarrage rapide

Après l’installation, le guide de configuration s’ouvre dans un nouvel onglet. Chaque étape pose une seule question : langues, mode d’affichage et style de traduction, service de chaque niveau (avec une courte démonstration du résultat), téléchargements hors ligne, clés des services et invites. Chaque choix est enregistré immédiatement, et toute étape peut être ignorée. La dernière étape traduit un message d’exemple avec vos paramètres. Vous pouvez rouvrir le guide depuis le lien « Guide de configuration » de la fenêtre contextuelle ou depuis le bouton en haut de la page de paramètres. Sans rien modifier, ouvrez un message et appuyez sur Alt+A : Google Translate le traduit.

## Utilisation

Ouvrez un message et cliquez sur le bouton « Traduire le message » de la barre d’outils de l’en-tête du message. La fenêtre contextuelle contient ces commandes :

- « Traduire ce message » lance la traduction. Tant qu’une traduction est affichée, le bouton indique « Afficher l’original ».
- « Retraduire » interroge de nouveau tous les niveaux et ignore le cache ; « Résumé et tâches » affiche le résumé du message au-dessus de lui.
- Le mode d’affichage, la langue source (« Détecter automatiquement » par défaut), la langue cible, une liste de services par niveau, la traduction précise avec le mode de la traduction des images (désactivée, demander sous chaque image, activée) et l’interrupteur « Traduire automatiquement les messages qui ne sont pas dans la langue cible ».

| Raccourci | Action |
| --- | --- |
| Alt+A | Traduire le message, ou afficher l’original |
| Alt+S | Basculer entre bilingue et traduction seule |
| Alt+R | Retraduire en ignorant le cache (seulement lorsque le message est traduit) |

Les raccourcis se modifient via « Gérer les raccourcis d’extensions » dans le menu d’engrenage du gestionnaire de modules complémentaires, où le résumé reçoit le raccourci de votre choix.

Le mode bilingue place chaque traduction sous son paragraphe original. Le mode traduction seule remplace l’original ; survolez une traduction pour voir le texte original. Le bouton « Objets traduits » de la barre d’outils principale liste les messages du dossier courant avec leurs objets traduits ; un clic sur une ligne affiche le message.

Tous les autres paramètres se trouvent sur la page de paramètres : le bouton « Options » de l’extension dans le gestionnaire de modules complémentaires. Les modifications sont enregistrées automatiquement, et le survol d’un contrôle affiche ce qu’il fait. Chaque paramètre est décrit dans [docs/settings.md](../docs/settings.md) (en anglais).

## Niveaux de traduction

| Niveau | Services | Vitesse | Qualité | Hors ligne | Coût |
| --- | --- | --- | --- | --- | --- |
| 1 Dictionnaire | Dictionnaire | quelques millisecondes | mot à mot, sans grammaire | oui | gratuit ; quelques Mo par paire de langues |
| 2 Traduction automatique | Google, Microsoft, DeepL, Baidu, Youdao, Caiyun, DeepLX, Bergamot | une à deux secondes par message | complète et lisible | Bergamot seulement | gratuit ; DeepL et Baidu ont un quota gratuit mensuel, Youdao et Caiyun facturent au caractère après le crédit d’essai d’un nouveau compte ; Bergamot télécharge 13 à 48 Mo par direction |
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
| Avec votre clé | DeepL API, Baidu Translate, Youdao, Caiyun | une clé de votre propre compte ; Baidu et Youdao demandent aussi un ID d’application |
| Hors ligne | Dictionnaire | télécharger des paires de langues dans la section « Dictionnaires » ; quelques Mo chacune |
| | Bergamot (Mozilla) | télécharger des directions dans « Modèles de traduction hors ligne (Bergamot) » ; 13 à 48 Mo chacune, chaque modèle a l’anglais d’un côté |
| IA | 22 préréglages | une clé d’API ; Ollama, LM Studio et les services personnalisés compatibles OpenAI n’en demandent pas |

Obtenir une clé d’API : [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). En local : [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

La traduction précise envoie le message entier comme contexte avec chaque requête d’IA et coûte plus cher. L’interrupteur « Mode réflexion » de chaque fournisseur d’IA est désactivé par défaut, car le raisonnement rend la traduction plus lente et plus chère. Les adresses d’API, les modèles par défaut, le réglage `OLLAMA_ORIGINS` d’Ollama et les paramètres de réflexion sont listés dans [docs/providers.md](../docs/providers.md) (en anglais).

## Invites

Le niveau IA utilise l’une des trois invites : affichage bilingue (proche de l’original), affichage en traduction seule (texte fluide) et traduction précise (termes cohérents dans tout le message). Chacune peut être modifiée et rétablie avec « Rétablir l’invite intégrée ».

Les préréglages ajoutent des règles à une invite : une variante régionale comme l’anglais britannique ou l’usage de Taïwan, un style d’écriture, l’original après les mots difficiles, ou de courtes explications des mots difficiles. Les détails se trouvent dans [docs/settings.md](../docs/settings.md#prompt-presets) (en anglais).

## Confidentialité

- Le texte des messages va uniquement aux services des niveaux utilisés. Le dictionnaire et Bergamot traduisent sur votre ordinateur. Les objets des messages suivent la même règle. Un résumé que vous demandez envoie le message entier, avec son expéditeur et sa date, à son service d’IA.
- Avant que le texte d’un message parte pour la première fois vers un service en ligne, un panneau au-dessus du message nomme le service et son adresse et demande une fois par service. Rien n’est envoyé avant un clic sur « Autoriser et traduire » ; la page de paramètres liste les services autorisés et permet de les révoquer. Avec le dictionnaire et Bergamot seuls, rien n’est demandé.
- Une image ne part vers un service d’IA qu’avec la traduction précise activée : après un clic sur le bouton placé dessous, ou d’elle-même quand la traduction des images est « Activée ». Avant la première image, un panneau sous celle-ci demande une fois par service, à part du texte. L’image est réduite et réencodée, sans son nom de fichier ni ses métadonnées. Les images distantes ne sont jamais traduites.
- Une adresse que vous saisissez (Ollama, LM Studio, DeepLX, un service personnalisé, une adresse modifiée) demande une autorisation de connexion, donnée une fois avec « Autoriser l’accès » ou « Tester la connexion » dans les paramètres.
- Les clés d’API sont stockées uniquement dans votre profil Thunderbird et ne sont envoyées qu’à l’adresse de leur propre service.
- Deux listes proviennent du réseau, sans aucun texte de message : l’index des paquets de dictionnaires, tiré des releases GitHub de ce dépôt, et les enregistrements des modèles Bergamot, tirés de Mozilla. La page de paramètres et le guide de configuration les lisent pour afficher les listes hors ligne. Tant que le dictionnaire ou Bergamot est sélectionné dans un niveau, elles sont aussi lues au démarrage de Thunderbird, lors d’un changement de paramètres et à l’ouverture de la fenêtre contextuelle. La traduction d’un message ne les lit jamais.
- Les paquets et les modèles ne sont téléchargés que lorsque vous cliquez sur un bouton de téléchargement. Le cache de traduction est stocké localement ; il peut être désactivé ou vidé. L’extension ne collecte aucune statistique.
- Pour le courrier sensible, utilisez uniquement le dictionnaire, Bergamot et des modèles d’IA locaux (Ollama, LM Studio).

## Limites connues

- Les liens et la mise en forme interne de l’original ne passent pas dans la traduction. Le gras, les listes et les liens n’apparaissent dans une traduction que si un service d’IA les écrit en Markdown ; les traductions du dictionnaire et de la traduction automatique, ainsi que les traductions provisoires, sont du texte brut.
- Les points d’accès gratuits de Google et de Microsoft ne sont pas documentés ; ils peuvent changer ou être soumis à une limitation de débit.
- Le dictionnaire donne une glose mot à mot dans l’ordre des mots de la langue source, et ni lui ni Bergamot ne traduisent entre le chinois simplifié et le chinois traditionnel.
- Chaque niveau utilisé envoie ses propres requêtes ; le niveau de traduction automatique compte donc aussi dans les limites de débit gratuites lorsque le niveau IA est utilisé.
- Les messages d’erreur renvoyés par un service sont affichés tels quels, généralement en anglais.

La liste complète se trouve dans [docs/settings.md](../docs/settings.md#known-limitations) (en anglais).

## Documentation

Les documents ci-dessous sont en anglais, sauf dictionary-packs.md, qui est en chinois.

- [docs/settings.md](../docs/settings.md) : chaque paramètre, les listes hors ligne, les avis de données manquantes et le cache.
- [docs/providers.md](../docs/providers.md) : adresses d’API, modèles par défaut, paramètres de réflexion et modèles qui lisent les images, pour chaque service.
- [docs/batching.md](../docs/batching.md) : comment les paragraphes sont regroupés en requêtes, délais d’attente et coûts.
- [docs/bergamot.md](../docs/bergamot.md) : le moteur hors ligne Bergamot, le choix et le stockage de ses modèles et sa compilation.
- [docs/dictionary-packs.md](../docs/dictionary-packs.md) : sources des données, format et construction des paquets de dictionnaire (en chinois).
- [docs/development.md](../docs/development.md) : compilation depuis les sources, tests, structure du projet, traduction de l’interface et processus de publication.
- [docs/experimental.md](../docs/experimental.md) : la version expérimentale avec la colonne « Objet traduit », son installation et ses risques.

## Remerciements

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0) : la conception de la détection des paragraphes, de la file de traitement par lots, des invites et de la configuration des fournisseurs.
- [Mozilla Bergamot](https://browser.mt/) : le moteur hors ligne et les modèles Firefox Translations (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors) : les packs de dictionnaire, sauf anglais → chinois simplifié, sont adaptés (extraits, filtrés et réduits) de Wiktionary, extrait par [wiktextract](https://github.com/tatuylonen/wiktextract) et publié par [kaikki.org](https://kaikki.org/) ; licence CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>).
- [ECDICT](https://github.com/skywind3000/ECDICT), Copyright (c) 2025 Linwei, licence MIT : le pack de dictionnaire anglais → chinois simplifié en est adapté (extrait, filtré et réduit).

## Licence

GPL-3.0-or-later. Le texte complet se trouve dans [LICENSE](../LICENSE).
