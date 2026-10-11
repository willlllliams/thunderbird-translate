# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | Türkçe | [Tiếng Việt](README.vi.md)

Thunderbird Translate, okuduğunuz iletinin gövdesini doğrudan ileti bölmesinde çeviren bir Thunderbird eklentisidir. Çeviri her özgün paragrafın altında gösterilebilir (iki dilli) ya da paragrafın yerini alabilir (yalnızca çeviri). Çeviri kapatıldığında özgün ileti olduğu gibi geri gelir. Çeviri aynı anda üç kademede yürür: çevrimdışı bir sözlük, bir makine çevirmeni (Google Translate, Microsoft Translator, DeepLX veya çevrimdışı Bergamot modelleri) ve bir yapay zekâ hizmeti (OpenAI, Claude, Gemini, DeepSeek ve Qwen dahil 22 sağlayıcı). İlk gelen sonuç önce gösterilir; en yüksek kademenin sonucu gelince onun yerini alır. Varsayılan hizmet ücretsiz Google Translate'tir ve kurulumdan hemen sonra çalışır.

Bu belge daha önce Thunderbird eklentisi kullanmamış okurlar için yazılmıştır. Sırasıyla kurulum, kullanım, yapılandırma ve çalışma ilkesini anlatır.

![Demo: iletiyi çevirme, iki dilli ve yalnızca çeviri arasında geçiş, hedef dili değiştirme](../docs/demo.gif)

## Özellikler

- Gövde çevirisi: eklenti ileti gövdesindeki paragraf düzeyindeki içeriği bulur. Bunlar paragraflar, liste öğeleri, tablo hücreleri, başlıklar, alıntı blokları, yalnızca metin içeren div öğeleri ve düz metin iletilerde boş satırlarla ayrılmış paragraflardır. Kod, zaten hedef dilde olan paragraflar, sayılar, çıplak bağlantılar ve boşluklar atlanır.
- İki görünüm modu: iki dilli modda özgün metnin altına açık renkli sol kenarlığı olan bir çeviri bloğu eklenir; bu blok koyu temalarda da okunur. Yalnızca çeviri modunda özgün metnin yerine çeviri gösterilir; özgün metin bellekte tutulur ve çeviri kapatıldığında geri konur.
- Anlık güncelleme: bir ileti çevrilmişken görünüm modu veya hedef dil değiştirilirse sayfa, ileti yeniden açılmadan yeniden çizilir. Görünüm modunun değiştirilmesi, sözlük ve makine çevirisinden önceden alınmış çevirileri yeniden çizer; yapay zekâ kademesine yeni modun istemiyle yeniden sorulur ve önbellek bu çeviriye zaten sahipse yanıtı o verir.
- Giriş noktaları: ileti başlığı araç çubuğundaki "İletiyi çevir" düğmesi ve açılır penceresi, ayrıca Alt+A (çevir / özgün metni göster) ve Alt+S (iki dilli / yalnızca çeviri arasında geç) kısayolları.
- Açılışta otomatik çevir (isteğe bağlı): hedef dilde olmayan iletiler açıldıkları anda çevrilir.
- İstek gruplama: arka plan betiği paragrafları 50 ms boyunca toplar ve tek bir istekte birleştirir. Eşzamanlı istek sınırı, üstel geri çekilmeli yeniden deneme ve yerel önbellek de bu sürecin parçasıdır.
- Üç çeviri kademesi: sözlük, makine çevirisi ve yapay zekâ. Her kademenin kendi hizmeti vardır ya da kademe kullanılmaz; her paragraf kullanılan tüm kademelere aynı anda gider. Alt kademenin sonucu, en yüksek kademe onun yerini alana kadar geçici çeviri olarak gösterilir ve en yüksek kademe başarısız olursa yerinde kalır.
- Hizmetler: çevrimdışı bir sözlük, 4 makine çevirmeni (Google Translate, Microsoft Translator, DeepLX, çevrimdışı Bergamot modelleri) ve 22 yapay zekâ sağlayıcısı ön ayarı; bu ön ayarlardan biri "Özel OpenAI uyumlu" seçeneğidir. Kademe listelerinde yalnızca eklediğiniz hizmetler görünür.
- Kaynak dil: otomatik algılama veya sabit bir dil; seçilen değer her hizmete iletilir.
- Yapay zekâ kademesi için üç istem: biri iki dilli görünüm, biri yalnızca çeviri görünümü, biri de hassas çeviri için.
- İstem hazır ayarları: hedef dilin bölgesel bir çeşidi, zor sözcüklerin ardından parantez içinde özgün terim, zor sözcüklere kısa açıklamalar ve dört yazım üslubu için hazır kurallar. Bir hazır ayar üç istemden herhangi birine eklenir.
- Kurulum rehberi: kurulumdan sonra açılır ve dilleri, görünüm modunu, kademeleri, çevrimdışı indirmeleri, hizmetleri ve istemleri adım adım ayarlar. Son adımda örnek bir iletinin deneme çevirisini yapar.
- Hassas çeviri (yapay zekâ kademesi): her isteğin bağlamı iletinin tamamıdır; bu sayede adlar, terimler ve hitap biçimleri paragraflar arasında tutarlı kalır.
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

`npm run build`, arka plan betiğini, içerik betiğini, açılır pencereyi, ayarlar sayfasını, kurulum rehberini ve Bergamot çalışanını (worker) esbuild ile `dist/` dizinine paketler, `locales/` içindeki dosyalardan `dist/_locales/<language>/messages.json` dosyalarını üretir ve `dist/` dizinini `web-ext-artifacts/thunderbird-translate-<version>.xpi` olarak paketler. Paketleme saf JavaScript ile yazılmış fflate kitaplığını kullanır ve sistemde zip komutu gerektirmez. Arka plan betiği bir ES modülüdür: AI SDK, `dist/chunks/` altında ayrı bir parçadadır (chunk) ve yapay zekâ kademesi kullanılmaya başlandığında yüklenir; böylece Thunderbird eklentiyi onsuz başlatır. İlk build, sabitlenmiş Bergamot motorunu (wasm) Mozilla'dan indirip `.cache/` içine koyar, bkz. [docs/bergamot.md](../docs/bergamot.md).

Geliştirme sırasında eklenti paketlenmeden yüklenebilir: Thunderbird'de Araçlar → Geliştirici araçları → Eklentilerde hata ayıkla'yı açın, "Geçici eklenti yükle…" düğmesine tıklayın ve `dist/manifest.json` dosyasını seçin.

## Kurulum rehberi

Yeni bir kurulumdan sonra Thunderbird kurulum rehberini bir sekmede açar. Eklentinin veya Thunderbird'ün güncellenmesi rehberi açmaz. Rehber daha sonra açılır penceredeki "Kurulum rehberi" bağlantısıyla ve ayarlar sayfasının üst kısmındaki "Kurulum rehberi" düğmesiyle açılabilir.

Her adım tek bir karar ister ve seçimi hemen kaydeder. "Geri", "İleri" ve "Bu adımı atla" adımlar arasında geçiş yapar. İlerleme çubuğunun altındaki numaralı liste herhangi bir adıma atlar. "Rehberden çık" sekmeyi istendiği an kapatır. Rehber bir sonraki açılışta bırakıldığı adımdan devam eder; "Bitir" düğmesine basıldıktan sonra baştan başlar.

| Adım | İçerik | Gösterildiği durum |
| --- | --- | --- |
| 1 Diller | arayüz dili, kaynak dil (varsayılan olarak "Otomatik algıla"), hedef dil | her zaman |
| 2 Görünüm | iki dilli veya yalnızca çeviri; örnek bir iletinin geçerli çeviri stiliyle önizlemesi | her zaman |
| 3 Çeviri kademeleri | sözlük, makine çevirisi ve yapay zekâ kademelerinin hızı, kalitesi, gizliliği ve maliyeti; her kademenin hizmeti veya "Kullanılmıyor"; en az bir kademenin hizmeti olmalıdır | her zaman |
| 4 Çevrimdışı çeviri | 1. adımdaki dillerin gerektirdiği sözlük paketleri ve Bergamot yönleri, boyut, lisans ve kaynak belirtimiyle; işaretlenenler "Seçilenleri indir" ile ilerleme gösterilerek indirilir | sözlük kademesi kullanılıyor veya makine çevirisi kademesi Bergamot kullanıyor |
| 5 Çevrimiçi makine çevirisi | makine çevirmeninin alanları: Google için doldurulacak alan yoktur; Microsoft için "Varsayılan arayüz (ücretsiz)" veya "Kendi anahtarımı kullan (Azure Translator)" seçilir; DeepLX için uç nokta ve belirteç girilir; "Bağlantıyı test et" | makine çevirisi kademesi Google, Microsoft veya DeepLX kullanıyor |
| 6 Yapay zekâ çevirisi | yapay zekâ sağlayıcısı, API anahtarı, model, sıcaklık ve düşünme modu, "Bağlantıyı test et" ve "Hassas çeviri" anahtarı; düşünme modunun ve hassas çevirinin çeviriyi yavaşlattığını ve pahalılaştırdığını belirten bir not | yapay zekâ kademesi kullanılıyor |
| 7 İstemler | üç istem ve hazır ayar kitaplığı (bkz. "İstem hazır ayarları") | yapay zekâ kademesi kullanılıyor |
| 8 Hazır | çeviri yolları (araç çubuğu düğmesi, Alt+A, Alt+S), "Hedef dilde olmayan iletileri otomatik olarak çevir" anahtarı ve "Örnek iletiyi çevir" düğmesi | her zaman |

Önceki seçimlerin gerektirmediği bir adım listede üstü çizili olarak kalır ve gezinme onu atlar. Örneğin 3. adımda bir yapay zekâ hizmeti seçilirse 6. ve 7. adımlar yeniden etkin olur.

Kaynak dil Japonca, hedef dil Basitleştirilmiş Çince olduğunda 4. adım şunları önerir:

- sözlük: sürümde Japonca → Çince paketi varsa bu paket, yoksa Japonca → İngilizce ve İngilizce → Çince paketleri;
- Bergamot: ja → en ve en → zh-Hans yönleri, çünkü her Bergamot modelinin bir tarafı İngilizcedir.

"Otomatik algıla" seçiliyken 4. adım İngilizceden başlayan paketleri ve yönleri listeler. Listenin altındaki bir not, aldığınız diğer her dil için o dilden İngilizceye giden yönün kurulmasını ister.

Son adımdaki (8. adım) "Örnek iletiyi çevir" düğmesi sayfada kısa bir ileti gösterir (kaynak dil İngilizce veya Almanca ise kaynak dilde, değilse İngilizce, hedef dil İngilizceyse Almanca) ve onu geçerli ayarlarla çevirir. Sayfa, içerik betiğinin paragraf algılama ve görüntüleme modüllerini kullanır ve istekleri arka plan betiğine görüntülenen bir iletiyle aynı bağlantı üzerinden gönderir. Bu yüzden sonuç, kullanılan kademeler dahil, gerçek bir iletinin nasıl görüneceğini gösterir.

Rehber ayarlar sayfasıyla aynı bileşenleri kullanır: hizmet alanları ve bağlantı testi, sözlük ve Bergamot listeleri, hazır ayarlarıyla birlikte istem düzenleyicisi.

## Kullanım

Bir ileti açın. İleti başlığı araç çubuğunda "İletiyi çevir" düğmesi görünür. Bu düğmeye tıklandığında aşağıdaki denetimleri içeren bir açılır pencere açılır:

- "Bu iletiyi çevir": çeviriyi başlatır. Bir çeviri sürerken veya gösterilirken düğmenin adı "Özgün metni göster" olur ve tıklandığında özgün metni geri getirir.
- Görünüm: iki dilli ile yalnızca çeviri arasında geçiş yapar; değişiklik geçerli iletiye hemen uygulanır.
- Kaynak dil ve hedef dil: varsayılan kaynak dil "Otomatik algıla"dır. İkisinden biri değiştirildiğinde, çevrilmekte olan ileti yeniden çevrilir. İkisi aynı dil olduğunda bir uyarı görünür.
- Çeviri kademeleri: her kademe için bir liste vardır (Kademe 1: Sözlük, Kademe 2: Makine çevirisi, Kademe 3: Yapay zekâ çevirisi). Her liste "Kullanılmıyor" seçeneğini ve o kademeye eklenmiş hizmetleri içerir. En az bir kademenin bir hizmeti olmalıdır; kullanılan son kademe için "Kullanılmıyor" seçilirse seçim reddedilir ve bir uyarı gösterilir. Listelerin altındaki "+ Çeviri hizmeti ekle" ayarlar sayfasını çeviri hizmetleri bölümünde açar.
- Hassas çeviri: yapay zekâ kademesinin bir hizmeti olduğunda görünür.
- Hedef dilde olmayan iletileri otomatik olarak çevir: işaretliyse, gövdesi hedef dilde olmayan bir ileti açıldığı anda çevrilir.
- "Kurulum rehberi": kurulum rehberini yeni bir sekmede açar.

Açılır pencere ilerlemeyi gösterir, örneğin "Çevrildi: 8 / 12". Hâlâ bir alt kademenin geçici çevirisini gösteren paragraflar ayrı sayılır, örneğin "Çevrildi: 7 / 9 (2 geçici)". Bir paragraf için tüm kademeler başarısız olursa paragrafın arkasında kırmızı renkte "Çeviri başarısız oldu, yeniden denemek için tıklayın" yazısı belirir. Fare imleci üzerine getirildiğinde hata gösterilir; tıklandığında o paragraf yeniden denenir.

Alt+A geçerli iletiyi çevirir veya özgün metni geri getirir; Alt+S iki dilli ile yalnızca çeviri arasında geçiş yapar. İki kısayol da Eklenti yöneticisinin dişli menüsündeki "Eklenti kısayollarını yönet" bölümünden değiştirilebilir.

Yalnızca çeviri modunda fare imleci bir çevirinin üzerine getirildiğinde özgün metin bir araç ipucunda gösterilir.

## Ayarlar

Ayarlar sayfası, Eklenti yöneticisinde bu eklentinin "Seçenekler" düğmesiyle açılır. Ayarlar otomatik olarak kaydedilir; yazıldıklarında sağ üst köşede "Kaydedildi" görünür. Bu yazının yanındaki "Kurulum rehberi" düğmesi kurulum rehberini açar.

| Bölüm | İçerik |
| --- | --- |
| Genel | Arayüz dili, kaynak dil, hedef dil, varsayılan görünüm modu, "Hedef dilde olmayan iletileri otomatik olarak çevir" anahtarı |
| Çeviri kademeleri | Her kademenin hizmeti veya "Kullanılmıyor"; hassas çeviri |
| Çeviri hizmetleri | İki grupta hizmetler, "Eklenenler" ve "Eklenebilenler"; her hizmetin uç noktası, API anahtarı, modeli, sıcaklığı ve düşünme modu; "Bağlantıyı test et", "Ekle", "Bu hizmeti kullan" ve "Kaldır" düğmeleri |
| Sözlükler | Sözlük kademesinin dil çiftleri, boyut, lisans ve kaynak belirtimiyle; indirme ve silme; paketlerin sürüm etiketi (gelişmiş) |
| Çevrimdışı çeviri modelleri (Bergamot) | Bergamot modellerinin yön çiftleri, boyut ve sürümle; dile göre süzme; indirme, güncelleme, iptal ve silme; geçerli dillerin gerektirdiği yönler |
| İstemler (yapay zekâ kademesi) | Hazır ayar kitaplığı; iki dilli görüntüleme, yalnızca çeviri görüntüleme ve hassas çeviri istemleri; her birinde "Yerleşik istemi geri yükle" düğmesi |
| İstek gruplama | Toplama aralığı, istek başına en fazla karakter ve paragraf sayısı, eşzamanlı istek sayısı, yeniden deneme sayısı, yapay zekâ isteklerinin birleştirilip birleştirilmeyeceği |
| Çeviri stili | Sol kenarlık, kesikli sol kenarlık, vurgulama veya sade; vurgu rengi, metin opaklığı, yazı tipi boyutu oranı; anlık önizleme |
| Önbellek | Önbelleği açma veya kapatma, önbellekteki en fazla paragraf sayısı, geçerli kayıt sayısı, önbelleği temizleme |

"Bağlantıyı test et", giriş alanlarındaki geçerli değerlerle tek bir test cümlesi gönderir. Başarılı olursa çeviriyi gösterir; başarısız olursa hizmetin döndürdüğü hatayı gösterir, örneğin geçersiz bir anahtar veya bilinmeyen bir model adı.

## Hizmet ekleme ve kaldırma

Çeviri hizmetleri bölümündeki yan liste iki gruptan oluşur. "Eklenenler", açılır pencerenin ve ayarlar sayfasının hizmet listelerinde görünen hizmetleri; "Eklenebilenler" geri kalan tüm hizmetleri içerir. Bir hizmet seçildiğinde yapılandırması ve düğmeleri gösterilir:

- Eklenmemiş bir hizmetin "Ekle" düğmesi vardır. Bir API anahtarı yazmak (DeepLX için uç nokta yazmak) da hizmeti ekler.
- Eklenmiş bir hizmetin "Bu hizmeti kullan" ve "Kaldır" düğmeleri vardır. "Bu hizmeti kullan", hizmeti ait olduğu kademeye yerleştirir. Kaldırma, hizmeti listelerden çıkarır ama yapılandırmasını korur; hizmet yeniden eklendiğinde anahtar ve model geri gelir.
- Bir kademenin kullandığı hizmet kaldırılamaz. Bu durumda "Kaldır" düğmesi devre dışı kalır ve altındaki bir satır hizmeti kullanan kademeyi belirtir. Kullanımdaki hizmetler yan listede "Kullanımda" etiketi taşır.

Yeni bir kurulum Google Translate ve Microsoft Translator eklenmiş olarak başlar. Sözlük ve Bergamot, indirilmesi gereken verilere ihtiyaç duyduğu için elle eklenir. 1.1 veya daha eski bir sürümün ayarları yüklendiğinde bir hizmet şu durumlarda eklenmiş sayılır:

| Hizmet | Şu durumda eklenmiş sayılır |
| --- | --- |
| Google Translate, Microsoft Translator | her zaman |
| DeepLX | bir uç nokta girilmişse |
| Anahtar gerektiren yapay zekâ hizmetleri | bir API anahtarı kaydedilmişse |
| Ollama, LM Studio, özel OpenAI uyumlu | uç nokta, model veya sıcaklık değiştirilmişse |
| kademelerin hizmetleri | her zaman |

## Çeviri kademeleri

| Kademe | Hizmetler | Sağladığı sonuç |
| --- | --- | --- |
| 1 Sözlük | Sözlük (çevrimdışı) | kurulu sözlük paketlerinden sözcük sözcük bir karşılık; hemen ve ağ bağlantısı olmadan kullanılabilir |
| 2 Makine çevirisi | Google Translate, Microsoft Translator, DeepLX, Bergamot (çevrimdışı) | bir iki saniye içinde tam bir çeviri |
| 3 Yapay zekâ çevirisi | 22 yapay zekâ sağlayıcısı | görünüm modunun istemine uyan en iyi çeviri |

Her kademede bir hizmet ya da "Kullanılmıyor" seçilidir ve en az bir kademenin bir hizmeti vardır. Varsayılan ayarda yalnızca 2. kademe kullanılır ve hizmeti Google Translate'tir.

Her paragraf kullanılan tüm kademelere aynı anda gider. Her kademe normal gruplamayı ve önbelleği kullanır. İletide gösterilen içerik tek bir kurala uyar: yanıt vermiş en yüksek kademe kazanır.

| Durum | İletide görünen |
| --- | --- |
| Bir alt kademe önce yanıt verir | onun çevirisi, italik ve kademesini belirten bir etiketle ("Sözlük", "Makine çevirisi"); fare imleci üzerine getirildiğinde hangi kademenin hâlâ çalıştığı gösterilir. Daha yüksek bir kademenin çevirisi gelince onun yerini alır. |
| Kullanılan en yüksek kademe yanıt verir | onun çevirisi, etiketsiz: bu nihai çeviridir. Daha sonra yanıt veren alt kademeler yok sayılır. |
| En yüksek kademe başarısız olur | en iyi alt kademe çevirisi kalır ve "Yapay zekâ çevirisi başarısız oldu" (en yüksek kademe başka bir kademeyse "<kademe adı> başarısız oldu") ile işaretlenir; fare imleci üzerine getirildiğinde neden gösterilir, tıklandığında yalnızca başarısız kademeler yeniden denenir |
| Tüm kademeler başarısız olur | kırmızı "Çeviri başarısız oldu, yeniden denemek için tıklayın" işareti |
| En yüksek kademenin çevirisi zaten önbellekte | o çeviri hemen gösterilir; alt kademelere sorulmaz |

Görünüm modu değiştirildiğinde sözlük ve makine çevirileri olduğu gibi yeniden çizilir. Yapay zekâ kademesi her görünüm modu için ayrı bir istem kullanır; bu yüzden yeni modun istemiyle yeniden sorgulanır. O istem için önbellekte zaten bulunan bir çeviri istek gönderilmeden gelir. Açılır pencere nihai çevirileri çevrilmiş, alt kademe çevirilerini geçici olarak sayar.

1.3 veya daha eski bir sürümün kaydettiği ayarlar bir kez dönüştürülür. Geçerli hizmet bir yapay zekâ hizmetiyse 3. kademe olur; o sürümdeki yarışlı çeviri açıksa yarışlı çevirinin hızlı hizmeti de 2. kademe olur. Başka bir geçerli hizmet 2. kademe olur. Sözlük kademesi kullanılmadan başlar.

## Kaynak dil

Kaynak dil varsayılan olarak "Otomatik algıla"dır; hedef dil listesindeki 20 dilden biri de seçilebilir. Kaynak dil her hizmete iletilir:

| Hizmet | Otomatik algılama | Sabit dil |
| --- | --- | --- |
| Google Translate | `sl=auto` | `sl=<code>` |
| Microsoft Translator, ücretsiz ve anahtarlı | `from` parametresi gönderilmez | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (Çince varyantları `ZH` olarak) |
| Yapay zekâ hizmetleri | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Sözlük | her paragraf için ayrı algılanır | ayarlandığı gibi |
| Bergamot | `"auto"`; yedek olarak yazı sistemine ve İngilizce sık kullanılan sözcüklere (stop words) göre bulunan dil | ayarlandığı gibi |

Hedef dilde olduğu algılanan paragraflar eskisi gibi atlanır. Kaynak dil sabitlendiğinde, dili güvenilir biçimde algılanamayan paragraflar o dilde sayılır. Önbellek anahtarları ve gruplar kaynak dili içerir; bu yüzden kaynak dil değiştirildiğinde eski ayarla yapılmış çeviriler hiçbir zaman döndürülmez.

## İstemler

Yapay zekâ kademesinin üç sistem istemi vardır. Her biri ayarlar sayfasında düzenlenebilir ve "Yerleşik istemi geri yükle" ile ilk hâline döndürülebilir; boş bir alan da yerleşik istem anlamına gelir. `{{to}}` yerine hedef dilin İngilizce adı yazılır. Eklenti kaynak dili ve grup biçimini her isteğe kendisi ekler.

| İstem | Kullanıldığı yer | Yerleşik istemin istediği |
| --- | --- | --- |
| İki dilli görüntüleme | iki dilli modda yapay zekâ kademesi | özgün metne yakın, cümle cümle aynı sırayla ilerleyen, hiçbir şey eklemeyen ve çıkarmayan bir çeviri; okur çeviriyi özgün metinle karşılaştırır |
| Yalnızca çeviri görüntüleme | yalnızca çeviri modunda yapay zekâ kademesi | hedef dilde yazılmış bir e-posta gibi okunan akıcı metin; anlamın tamamı korunduğu sürece cümle öğelerinin sırası değiştirilebilir, cümleler bölünebilir veya birleştirilebilir |
| Hassas çeviri | hassas çeviri açıkken yapay zekâ kademesi, iki görünüm modunda da | terim listesi, özet ve komşu paragraflar kullanılarak ileti boyunca tutarlı terimler, adlar ve hitap biçimleri |

Önbellek anahtarları ve grup anahtarları istemin türünü ve metninin özet değerini içerir. Bu nedenle bir istem düzenlendiğinde eski metinle yapılmış çeviriler hiçbir zaman döndürülmez. 1.3 veya daha eski bir sürümün kaydettiği özel sistem istemi iki görünüm modunun da istemi olur; hassas çeviri istemi yerleşik metniyle başlar.

### İstem hazır ayarları

Hazır ayar kitaplığı ayarlar sayfasında üç istemin üstünde ve kurulum rehberinin 7. adımında bulunur. Bir hazır ayar şöyle uygulanır:

1. "Hazır ayar" listesinden bir hazır ayar seçin. Hazır ayarın çeşitleri varsa "Çeşit" listesinden bir çeşit seçin.
2. "Eklenecek istem" listesinden bir istem seçin.
3. "Hazır ayarı uygula" düğmesine tıklayın.

"Örnek:" satırı bir kaynak cümleyi ve seçilen hazır ayarın beklenen sonucunu gösterir.

| Hazır ayar | Çeşitler | İsteme eklenen kural |
| --- | --- | --- |
| Ağız veya bölgesel kullanım | hedef dile göre: Basitleştirilmiş Çince için Kantonca (Hong Kong) ve Sichuan ağzı; Geleneksel Çince için Kantonca (Hong Kong) ve Tayvan kullanımı; İngiliz İngilizcesi ve Amerikan İngilizcesi; Brezilya Portekizcesi ve Avrupa Portekizcesi; Meksika İspanyolcası ve İspanya İspanyolcası; Kanada Fransızcası (Quebec); İsviçre standart Almancası | o çeşitle, onun yazımı, sözcük dağarcığı ve hitap biçimleriyle yazmak |
| Zor sözcüklerde özgün terim | yok | normal çevirmek ve her zor sözcüğün veya teknik terimin ardından özgün terimi parantez içinde, paragraf başına bir kez vermek, örneğin "durum tespiti (due diligence)" |
| Zor sözcüklerin açıklaması | yok | paragrafı çevirmek, ardından paragraftaki zor sözcükleri aynı paragrafın sonunda tek bir parantez içinde hedef dilde açıklamak: 〔Not: terim: açıklama; …〕 |
| Yazım üslubu | resmî iş dili, gündelik, öğrenenler için sade dil, edebî | o üslubu kullanmak ve anlamın tamamını korumak |

Çeşit listesi hedef dile göre değişir. Japonca gibi bölgesel çeşidi olmayan bir hedef dilde "Ağız veya bölgesel kullanım" hazır ayarı sunulmaz.

Bir hazır ayar, istemin sonuna boş bir satırdan sonra İngilizce bir kural bloğu ekler. Blok `Style (this rule takes precedence over the rules above):` gibi bir başlıkla başlar. Bu yüzden blok, yerleşik istemdeki "Do not add explanations" gibi genel kuralların önüne geçer. Aynı hazır ayar yeniden uygulanınca kendi bloğunun yerini alır; farklı hazır ayarların blokları birbirine eklenir. İstem kutusu birleşik metni gösterir ve düzenlenebilir kalır. "Yerleşik istemi geri yükle" tüm eklemeleri kaldırır.

Hazır ayarlar paragraf başına tek çeviri ilkesini korur. Zor sözcüklerin açıklamaları kendi paragraflarının çevirisinin içinde kalır ve blok bunların ayrı bir paragraf veya dizi öğesi olarak döndürülmesini yasaklar. Bu yüzden bir grup yine paragraf başına tam olarak bir öğe içeren bir JSON dizisi (veya numaralandırılmış bölümler) olarak döner. Testler dört hazır ayarın hepsini tek bir isteme uygular ve taklit edilmiş bir modelin yanıtını iki biçimde de ayrıştırır.

## Hassas çeviri

Hassas çeviri yapay zekâ kademesine uygulanır ve iletiyi her yapay zekâ isteğine bağlam olarak ekler. Açılır pencereden veya ayarlar sayfasının "Çeviri kademeleri" bölümünden açılır. Çeviri başladığında içerik betiği bulduğu paragrafları iletinin düz metninde birleştirir (20000 karakterden sonra kesilir ve metnin devam ettiği belirtilir) ve bunu arka plan betiğine bir kez kaydeder. İleti, tam metninin özet değeriyle (hash) tanımlanır; kesme yalnızca bağlam olarak gönderilen metne uygulanır.

Akış, çevrilecek paragrafların boyutuna bağlıdır:

1. Paragraflar tek bir isteğe sığıyorsa ("İstek başına en fazla karakter" ve "İstek başına en fazla paragraf" sınırları içinde) tek bir istek hepsini çevirir; isteğin kendisi iletinin tamamını taşır.
2. Sığmıyorsa önce fazladan bir istek iletinin tamamını inceler ve iki üç cümlelik bir özet, adlar, ürünler ve diğer özel adlar için kullanılacak çevirileri içeren bir sözlük, ayrıca üslubu ve hitap biçimini döndürür. Bu yanıt okunamazsa çeviri onsuz sürer.
3. Ardından her istek aynı önekle başlar: sistem istemi, analiz ve yaklaşık 8000 karaktere kadar olan iletilerde tam metin. Önekten sonra grubun paragrafları gelir; her birinin öncesindeki ve sonrasındaki paragraf, çevrilmeyen birer başvuru olarak eklenir.

Önek, bir iletinin tüm isteklerinde karakter karakter aynıdır; tekrar eden istem öneklerini önbelleğe alan sağlayıcılar bu nedenle onu kendi önbelleklerinden sunabilir. Anthropic için önek `cacheControl: { type: "ephemeral" }` ile işaretlenir. Analiz de çeviriler gibi önbelleğe alınır; anahtarı sağlayıcıdan, modelden, hedef dilden ve ileti metninin özet değerinden oluşur ve bir iletinin grupları aynı analiz isteğini bekler.

Hassas modda yapılan çeviriler, ileti özet değerini içeren bir anahtarla önbelleğe alınır ve gruplar farklı iletilerin paragraflarını hiçbir zaman karıştırmaz. Bu yüzden aynı cümle başka bir iletide, o ileti bağlam olarak kullanılarak yeniden çevrilir. Analiz isteği ve daha uzun istemler hassas çeviriyi normal çeviriden daha pahalı yapar.

## Sözlük çevirisi

Sözlük hizmeti, Thunderbird profilinde saklanan sözlük paketleriyle sözcük sözcük çeviri yapar. Bir paket kurulduktan sonra ağa ihtiyaç duymaz ve milisaniyeler içinde yanıt verir; böylece makine çevirisi ve yapay zekâ kademeleri yanıt verene kadar geçen süreyi doldurur. Sonuç sözcük sözcük bir karşılıktır: sözcükler kaynak metindeki sırayla, dil bilgisi uygulanmadan dizilir.

### Paketler

Paketler bu deponun bir GitHub sürümünün (release) dosyaları olarak yayımlanır; varsayılan sürüm `dicts-v1`'dir. Sürüm etiketi, Sözlükler bölümündeki "Sözlük paketlerinin sürüm etiketi (gelişmiş)" alanından değiştirilebilir. Her yön tek bir `dict-<src>-<tgt>.tsv.gz` dosyasıdır; bu dosya gzip ile sıkıştırılmış UTF-8 bir metin dosyasıdır:

```text
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
w	<key>	<translation>
f	<key>	<lemmaKey>
```

İlk satır paketi tanımlar. `w` ile başlayan satırlar girdilerdir. `f` ile başlayan satırlar çekimli bir biçimi sözlük biçiminin (lemma) anahtarına eşler, örneğin `went` biçimini `go` anahtarına. Bir anahtar NFC ile normalleştirilir, kaynak dilin kurallarıyla küçük harfe çevrilir ve baştaki ve sondaki boşluklardan arındırılır; anahtar birkaç sözcükten oluşan bir ifade de olabilir. `dict-index.json` dizini her paketi boyutu, girdi ve biçim sayısı, SHA-256 sağlama toplamı, kaynağı, lisansı ve kaynak belirtimiyle listeler. Paketler İngilizce, Basitleştirilmiş ve Geleneksel Çince, Japonca, Korece, Fransızca, Almanca, İspanyolca, Portekizce, Rusça, Türkçe ve Vietnamcayı kapsar. Paketlerin nasıl oluşturulduğu [docs/dictionary-packs.md](../docs/dictionary-packs.md) belgesinde anlatılır.

Sözlükler bölümü dizini okur ve her paketi boyutu, lisansı ve kaynak belirtimiyle listeler. "İndir" dosyayı ilerleme göstererek indirir, SHA-256 sağlama toplamını ve başlığını denetler ve eklentinin `tt-dictionary` IndexedDB veritabanında saklar; "Sil" paketi kaldırır. Dizin yüklenemezse bölüm nedenini belirtir; kurulu paketler yine de silinebilir.

### Çeviri

1. Kaynak dil, ayarlanmış olan dildir; otomatik algılamada paragrafın dilidir (yazı sistemi, tarayıcının dil algılayıcısı, İngilizce sık kullanılan sözcükler).
2. `Intl.Segmenter` paragrafı sözcüklere ayırır. Her sözcükte önce, girdisi olan ve en fazla üç sözcükten oluşan en uzun ifade aranır, ardından tek sözcük. Girdisi olmayan bir sözcük sözlük biçimi üzerinden aranır; bu da başarısız olursa sözcük olduğu gibi kalır. Noktalama işaretleri ve sayılar olduğu gibi kalır.
3. Hedef dil Çince veya Japonca ise sözcükler boşluksuz, diğer hedef dillerde boşlukla birleştirilir.
4. İngilizce dışındaki iki dil arasında metin İngilizce üzerinden geçer: Fransızcadan Almancaya çeviri Fransızca → İngilizce ve İngilizce → Almanca paketlerini kullanır.
5. Gereken bir paket eksik olduğunda hata iletisi dil çiftini belirtir ve Sözlükler bölümüne yönlendirir.

Arka plan betiği bir paketi ilk kullanımda IndexedDB'den okur ve bellekte tutar; beş dakika boyunca sözlük çevirisi yapılmazsa belleği serbest bırakır.

### Veri kaynakları

Paketler iki kaynaktan oluşturulur: wiktextract ile çıkarılıp kaikki.org tarafından yayımlanan Wiktionary verileri (CC BY-SA 4.0, © Wiktionary katkıda bulunanları) ve skywind3000'in ECDICT projesi (MIT Lisansı). Her paket dizinde kendi kaynağını ve lisansını belirtir; ayarlar sayfası bunları paketin yanında gösterir.

## Çevrimdışı çeviri (Bergamot)

Bergamot hizmeti, Mozilla'nın MPL-2.0 lisansıyla yayımladığı Firefox Translations motoru ve modelleriyle bilgisayarınızda çeviri yapar. Motor eklentiyle birlikte gelir. Her çeviri yönü Mozilla'dan bir kez indirilir (13 ile 48 MB arası) ve eklentinin IndexedDB alanında saklanır. Yüklenmiş bir yön yaklaşık 200 MB bellek kullanır ve beş dakika kullanılmadığında serbest bırakılır. Her modelin bir tarafı İngilizcedir; bu yüzden Japoncadan Çinceye çeviri Japonca → İngilizce ve İngilizce → Çince yönlerini kullanır.

Ayarlar sayfasının "Çevrimdışı çeviri modelleri (Bergamot)" bölümü 58 dil arasındaki 114 yön çiftini boyut ve sürümleriyle listeler; liste dile göre süzülebilir. Bölüm, geçerli kaynak ve hedef dilin gerektirdiği yönleri belirtir ve bunları listenin başına koyar. İndirmeler ilerlemelerini gösterir ve iptal edilebilir. Mozilla'nın daha yeni bir sürümünü sunduğu kurulu bir çiftte "Güncelle" düğmesi görünür. Geçerli dillerin gerektirdiği bir çifti silmek onay ister. Kurulum, çeviri ve kaldırma, motorun çalıştığı arka plan betiğinde yürütülür. Model seçimi, doğrulama, depolama ve motor [docs/bergamot.md](../docs/bergamot.md) belgesinde anlatılır.

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
| Sözlük (çevrimdışı) | Sözlükler bölümünden dil çiftlerini indirin | Kurulu paketlerle sözcük sözcük çeviri; bkz. "Sözlük çevirisi" |
| Bergamot (çevrimdışı) | "Çevrimdışı çeviri modelleri" bölümünden yön çiftlerini indirin | Mozilla'nın modelleriyle bilgisayarınızda çeviri; bkz. "Çevrimdışı çeviri (Bergamot)" |
| Microsoft Translator (ücretsiz) | Yok | Edge tarayıcısının kullandığı `edge.microsoft.com/translate/translatetext` uç noktasını çağırır; istek gövdesi paragraflardan oluşan bir dizidir. Panelde “Kendi anahtarımı kullan (Azure Translator)” seçilirse bunun yerine resmî `api.cognitive.microsofttranslator.com` çağrılır: Azure portalında bir Translator kaynağı oluşturun, “Anahtarlar ve Uç Nokta” altındaki anahtarı ve bölgeyi panele girin (genel kaynakta bölge boş kalabilir). |
| DeepLX | Uç nokta gerekli | Kendi sunucunuzda veya üçüncü tarafça barındırılan bir DeepLX hizmeti; belirteç isteğe bağlıdır. Uç nokta `{{apiKey}}` içeriyorsa belirteç onun yerine yazılır; içermiyorsa `Authorization: Bearer` olarak gönderilir |

### Yapay zekâ sağlayıcıları

Tüm yapay zekâ sağlayıcıları Vercel AI SDK'nın `generateText` işleviyle çağrılır. Resmî bir `@ai-sdk/*` paketi olan sağlayıcılar o paketi, diğerleri `@ai-sdk/openai-compatible` paketini kullanır. Uç nokta, API anahtarı, model ve sıcaklık her sağlayıcı için değiştirilebilir. Model alanı yaygın modelleri önerir ve herhangi bir model adını da kabul eder.

| Sağlayıcı | SDK paketi | Varsayılan uç nokta | Varsayılan model | Anahtar gerekli |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Evet |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Evet |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Evet |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Evet |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-4.3` | Evet |
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
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-mini-260428` | Evet |
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
|  | `grok-4.5`, `grok-4.6`, `grok-4.7` | `"low"` (kapatılamaz) | `"high"` | aynı |
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

1. İçerik betiği çevrilecek her paragrafı, kullanılan tüm kademeler için bir kez, arka plan betiğine iletir.
2. Arka plan betiği her kademe için önce önbelleğe bakar ve isabet olursa doğrudan yanıt verir. Önbellek anahtarı sağlayıcıdan, modelden, kaynak ve hedef dilden, yapay zekâ hizmetlerinde istemin türünden ve metninin özet değerinden, hassas modda iletinin özet değerinden ve paragraf metninin bir özet değerinden (hash) oluşur. Aynı metin zaten çevriliyorsa sonraki istekler aynı sonucu paylaşır.
3. Önbellekte bulunmayan paragraflar grup kuyruğuna girer ve sağlayıcı + model + uç nokta + kaynak dil + hedef dil bileşimine göre, yapay zekâ hizmetlerinde ayrıca isteme, Microsoft Translator’da ayrıca ücretsiz veya anahtarlı moda, hassas modda ayrıca iletiye göre gruplanır. Bir grubun paragrafları 50 ms boyunca birikir. Grup şu durumlarda gönderilir: aralık sona erdiğinde, paragraf sınırına ulaşıldığında veya bir sonraki paragraf karakter sınırını aşacaksa. Karakter sınırından uzun tek bir paragraf kendi başına bir grup oluşturur.
4. İstek kuyruğu her grubu yürütür. Eşzamanlı istek sayısını sınırlar ve 408, 429, 5xx ve ağ hatalarını üstel geri çekilmeyle yeniden dener; sunucu `Retry-After` gönderirse belirtilen süre kadar, en fazla 30 saniye bekler. 401 ve 400 gibi hatalar yeniden denenmeden bildirilir.
5. Sonuçlar bellekteki önbelleğe alınır ve 1 saniye sonra tek bir yazma işlemiyle `storage.local` içine yazılır. Önbellek en uzun süredir kullanılmayan (LRU, Least Recently Used) kayıtları çıkarır.

### Her hizmetin paragrafları birleştirme biçimi

- Sözlük ve Bergamot: grubun tamamı tek bir yerel çağrıyla çevrilir.
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
- İleti metni yalnızca kullanılan kademelerin hizmetlerine gönderilir. Sözlük ve Bergamot bilgisayarınızda çeviri yapar ve hiçbir yere metin göndermez. Ayarlar sayfası ve kurulum rehberi, sözlük paketlerinin listesini bu deponun GitHub sürümlerinden, Bergamot modellerinin listesini ise Mozilla'dan okur; paketlerin ve modellerin kendisi yalnızca "İndir" düğmesine tıkladığınızda indirilir. Bu isteklerin hiçbiri ileti metni taşımaz. Eklenti istatistik toplamaz ve başka hiçbir ağ adresiyle bağlantı kurmaz.
- Çeviri önbelleği yerel olarak saklanır ve ayarlar sayfasından kapatılabilir veya temizlenebilir.
- Google, Microsoft, DeepLX veya çevrimiçi bir yapay zekâ hizmeti kullanıldığında ileti metni bilgisayarınızdan çıkar. Hassas iletiler için yalnızca sözlüğü, Bergamot'u ve Ollama veya LM Studio gibi yerel yapay zekâ modellerini kullanın; bunlar her isteği kendi makinenizde tutar.

## Bilinen sınırlamalar

- Çeviriler düz metindir. Özgün metindeki bağlantılar, kalın yazı ve diğer satır içi biçimlendirmeler çeviride korunmaz. İki dilli modda özgün metin tümüyle kullanılabilir kalır; yalnızca çeviri modunda özgün metni görmek için fare imlecini üzerine getirebilir veya iki dilli moda geri dönebilirsiniz.
- Ücretsiz Google ve Microsoft uç noktaları belgelenmemiştir; değişebilir veya hız sınırlamasına uğrayabilir. Microsoft, `edge.microsoft.com/translate/auth` belirteç uç noktasını Temmuz 2026'da kullanımdan kaldırmıştır; eklenti yalnızca doğrudan uç noktayı kullanır.
- Bir paragrafın zaten hedef dilde olup olmadığına karar verirken Çince, Japonca, Korece ve benzeri yazı sistemleri karakter sınıfına göre değerlendirilir; Latin ve Kiril alfabesi kullanan diller için önce eklenti API'sinin `i18n.detectLanguage` işlevi kullanılır. Bu API kullanılamadığında veya sonucu güvenilir olmadığında yalnızca İngilizce güvenilir biçimde algılanır; Latin alfabesi kullanan diğer dillerdeki paragraflar her zamanki gibi çeviriye gönderilir.
- İçerik betiği `messageDisplayScripts` aracılığıyla kaydedilir ve yalnızca kayıttan sonra açılan iletilere ulaşır. Eklenti başlangıçta betiği zaten açık olan iletilere eklemeyi dener; bu başarısız olursa iletiyi yeniden seçmek yeterlidir.
- Eklentinin ürettiği hata iletileri çevrilir. Bir çeviri hizmetinin veya AI SDK'nın döndürdüğü hata metinleri (örneğin bir HTTP 401 yanıtının gövdesi) alındığı gibi, genellikle İngilizce olarak gösterilir.
- Eklenti adı, Eklenti yöneticisindeki açıklaması ve kısayol açıklamaları arayüz dili seçeneğini değil, Thunderbird'ün arayüz dilini izler.
- Hassas çeviri bir iletiyi gövde metninin özet değeriyle tanımlar, çünkü içerik betiğinin ileti kimliğine erişimi yoktur. Aynı metnin iki kopyası çevirilerini ve analizini paylaşır.
- İstem önbelleği sağlayıcıya bağlıdır. Anthropic yalnızca modele göre değişen bir en küçük uzunluğun üzerindeki önekleri önbelleğe alır; daha kısa önekler normal şekilde gönderilir ve ücretlendirilir.
- Düşünme anahtarı model adlarının eşleştirilmesiyle çalışır. Adı hiçbir kalıba uymayan yeni bir model, `src/background/providers/thinking.ts` içindeki tablo genişletilene kadar düşünme parametresi almaz.
- Kullanılan her kademe kendi isteklerini gönderir. Yapay zekâ kademesi ve makine çevirisi kademesi birlikte kullanıldığında her ileti makine çevirmenine de istek gönderir; bu istekler ücretsiz Google ve Microsoft uç noktalarının hız sınırlarına sayılır.
- Sözlük çevirisi sözcük sözcük bir karşılıktır: kaynak metnin sözcük sırasını korur ve sözcükleri çekimlemez. Paketlerde bulunmayan sözcükler çevrilmeden kalır.
- Kurulum rehberinin örnek iletisi İngilizcedir; hedef dil İngilizce olduğunda Almancadır. Kaynak dil bu ikisinden farklı bir dile sabitlenmişse deneme çevirisi İngilizce metni yine o kaynak dille gönderir.
- Kurulum rehberi etkin sekmeyken Alt+A'ya basılırsa örnek ileti çevrilir veya özgün hâline döner. Bu durumda deneme düğmesinin etiketi değişmez.
- Hazır ayarlar modele verilen talimatlardır. Bir ağzın veya üslubun ne kadar izlendiği modele bağlıdır; küçük modeller bölgesel çeşitleri daha sık karıştırır.
- Bergamot ve sözlük bir grubu tek bir kaynak dille çevirir. Otomatik algılamada Bergamot tüm grubun dilini algılar; bu yüzden dilleri karışık bir grup, baskın dildeymiş gibi çevrilir.

## Testler

```bash
npm test               # vitest unit tests
npm run test:coverage  # unit tests with coverage; fails below the thresholds in vitest.config.ts
npm run e2e            # headless Thunderbird (THUNDERBIRD_BIN) against a local mock server: three tiers, mode switch, restore
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules, with and without a source language
```

Birim testleri şunları kapsar: grup oluşturma ve kuyruklar; yapay zekâ çıktısının ayrıştırılması ve geri dönüş; paragraf algılama ile iki dilli ve yalnızca çeviri görüntüleme ve geri yükleme (jsdom içinde); Google, Microsoft ve DeepLX için istek oluşturma ve yanıt ayrıştırma (taklit edilmiş fetch ile); her yapay zekâ ön ayarının istek URL'si ve kimlik doğrulama başlıkları; her sağlayıcının düşünme parametreleri; ayarların eklenen hizmetlere, kademelere ve istemlere taşınması; açılır pencere ve ayarlar sayfasındaki kademe listeleri, tüm kademelerin boş bırakılmasının reddedilmesi ve kaldırma koruması; kademeler (önce yanıt veren ve sonra yerini bırakan alt kademe, önce yanıt veren en yüksek kademe ve ardından yok sayılan alt kademe sonuçları, başarısız olan en yüksek kademe ve korunan alt kademe sonucu, tüm kademelerin başarısız olması, kullanılmayan kademeler, önbellekteki en yüksek kademe); istem seçimi ve önbellek anahtarları; yapay zekâ kademesini yeniden sorgulayan ve diğer kademeleri yalnızca yeniden çizen görünüm modu değişikliği; her hizmetin isteklerinde ve önbellek anahtarında kaynak dil; sözlük paketleri (ayrıştırma, sözcüklere ayırma ve ifade eşleştirme, çekimli biçimler, İngilizce üzerinden çeviri, eksik paketler, sağlama toplamıyla indirme; bellek içi bir IndexedDB ile); taklit edilmiş bir motorla Bergamot hizmeti ve model yönetimi; hassas çeviri (tek istek, gruplarla analiz, başarısız analiz, önbellek anahtarları ve iletiye göre gruplar, Anthropic önbellek denetimiyle aynı istem öneki); kurulum rehberi (yalnızca yeni kurulumda açılma, atlanan adımlarla ve kalınan adımdan devam ederek adımlar arasında gezinme, her adımın kaydedilmesi, önerilen sözlük paketleri ve Bergamot yönleri ile bunların indirilmesi, hizmet yapılandırması ve bağlantı testi, istemlerde hazır ayarlar, içerik betiği modülleri üzerinden deneme çevirisi); istem hazır ayarları (hedef dile göre çeşitler, üç istemin her biriyle birleştirme, aynı hazır ayarın kendi bloğunun yerini alması, tüm hazır ayarlar uygulanmışken grup ayrıştırma); yerelleştirme. Yerelleştirme testleri tüm dillerde anahtar kümelerinin ve yer tutucuların aynı olduğunu, bildirimdeki her `__MSG_*__` başvurusunu, Thunderbird dillerinin desteklenen dillere eşlenmesini, eksik anahtarlar için İngilizceye geri dönüşü ve HTML sayfalarında ve kaynak kodda sabit kodlanmış arayüz metni bulunmadığını denetler.

`npm run build:debug`, bir ileti açılır açılmaz çeviriye başlayan ve ilerlemeyi konsola yazan bir hata ayıklama xpi'si üretir; bu sürüm tüm akışı gerçek bir Thunderbird'de denetlemek içindir.

## Proje yapısı

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

## Arayüzü çevirme

Arayüz metinleri `locales/<language>.json` dosyalarında bulunur; her dil için anahtar → metin biçiminde tek düzeyli bir nesne vardır. `locales/en.json` başvuru dosyasıdır: diğer her dosya tam olarak aynı anahtarlara sahiptir. `$1` ile `$9` arası yer tutuculardır ve her çeviride İngilizcedeki numaralarla yer almalıdır; `{{apiKey}}` ve `{{to}}` olduğu gibi kalan sabit belirteçlerdir. Google Translate, OpenAI veya DeepLX gibi ürün adları çevrilmez.

`npm run build` bu dosyaları Thunderbird'ün okuduğu biçim olan `dist/_locales/<language>/messages.json` dosyalarına dönüştürür. Eklentinin kendi i18n çalışma zamanı aynı dosyaları çalışma sırasında yükler; bu sayede arayüz dili Thunderbird yeniden başlatılmadan değişebilir. Eksik anahtarlar için İngilizce metin kullanılır.

Yeni bir dil eklemek için tüm anahtarları içeren `locales/<code>.json` dosyasını oluşturun, kodu kendi dilindeki adıyla birlikte `src/shared/locales.ts` içindeki `SUPPORTED_LOCALES` listesine ekleyin ve `npm run locales:check` ile `npm test` komutlarını çalıştırın.

## Teşekkürler

Paragraf algılamanın, grup kuyruğunun, istemlerin ve sağlayıcı yapılandırmasının tasarımı, GPL-3.0 lisansıyla yayımlanan ve web sayfalarını çeviren bir tarayıcı eklentisi olan [Read Frog](https://github.com/mengxi-ream/read-frog) projesini temel alır. Bu proje söz konusu fikirleri Thunderbird'ün ileti okuyucusuna taşır ve e-postaya uyarlar; örneğin düz metin iletileri boş satırlardan böler ve sabit satır sonlarıyla bölünmüş satırları birleştirir.

Sözlük verileri iki kaynaktan gelir. Birincisi [Wiktionary](https://en.wiktionary.org/) verileridir (© Wiktionary katkıda bulunanları, CC BY-SA 4.0); bu veriler [wiktextract](https://github.com/tatuylonen/wiktextract) ile çıkarılır ve [kaikki.org](https://kaikki.org/) tarafından yayımlanır. İkincisi skywind3000'in [ECDICT](https://github.com/skywind3000/ECDICT) projesidir (MIT Lisansı). Çevrimdışı çeviri, [Bergamot](https://browser.mt/) motorunu ve Mozilla'nın MPL-2.0 lisansıyla yayımladığı Firefox Translations çeviri modellerini kullanır.

## Lisans

GPL-3.0-or-later. Tam metin için [LICENSE](../LICENSE) dosyasına bakın.
