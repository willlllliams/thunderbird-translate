# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | Türkçe | [Tiếng Việt](README.vi.md)

Thunderbird Translate, okuduğunuz iletinin gövdesini doğrudan ileti bölmesinde çeviren bir Thunderbird eklentisidir. Çeviri her özgün paragrafın altında gösterilebilir (iki dilli) ya da paragrafın yerini alabilir (yalnızca çeviri). Çeviri kapatıldığında özgün ileti olduğu gibi geri gelir. Varsayılan hizmet ücretsiz Google Translate'tir ve kurulumdan hemen sonra çalışır. Bunun yanında OpenAI, Claude, Gemini, DeepSeek ve Qwen dahil 22 yapay zekâ sağlayıcısı bağlanabilir.

Bu belge daha önce Thunderbird eklentisi kullanmamış okurlar için yazılmıştır. Sırasıyla kurulum, kullanım, yapılandırma ve çalışma ilkesini anlatır.

![Demo: iletiyi çevirme, iki dilli ve yalnızca çeviri arasında geçiş, hedef dili değiştirme](../docs/demo.gif)

## Özellikler

- Gövde çevirisi: eklenti ileti gövdesindeki paragraf düzeyindeki içeriği bulur. Bunlar paragraflar, liste öğeleri, tablo hücreleri, başlıklar, alıntı blokları, yalnızca metin içeren div öğeleri ve düz metin iletilerde boş satırlarla ayrılmış paragraflardır. Kod, zaten hedef dilde olan paragraflar, sayılar, çıplak bağlantılar ve boşluklar atlanır.
- İki görünüm modu: iki dilli modda özgün metnin altına açık renkli sol kenarlığı olan bir çeviri bloğu eklenir; bu blok koyu temalarda da okunur. Yalnızca çeviri modunda özgün metnin yerine çeviri gösterilir; özgün metin bellekte tutulur ve çeviri kapatıldığında geri konur.
- Anlık güncelleme: bir ileti çevrilmişken görünüm modu veya hedef dil değiştirilirse sayfa, ileti yeniden açılmadan yeniden çizilir. Görünüm modunun değiştirilmesi önceden alınmış çevirilerle yeniden çizim yapar ve yeni istek göndermez.
- Giriş noktaları: ileti başlığı araç çubuğundaki "İletiyi çevir" düğmesi ve açılır penceresi, ayrıca Alt+A (çevir / özgün metni göster) ve Alt+S (iki dilli / yalnızca çeviri arasında geç) kısayolları.
- İsteğe bağlı otomatik çeviri: hedef dilde olmayan iletiler açıldıkları anda çevrilir.
- İstek gruplama: arka plan betiği paragrafları 50 ms boyunca toplar ve tek bir istekte birleştirir. Eşzamanlı istek sınırı, üstel geri çekilmeli yeniden deneme ve yerel önbellek de bu sürecin parçasıdır.
- Hizmetler: 3 ücretsiz veya kendi sunucunuzda barındırılan çeviri hizmeti ve 22 yapay zekâ sağlayıcısı ön ayarı; bu ön ayarlardan biri "Özel OpenAI uyumlu" seçeneğidir. Hizmet listelerinde yalnızca eklediğiniz hizmetler görünür.
- Yarışlı çeviri (yapay zekâ hizmetleri): ücretsiz bir çevirmen önce yanıt verir; yapay zekâ çevirisi onun yerini alana kadar sonucu geçici çeviri olarak gösterilir.
- Hassas çeviri (yapay zekâ hizmetleri): her isteğin bağlamı iletinin tamamıdır; bu sayede adlar, terimler ve hitap biçimleri paragraflar arasında tutarlı kalır.
- Her yapay zekâ sağlayıcısı için varsayılan olarak kapalı bir düşünme modu anahtarı.
- 12 dilde arayüz. Arayüz dili varsayılan olarak Thunderbird'ün dilini izler ve ayarlar sayfasından seçilebilir.

## Kurulum

### Releases sayfasından

1. Bu deponun Releases sayfasından en son `thunderbird-translate-<version>.xpi` dosyasını indirin.
2. Thunderbird'de Araçlar → Eklentiler ve temalar'ı açın (sağ üst köşedeki ≡ menüsünden de ulaşılabilir).
3. Eklenti listesinin üstündeki dişli simgesine tıklayın, "Dosyadan eklenti yükle…" seçeneğini seçin, indirilen xpi dosyasını seçin ve onaylayın.

Thunderbird 128 veya daha yeni bir sürüm gerekir.

### Kaynaktan derleme

Node.js 22 veya daha yeni bir sürüm gerekir (geliştirmede Node 24 ve npm 11 kullanılır).

```bash
npm ci
npm test
npm run build
```

`npm run build`, arka plan betiğini, içerik betiğini, açılır pencereyi ve ayarlar sayfasını esbuild ile `dist/` dizinine paketler, `locales/` içindeki dosyalardan `dist/_locales/<language>/messages.json` dosyalarını üretir ve `dist/` dizinini `web-ext-artifacts/thunderbird-translate-<version>.xpi` olarak paketler. Paketleme saf JavaScript ile yazılmış fflate kitaplığını kullanır ve sistemde zip komutu gerektirmez.

Geliştirme sırasında eklenti paketlenmeden yüklenebilir: Thunderbird'de Araçlar → Geliştirici araçları → Eklentilerde hata ayıkla'yı açın, "Geçici eklenti yükle…" düğmesine tıklayın ve `dist/manifest.json` dosyasını seçin.

## Kullanım

Bir ileti açın. İleti başlığı araç çubuğunda "İletiyi çevir" düğmesi görünür. Bu düğmeye tıklandığında aşağıdaki denetimleri içeren bir açılır pencere açılır:

- "Bu iletiyi çevir": çeviriyi başlatır. Bir çeviri sürerken veya gösterilirken düğmenin adı "Özgün metni göster" olur ve tıklandığında özgün metni geri getirir.
- Görünüm: iki dilli ile yalnızca çeviri arasında geçiş yapar; değişiklik geçerli iletiye hemen uygulanır.
- Hedef dil: değiştirildiğinde, çevrilmekte olan ileti yeni dile yeniden çevrilir.
- Çeviri hizmeti: kullanılacak hizmeti seçer. Liste yalnızca eklenen hizmetleri içerir. Listenin altındaki "+ Çeviri hizmeti ekle" ayarlar sayfasını çeviri hizmetleri bölümünde açar.
- Yarışlı çeviri ve Hassas çeviri: geçerli hizmet bir yapay zekâ hizmeti olduğunda görünür; iki yapay zekâ çeviri modunu açıp kapatır.
- Hedef dilde olmayan iletileri otomatik olarak çevir: işaretliyse, gövdesi hedef dilde olmayan bir ileti açıldığı anda çevrilir.

Açılır pencere ilerlemeyi gösterir, örneğin "Çevrildi: 8 / 12". Yarışlı çeviride hâlâ hızlı geçici çeviriyi gösteren paragraflar ayrı sayılır, örneğin "Çevrildi: 7 / 9 (2 geçici)". Bir paragrafın çevirisi başarısız olursa paragrafın arkasında kırmızı renkte "Çeviri başarısız oldu, yeniden denemek için tıklayın" yazısı belirir. Fare imleci üzerine getirildiğinde hata gösterilir; tıklandığında o paragraf yeniden denenir.

Alt+A geçerli iletiyi çevirir veya özgün metni geri getirir; Alt+S iki dilli ile yalnızca çeviri arasında geçiş yapar. İki kısayol da Eklenti yöneticisinin dişli menüsündeki "Eklenti kısayollarını yönet" bölümünden değiştirilebilir.

Yalnızca çeviri modunda fare imleci bir çevirinin üzerine getirildiğinde özgün metin bir araç ipucunda gösterilir.

## Ayarlar

Ayarlar sayfası, Eklenti yöneticisinde bu eklentinin "Seçenekler" düğmesiyle açılır. Ayarlar otomatik olarak kaydedilir; yazıldıklarında sağ üst köşede "Kaydedildi" görünür.

| Bölüm | İçerik |
| --- | --- |
| Genel | Arayüz dili, hedef dil, varsayılan görünüm modu, geçerli hizmet, otomatik çeviri |
| Çeviri hizmetleri | İki grupta hizmetler, "Eklenenler" ve "Eklenebilenler"; her hizmetin uç noktası, API anahtarı, modeli, sıcaklığı ve düşünme modu; "Bağlantıyı test et", "Ekle", "Bu hizmeti kullan" ve "Kaldır" düğmeleri |
| Yapay zekâ çeviri modları | Hızlı hizmet seçimiyle yarışlı çeviri; hassas çeviri |
| Sistem istemi | Yapay zekâ hizmetleri için özel sistem istemi; `{{to}}` yerine hedef dilin adı yazılır; boş bırakılırsa yerleşik istem kullanılır |
| İstek gruplama | Toplama aralığı, istek başına en fazla karakter ve paragraf sayısı, eşzamanlı istek sayısı, yeniden deneme sayısı, yapay zekâ isteklerinin birleştirilip birleştirilmeyeceği |
| Çeviri stili | Sol kenarlık, kesikli sol kenarlık, vurgulama veya sade; vurgu rengi, metin opaklığı, yazı tipi boyutu oranı; anlık önizleme |
| Önbellek | Önbelleği açma veya kapatma, önbellekteki en fazla paragraf sayısı, geçerli kayıt sayısı, önbelleği temizleme |

"Bağlantıyı test et", giriş alanlarındaki geçerli değerlerle tek bir test cümlesi gönderir. Başarılı olursa çeviriyi gösterir; başarısız olursa hizmetin döndürdüğü hatayı gösterir, örneğin geçersiz bir anahtar veya bilinmeyen bir model adı.

## Hizmet ekleme ve kaldırma

Çeviri hizmetleri bölümündeki yan liste iki gruptan oluşur. "Eklenenler", açılır pencerenin ve ayarlar sayfasının hizmet listelerinde görünen hizmetleri; "Eklenebilenler" geri kalan tüm hizmetleri içerir. Bir hizmet seçildiğinde yapılandırması ve düğmeleri gösterilir:

- Eklenmemiş bir hizmetin "Ekle" düğmesi vardır. Bir API anahtarı yazmak (DeepLX için uç nokta yazmak) da hizmeti ekler.
- Eklenmiş bir hizmetin "Bu hizmeti kullan" ve "Kaldır" düğmeleri vardır. Kaldırma, hizmeti listelerden çıkarır ama yapılandırmasını korur; hizmet yeniden eklendiğinde anahtar ve model geri gelir.
- Geçerli hizmet kaldırılamaz; yarışlı çeviri açıkken yarışlı çevirinin hızlı hizmeti de kaldırılamaz. Bu durumda "Kaldır" düğmesi devre dışı kalır ve altındaki bir satır nedenini belirtir.

Yeni bir kurulum Google Translate ve Microsoft Translator eklenmiş olarak başlar. 1.1 veya daha eski bir sürümün ayarları yüklendiğinde bir hizmet şu durumlarda eklenmiş sayılır:

| Hizmet | Şu durumda eklenmiş sayılır |
| --- | --- |
| Google Translate, Microsoft Translator | her zaman |
| DeepLX | bir uç nokta girilmişse |
| Anahtar gerektiren yapay zekâ hizmetleri | bir API anahtarı kaydedilmişse |
| Ollama, LM Studio, özel OpenAI uyumlu | uç nokta, model veya sıcaklık değiştirilmişse |
| geçerli hizmet | her zaman |

## Yapay zekâ çeviri modları

İki mod da yalnızca geçerli hizmet bir yapay zekâ hizmeti olduğunda geçerlidir. Ayarlar sayfasındaki "Yapay zekâ çeviri modları" bölümünden veya açılır pencereden açılabilirler.

### Yarışlı çeviri

Her paragraf hem yapay zekâ hizmetine hem de hızlı bir hizmete gider (varsayılan Google Translate'tir; eklenen hizmetler arasından Microsoft Translator veya DeepLX seçilebilir). İki istek de normal gruplamayı ve önbelleği kullanır. Sonuç, hangi yanıtın önce geldiğine bağlıdır:

| Durum | İletide görünen |
| --- | --- |
| Hızlı hizmet önce yanıt verir | onun çevirisi, italik ve "Geçici" etiketiyle; fare imleci üzerine getirildiğinde bir ipucu yapay zekâ çevirisinin hazırlanmakta olduğunu söyler. Yapay zekâ çevirisi gelince onun yerini alır. |
| Yapay zekâ hizmeti önce yanıt verir | yapay zekâ çevirisi; hızlı hizmetin sonucu atılır |
| Yapay zekâ isteği başarısız olur | hızlı çeviri kalır ve "Yapay zekâ çevirisi başarısız oldu" ile işaretlenir; fare imleci üzerine getirildiğinde neden gösterilir, tıklandığında paragraf yeniden denenir |
| Yapay zekâ çevirisi zaten önbellekte | önbellekteki yapay zekâ çevirisi; hızlı hizmete sorulmaz |

Görünüm modunu değiştirmek geçici ve başarısız işaretlerini korur; "Özgün metni göster" bu işaretleri çevirilerle birlikte kaldırır. Yarışlı çeviri ek yapay zekâ belirteci harcamaz, ancak hızlı hizmete giden istek sayısını iki katına çıkarır.

### Hassas çeviri

Hassas çeviri, iletiyi her yapay zekâ isteğine bağlam olarak ekler. Çeviri başladığında içerik betiği bulduğu paragrafları iletinin düz metninde birleştirir (20000 karakterden sonra kesilir ve metnin devam ettiği belirtilir) ve bunu arka plan betiğine bir kez kaydeder. İleti, tam metninin özet değeriyle (hash) tanımlanır; kesme yalnızca bağlam olarak gönderilen metne uygulanır.

Akış, çevrilecek paragrafların boyutuna bağlıdır:

1. Paragraflar tek bir isteğe sığıyorsa ("İstek başına en fazla karakter" ve "İstek başına en fazla paragraf" sınırları içinde) tek bir istek hepsini çevirir; isteğin kendisi iletinin tamamını taşır.
2. Sığmıyorsa önce fazladan bir istek iletinin tamamını inceler ve iki üç cümlelik bir özet, adlar, ürünler ve diğer özel adlar için kullanılacak çevirileri içeren bir sözlük, ayrıca üslubu ve hitap biçimini döndürür. Bu yanıt okunamazsa çeviri onsuz sürer.
3. Ardından her istek aynı önekle başlar: sistem istemi, analiz ve yaklaşık 8000 karaktere kadar olan iletilerde tam metin. Önekten sonra grubun paragrafları gelir; her birinin öncesindeki ve sonrasındaki paragraf, çevrilmeyen birer başvuru olarak eklenir.

Önek, bir iletinin tüm isteklerinde karakter karakter aynıdır; tekrar eden istem öneklerini önbelleğe alan sağlayıcılar bu nedenle onu kendi önbelleklerinden sunabilir. Anthropic için önek `cacheControl: { type: "ephemeral" }` ile işaretlenir. Analiz de çeviriler gibi önbelleğe alınır; anahtarı sağlayıcıdan, modelden, hedef dilden ve ileti metninin özet değerinden oluşur ve bir iletinin grupları aynı analiz isteğini bekler.

Hassas modda yapılan çeviriler, ileti özet değerini içeren bir anahtarla önbelleğe alınır ve gruplar farklı iletilerin paragraflarını hiçbir zaman karıştırmaz. Bu yüzden aynı cümle başka bir iletide, o ileti bağlam olarak kullanılarak yeniden çevrilir. Analiz isteği ve daha uzun istemler hassas çeviriyi normal çeviriden daha pahalı yapar.

## Arayüz dili

Genel bölümündeki "Arayüz dili" seçeneği iki tür değer alır:

- "Thunderbird ile aynı" (varsayılan): eklenti, Thunderbird'ün kendi arayüz diline en yakın desteklenen dili kullanır. Seçeneğin etiketi o anda seçilen dili gösterir, örneğin "Thunderbird ile aynı (Deutsch)".
- Desteklenen 12 dilden biri: eklenti, Thunderbird'ün dilinden bağımsız olarak bu dili kullanır.

Seçim açılır pencereye, ayarlar sayfasına, iletilerin içindeki etiketlere ("Çevriliyor…", "Çeviri başarısız oldu, yeniden denemek için tıklayın"), hata iletilerine, bağlantı testinin sonucuna ve araç çubuğu düğmesinin araç ipucuna uygulanır. Açık bir ayarlar sayfası veya açılır pencere metnini hemen değiştirir. Zaten çevrilmiş bir iletinin içindeki etiketler bir sonraki çizimde değişir.

Birkaç metin doğrudan Thunderbird tarafından eklenti bildiriminden (manifest) okunur ve her zaman Thunderbird'ün arayüz dilini izler: Eklenti yöneticisindeki eklenti adı ve açıklaması ile "Eklenti kısayollarını yönet" altındaki kısayol açıklamaları. Ayarlar sayfası bunu seçeneğin altında belirtir.

"Thunderbird ile aynı", Thunderbird'ün dilini şu şekilde eşler:

| Thunderbird dili | Kullanılan arayüz dili |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Geleneksel Çince |
| diğer `zh-*` | Basitleştirilmiş Çince |
| `pt-*` | Portekizce (Brezilya) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | aynı birincil alt etikete sahip dil |
| diğer tüm diller | İngilizce |

Hedef dil listesi her dilin adını arayüz dilinde ve ardından dilin kendi adıyla gösterir, örneğin "Japonca (日本語)". Yapay zekâ hizmetlerine gönderilen istemler her zaman dilin İngilizce adını kullanır, çünkü modeller İngilizce talimatlara en güvenilir şekilde uyar.

İlk kurulumda hedef dil arayüz diline göre ayarlanır: Japonca bir Thunderbird hedef dil olarak Japonca ile, İngilizce bir Thunderbird İngilizce ile başlar. Mevcut bir hedef dilin üzerine hiçbir zaman yazılmaz.

## Desteklenen arayüz dilleri

| Kod | Dil |
| --- | --- |
| `en` | English |
| `zh_CN` | 简体中文 (Basitleştirilmiş Çince) |
| `zh_TW` | 繁體中文 (Geleneksel Çince) |
| `ja` | 日本語 (Japonca) |
| `ko` | 한국어 (Korece) |
| `fr` | Français (Fransızca) |
| `de` | Deutsch (Almanca) |
| `es` | Español (İspanyolca) |
| `pt_BR` | Português (Brasil) (Portekizce, Brezilya) |
| `ru` | Русский (Rusça) |
| `tr` | Türkçe (Türkçe) |
| `vi` | Tiếng Việt (Vietnamca) |

Hedef dil listesi bundan ayrıdır ve İtalyanca, Ukraynaca, Lehçe, Felemenkçe, Tayca, Endonezce, Arapça ve Hintçe dahil 20 dil içerir.

## Sağlayıcı yapılandırması

### Ücretsiz ve kendi sunucunuzda barındırılan hizmetler

| Hizmet | Kurulum | Notlar |
| --- | --- | --- |
| Google Translate (ücretsiz, varsayılan) | Yok | `translate.googleapis.com` adresinin `client=gtx` uç noktasını çağırır; tek bir POST isteği birden fazla `q` parametresi taşır, bu nedenle birden fazla paragraf aynı isteği paylaşır |
| Microsoft Translator (ücretsiz) | Yok | Önce `edge.microsoft.com/translate/auth` adresinden bir belirteç almayı ve `api-edge.cognitive.microsofttranslator.com` adresini çağırmayı dener; Microsoft belirteç uç noktasını kullanımdan kaldırdığında `edge.microsoft.com/translate/translatetext` adresine geçer. İki yol da dizileri doğrudan kabul eder. Panelde “Kendi anahtarımı kullan (Azure Translator)” seçilirse bunun yerine resmî `api.cognitive.microsofttranslator.com` çağrılır: Azure portalında bir Translator kaynağı oluşturun, “Anahtarlar ve Uç Nokta” altındaki anahtarı ve bölgeyi panele girin (genel kaynakta bölge boş kalabilir). |
| DeepLX | Uç nokta gerekli | Kendi sunucunuzda veya üçüncü tarafça barındırılan bir DeepLX hizmeti; belirteç isteğe bağlıdır. Uç nokta `{{apiKey}}` içeriyorsa belirteç onun yerine yazılır; içermiyorsa `Authorization: Bearer` olarak gönderilir |

### Yapay zekâ sağlayıcıları

Tüm yapay zekâ sağlayıcıları Vercel AI SDK'nın `generateText` işleviyle çağrılır. Resmî bir `@ai-sdk/*` paketi olan sağlayıcılar o paketi, diğerleri `@ai-sdk/openai-compatible` paketini kullanır. Uç nokta, API anahtarı, model ve sıcaklık her sağlayıcı için değiştirilebilir. Model alanı yaygın modelleri önerir ve herhangi bir model adını da kabul eder.

| Sağlayıcı | SDK paketi | Varsayılan uç nokta | Varsayılan model | Anahtar gerekli |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Evet |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Evet |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Evet |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Evet |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | Evet |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Evet |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Evet |
| Ollama (yerel) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | Hayır |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Evet |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Evet |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Evet |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Evet |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Evet |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Evet |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Evet |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Evet |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Evet |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Evet |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | Evet |
| Azure OpenAI | `@ai-sdk/azure` | Doldurulmalı | `gpt-4.1-mini` | Evet |
| LM Studio (yerel) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | Hayır |
| Özel OpenAI uyumlu | `@ai-sdk/openai-compatible` | Doldurulmalı | Doldurulmalı | Hayır |

Bazı sağlayıcıların ek gereksinimleri vardır:

- Anthropic Claude: eklenti `anthropic-dangerous-direct-browser-access: true` başlığını ekler; Anthropic, tarayıcı bağlamından gelen isteklerde bu başlığı zorunlu tutar. Claude 5 serisi ile Opus 4.7 ve 4.8 özel bir sıcaklık değerini reddeder. Bu nedenle eklenti bu modeller için sıcaklık göndermez ve varsayılan modelin sıcaklık alanı boştur.
- Azure OpenAI: uç nokta `https://<resource>.openai.azure.com/openai` biçimindedir ve model alanına dağıtım adı yazılır.
- Ollama: Ollama varsayılan olarak eklenti sayfalarından gelen çapraz kaynak isteklerini reddeder. Ollama'yı `OLLAMA_ORIGINS=moz-extension://*` ortam değişkeniyle başlatın.
- Moonshot: varsayılan uç nokta Çin sitesi olan `api.moonshot.cn` adresidir; uluslararası sitedeki hesaplar `https://api.moonshot.ai/v1` adresini kullanır.
- Volcengine Doubao: model alanına bir model adı ya da Ark konsolunda oluşturulmuş bir çıkarım uç noktasının kimliği yazılır.

### Düşünme modu

Her yapay zekâ sağlayıcısının varsayılan olarak kapalı bir "Düşünme modu" anahtarı vardır. Çeviri için modelin önce düşünmesi gerekmez; düşünme istekleri yavaşlatır ve pahalı hale getirir. Güncel modellerin bir kısmı aksi belirtilmedikçe düşünür, örneğin `deepseek-flash`, `claude-haiku-5-5` ve `gemini-2.5-flash`; bu yüzden "kapalı" değeri açıkça gönderilir.

Her sağlayıcı bu anahtarı farklı yazar ve aynı sağlayıcının da yalnızca bazı modelleri onu kabul eder. Eklenti model adını aşağıdaki kalıplarla karşılaştırır ve ilk eşleşmenin sağlayıcı seçeneklerini gönderir; eşleşmeyen bir model düşünme parametresi almaz. Düşünme açıkken tablodaki bir kalıpla eşleşen modellere sıcaklık gönderilmez, çünkü düşünen modeller sıcaklığı yok sayar veya reddeder.

| Sağlayıcı | Modeller | Kapalı | Açık | Kaynak |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` ve sonrası | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
|  | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | aynı |
|  | `o1`, `o3`, `o4-mini` … | `"low"` (kapatılamaz) | `"medium"` | aynı |
| Anthropic | Claude 5 serisi, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
|  | Claude 3.7 ve 4.x | hiçbir şey (varsayılan olarak kapalı) | `{ type: "enabled", budgetTokens: 1024 }` | aynı |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }` (en düşük değer, kapatılamaz) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
|  | diğer `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | aynı |
|  | Gemini 3 ve sonrası | `{ thinkingLevel: "low" }` (tamamen kapatılamaz) | `{ thinkingLevel: "high" }` | aynı |
| DeepSeek | tümü | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
|  | `grok-3-mini` | `"low"` | `"high"` | aynı |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"` ile birlikte `reasoningFormat: "parsed"` | [Groq reasoning](https://console.groq.com/docs/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | aynı |
| Mistral AI | tümü (SDK parametreyi yalnızca kabul eden modellere gönderir) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | aynı |
| DeepInfra | tümü (düşünmeyen modeller yok sayar) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | aynı |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
|  | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | aynı |
| DashScope | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | tümü | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | her zaman düşünen modeller (`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro ve 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
|  | diğer tüm modeller (düşünmeyen modeller yok sayar) | `{ enabled: false }` | `{ enabled: true }` | aynı |
| Zhipu GLM | GLM-4.5 ve sonrası | `zhipu.thinking: { type: "disabled" }`; GLM-5.3 için hiçbir şey, çünkü bu model parametreyi reddeder | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5+, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| Volcengine Doubao | Seed ve düşünen modeller | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark documentation](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio ve özel OpenAI uyumlu hizmetler için eklentinin kullandığı uç noktada belgelenmiş bir düşünme parametresi yoktur. Bu hizmetlerin anahtarı devre dışıdır ve ayarlar sayfası bunu belirtir.

OpenAI uyumlu ön ayarlarda (Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao) seçenekler ön ayar kimliğinin altına yazılır ve `@ai-sdk/openai-compatible` bunları istek gövdesine olduğu gibi kopyalar; yalnızca `reasoningEffort` anahtarını `reasoning_effort` olarak yeniden adlandırır.

## Gruplamanın çalışma ilkesi

Bir ileti genellikle on ile birkaç düzine arasında paragraf içerir. Her paragraf için ayrı istek gönderildiğinde her paragraf sistem isteminin ve talimatların kendi kopyasını taşır ve her paragraf hız sınırından bir istek harcar. Gruplama, birbirine yakın zamanda gelen paragrafları tek bir istekte birleştirir. Böylece iki maliyet de paragraf başına değil, grup başına ödenir.

### Akış

1. İçerik betiği çevrilecek her paragrafı arka plan betiğine iletir.
2. Arka plan betiği önce önbelleğe bakar ve isabet olursa doğrudan yanıt verir. Önbellek anahtarı sağlayıcıdan, modelden, hedef dilden, sistem isteminin bir imzasından, hassas modda iletinin özet değerinden ve paragraf metninin bir özet değerinden (hash) oluşur. Aynı metin zaten çevriliyorsa sonraki istekler aynı sonucu paylaşır.
3. Önbellekte bulunmayan paragraflar grup kuyruğuna girer ve sağlayıcı + model + uç nokta + hedef dil bileşimine göre, yapay zekâ hizmetlerinde ayrıca sistem istemine, Microsoft Translator’da ayrıca ücretsiz veya anahtarlı moda, hassas modda ayrıca iletiye göre gruplanır. Bir grubun paragrafları 50 ms boyunca birikir. Grup şu durumlarda gönderilir: aralık sona erdiğinde, paragraf sınırına ulaşıldığında veya bir sonraki paragraf karakter sınırını aşacaksa. Karakter sınırından uzun tek bir paragraf kendi başına bir grup oluşturur.
4. İstek kuyruğu her grubu yürütür. Eşzamanlı istek sayısını sınırlar ve 408, 429, 5xx ve ağ hatalarını üstel geri çekilmeyle yeniden dener; sunucu `Retry-After` gönderirse belirtilen süre kadar, en fazla 30 saniye bekler. 401 ve 400 gibi hatalar yeniden denenmeden bildirilir.
5. Sonuçlar bellekteki önbelleğe alınır ve 1 saniye sonra tek bir yazma işlemiyle `storage.local` içine yazılır. Önbellek en uzun süredir kullanılmayan (LRU, Least Recently Used) kayıtları çıkarır.

### Her hizmetin paragrafları birleştirme biçimi

- Google: birden fazla `q` parametresi içeren tek bir POST isteği; dönen dizi girdiyle bire bir eşleşir.
- Microsoft: istek gövdesinin kendisi bir dizidir.
- DeepLX: uç nokta istek başına bir paragraf kabul eder, bu nedenle bir grubun paragrafları eşzamanlı olarak istenir.
- Yapay zekâ sağlayıcıları: paragraflar numaralandırılıp tek bir iletiye konur ve modelden aynı uzunlukta bir JSON dizisi döndürmesi istenir. Ayrıştırıcı sırasıyla şunları dener: bir JSON dizisi (bir kod bloğunun içinde veya açıklamalarla çevrili olabilir; dizelerin içindeki çıplak satır sonları ve sondaki virgüller onarılır), numaralandırılmış `<seg>` blokları, numaralandırılmış satırlar ve `%%` ayırıcısı. Bunların hepsi başarısız olursa veya sayı tutmazsa o grup paragraf başına bir istekle yeniden gönderilir ve kullanıcı aynı sonucu görür. Kimlik doğrulama hataları gibi ayrıştırma dışındaki hatalar bu geri dönüşü tetiklemez; böylece aynı hata N kez tekrarlanmaz.

### Maliyet tahmini

Sistem istemi ve talimatlar $s$ token, her paragraf ortalama $t$ token tutsun. Toplam paragraf sayısı $N$, grup boyutu $B$ olsun. Numaralandırma ve JSON tırnakları için paragraf başına $c$ ek token gereksin.

Her paragraf için ayrı istek gönderildiğinde toplam girdi token sayısı şudur:

$$
I_{\text{tekli}} = N(s + t).
$$

Gruplama ile $\lceil N/B \rceil$ istek gönderilir ve toplam girdi token sayısı şudur:

$$
I_{\text{grup}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

Aradaki fark şudur:

$$
I_{\text{tekli}} - I_{\text{grup}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

$s$, $c$ değerinden belirgin biçimde büyük olduğu sürece daha büyük gruplar daha fazla tasarruf sağlar. $s = 150$, $t = 60$, $c = 10$, $N = 20$ ve $B = 30$ için:

$$
I_{\text{tekli}} = 20 \times 210 = 4200, \qquad I_{\text{grup}} = 150 + 20 \times 70 = 1550.
$$

Girdi token sayısı yaklaşık %63 azalır ve istek sayısı 20'den 1'e düşer. Çevirinin uzunluğu değişmediği için çıktı token sayısı iki durumda da yaklaşık aynıdır. Daha az istek ücretsiz uç noktalar için de önemlidir: Google ve Microsoft ücretsiz uç noktalarını istek hızına göre sınırlar ve 20 paragraflık bir ileti tek bir istekle çevrilir.

## Gizlilik

- API anahtarları yalnızca geçerli Thunderbird profilinin `storage.local` alanında saklanır ve yalnızca ilgili sağlayıcının uç noktasına giden isteklerle gönderilir.
- İçerik betiği ileti sayfasının içinde çalışır; arka plan betiğinden aldığı ayarlar hiçbir zaman anahtar içermez.
- İleti metni yalnızca geçerli çeviri hizmetine ve yarışlı çeviri açıkken seçilen hızlı hizmete gönderilir. Eklenti istatistik toplamaz ve bu hizmetler dışında hiçbir ağ adresiyle bağlantı kurmaz.
- Çeviri önbelleği yerel olarak saklanır ve ayarlar sayfasından kapatılabilir veya temizlenebilir.
- İleti metni bilgisayarınızdan çıkar ve seçili çeviri hizmetine gider. Hassas iletiler için Ollama veya LM Studio gibi yerel modeller her isteği kendi makinenizde tutar.

## Bilinen sınırlamalar

- Çeviriler düz metindir. Özgün metindeki bağlantılar, kalın yazı ve diğer satır içi biçimlendirmeler çeviride korunmaz. İki dilli modda özgün metin tümüyle kullanılabilir kalır; yalnızca çeviri modunda özgün metni görmek için fare imlecini üzerine getirebilir veya iki dilli moda geri dönebilirsiniz.
- Ücretsiz Google ve Microsoft uç noktaları belgelenmemiştir; değişebilir veya hız sınırlamasına uğrayabilir. Microsoft, `edge.microsoft.com/translate/auth` belirteç uç noktasını Temmuz 2026'da kullanımdan kaldırmıştır (404 döndürür). Eklenti ilk istekte belirteç uç noktasını yine de dener, başarısızlıktan sonra doğrudan uç noktaya geçer ve bir saat boyunca belirteç uç noktasını yeniden denemez.
- Bir paragrafın zaten hedef dilde olup olmadığına karar verirken Çince, Japonca, Korece ve benzeri yazı sistemleri karakter sınıfına göre değerlendirilir; Latin ve Kiril alfabesi kullanan diller için önce eklenti API'sinin `i18n.detectLanguage` işlevi kullanılır. Bu API kullanılamadığında veya sonucu güvenilir olmadığında yalnızca İngilizce güvenilir biçimde algılanır; Latin alfabesi kullanan diğer dillerdeki paragraflar her zamanki gibi çeviriye gönderilir.
- İçerik betiği `messageDisplayScripts` aracılığıyla kaydedilir ve yalnızca kayıttan sonra açılan iletilere ulaşır. Eklenti başlangıçta betiği zaten açık olan iletilere eklemeyi dener; bu başarısız olursa iletiyi yeniden seçmek yeterlidir.
- Eklentinin ürettiği hata iletileri çevrilir. Bir çeviri hizmetinin veya AI SDK'nın döndürdüğü hata metinleri (örneğin bir HTTP 401 yanıtının gövdesi) alındığı gibi, genellikle İngilizce olarak gösterilir.
- Eklenti adı, Eklenti yöneticisindeki açıklaması ve kısayol açıklamaları arayüz dili seçeneğini değil, Thunderbird'ün arayüz dilini izler.
- Hassas çeviri bir iletiyi gövde metninin özet değeriyle tanımlar, çünkü içerik betiğinin ileti kimliğine erişimi yoktur. Aynı metnin iki kopyası çevirilerini ve analizini paylaşır.
- İstem önbelleği sağlayıcıya bağlıdır. Anthropic yalnızca modele göre değişen bir en küçük uzunluğun üzerindeki önekleri önbelleğe alır; daha kısa önekler normal şekilde gönderilir ve ücretlendirilir.
- Düşünme anahtarı model adlarının eşleştirilmesiyle çalışır. Adı hiçbir kalıba uymayan yeni bir model, `src/background/providers/thinking.ts` içindeki tablo genişletilene kadar düşünme parametresi almaz.
- Yarışlı çeviri hızlı hizmete giden istekleri iki katına çıkarır; bu istekler ücretsiz Google ve Microsoft uç noktalarının hız sınırlarına sayılır.

## Testler

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

Birim testleri şunları kapsar: grup oluşturma ve kuyruklar; yapay zekâ çıktısının ayrıştırılması ve geri dönüş; paragraf algılama ile iki dilli ve yalnızca çeviri görüntüleme ve geri yükleme (jsdom içinde); Google, Microsoft ve DeepLX için istek oluşturma ve yanıt ayrıştırma (taklit edilmiş fetch ile); her yapay zekâ ön ayarının istek URL'si ve kimlik doğrulama başlıkları; her sağlayıcının düşünme parametreleri; ayarların eklenen hizmetlere taşınması; açılır pencere ve ayarlar sayfasındaki eklenen hizmet listeleri ile kaldırma koruması; yarışlı çeviri (önce hızlı sonuç, önce yapay zekâ sonucu, yapay zekâ hatası, önbellek isabeti, görünüm modu değişikliği ve geri yükleme); hassas çeviri (tek istek, gruplarla analiz, başarısız analiz, önbellek anahtarları ve iletiye göre gruplar, Anthropic önbellek denetimiyle aynı istem öneki); yerelleştirme. Yerelleştirme testleri tüm dillerde anahtar kümelerinin ve yer tutucuların aynı olduğunu, bildirimdeki her `__MSG_*__` başvurusunu, Thunderbird dillerinin desteklenen dillere eşlenmesini, eksik anahtarlar için İngilizceye geri dönüşü ve HTML sayfalarında ve kaynak kodda sabit kodlanmış arayüz metni bulunmadığını denetler.

`npm run build:debug`, bir ileti açılır açılmaz çeviriye başlayan ve ilerlemeyi konsola yazan bir hata ayıklama xpi'si üretir; bu sürüm tüm akışı gerçek bir Thunderbird'de denetlemek içindir.

## Proje yapısı

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
docs/            demo GIF used in this README
tests/           vitest tests
```

## Arayüzü çevirme

Arayüz metinleri `locales/<language>.json` dosyalarında bulunur; her dil için anahtar → metin biçiminde tek düzeyli bir nesne vardır. `locales/en.json` başvuru dosyasıdır: diğer her dosya tam olarak aynı anahtarlara sahiptir. `$1` ile `$9` arası yer tutuculardır ve her çeviride İngilizcedeki numaralarla yer almalıdır; `{{apiKey}}` ve `{{to}}` olduğu gibi kalan sabit belirteçlerdir. Google Translate, OpenAI veya DeepLX gibi ürün adları çevrilmez.

`npm run build` bu dosyaları Thunderbird'ün okuduğu biçim olan `dist/_locales/<language>/messages.json` dosyalarına dönüştürür. Eklentinin kendi i18n çalışma zamanı aynı dosyaları çalışma sırasında yükler; bu sayede arayüz dili Thunderbird yeniden başlatılmadan değişebilir. Eksik anahtarlar için İngilizce metin kullanılır.

Yeni bir dil eklemek için tüm anahtarları içeren `locales/<code>.json` dosyasını oluşturun, kodu kendi dilindeki adıyla birlikte `src/shared/locales.ts` içindeki `SUPPORTED_LOCALES` listesine ekleyin ve `npm run locales:check` ile `npm test` komutlarını çalıştırın.

## Teşekkürler

Paragraf algılamanın, grup kuyruğunun, istemlerin ve sağlayıcı yapılandırmasının tasarımı, GPL-3.0 lisansıyla yayımlanan ve web sayfalarını çeviren bir tarayıcı eklentisi olan [Read Frog](https://github.com/mengxi-ream/read-frog) projesini temel alır. Bu proje söz konusu fikirleri Thunderbird'ün ileti okuyucusuna taşır ve e-postaya uyarlar; örneğin düz metin iletileri boş satırlardan böler ve sabit satır sonlarıyla bölünmüş satırları birleştirir.

## Lisans

GPL-3.0-or-later. Tam metin için [LICENSE](../LICENSE) dosyasına bakın.
