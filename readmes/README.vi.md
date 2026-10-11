# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | Tiếng Việt

Thunderbird Translate là một tiện ích của Thunderbird, dùng để dịch nội dung thư bạn đang đọc ngay trong khung hiển thị thư. Bản dịch có thể nằm dưới từng đoạn gốc (song ngữ) hoặc thay thế đoạn gốc (chỉ bản dịch). Khi tắt dịch, thư gốc được khôi phục nguyên vẹn. Google Dịch (miễn phí) là dịch vụ mặc định và dùng được ngay sau khi cài đặt. Bạn cũng có thể kết nối 22 nhà cung cấp AI, trong đó có OpenAI, Claude, Gemini, DeepSeek và Qwen.

Tài liệu này viết cho người đọc chưa từng dùng tiện ích của Thunderbird. Nội dung đi theo thứ tự: cài đặt, sử dụng, cấu hình và cách hoạt động.

![Minh họa: dịch thư, chuyển giữa song ngữ và chỉ bản dịch, đổi ngôn ngữ đích](../docs/demo.gif)

## Tính năng

- Dịch nội dung thư: tiện ích tìm nội dung ở cấp đoạn trong phần thân thư, gồm đoạn văn, mục danh sách, ô bảng, tiêu đề, khối trích dẫn, div chỉ chứa văn bản, và các đoạn được ngăn cách bằng dòng trống trong thư văn bản thuần. Mã nguồn, các đoạn đã ở ngôn ngữ đích, con số, liên kết trơn và khoảng trắng được bỏ qua.
- Hai chế độ hiển thị: chế độ song ngữ chèn một khối bản dịch có viền trái nhạt dưới đoạn gốc, vẫn dễ đọc khi dùng giao diện tối. Chế độ chỉ bản dịch thay đoạn gốc bằng bản dịch; đoạn gốc được giữ trong bộ nhớ và được đặt lại khi tắt dịch.
- Cập nhật trực tiếp: khi đổi chế độ hiển thị hoặc ngôn ngữ đích trong lúc thư đang được dịch, trang được vẽ lại mà không cần mở lại thư. Đổi chế độ hiển thị chỉ vẽ lại từ các bản dịch đã nhận và không gửi yêu cầu mới.
- Điểm truy cập: nút "Dịch thư" trên thanh công cụ ở phần đầu thư cùng cửa sổ bật lên của nút, và hai phím tắt Alt+A (dịch / hiện bản gốc) và Alt+S (chuyển song ngữ / chỉ bản dịch).
- Dịch tự động (tùy chọn): thư không ở ngôn ngữ đích được dịch ngay khi mở.
- Gộp yêu cầu: tập lệnh nền gom các đoạn trong 50 ms rồi gộp thành một yêu cầu, có giới hạn số yêu cầu đồng thời, thử lại với thời gian chờ tăng theo hàm mũ, và bộ nhớ đệm cục bộ.
- Dịch vụ: 3 dịch vụ dịch miễn phí hoặc tự lưu trữ và 22 cấu hình sẵn cho nhà cung cấp AI, trong đó có "Tùy chỉnh tương thích OpenAI".
- Giao diện có 12 ngôn ngữ. Ngôn ngữ giao diện mặc định theo Thunderbird và có thể chọn trên trang cài đặt.

## Cài đặt

### Từ trang Releases

1. Tải tệp `thunderbird-translate-<version>.xpi` mới nhất từ trang Releases của kho mã này.
2. Trong Thunderbird, mở Công cụ → Tiện ích và chủ đề (cũng mở được từ menu ≡ ở góc trên bên phải).
3. Nhấn biểu tượng bánh răng phía trên danh sách tiện ích, chọn "Cài đặt tiện ích từ tập tin…", chọn tệp xpi vừa tải về rồi xác nhận.

Cần Thunderbird 128 trở lên.

### Tự build từ mã nguồn

Cần Node.js 22 trở lên (môi trường phát triển dùng Node 24 và npm 11).

```bash
npm ci
npm test
npm run build
```

`npm run build` dùng esbuild để đóng gói tập lệnh nền, tập lệnh nội dung, cửa sổ bật lên và trang cài đặt vào `dist/`, tạo `dist/_locales/<language>/messages.json` từ các tệp trong `locales/`, rồi nén `dist/` thành `web-ext-artifacts/thunderbird-translate-<version>.xpi`. Bước nén dùng thư viện fflate viết bằng JavaScript thuần và không cần lệnh zip của hệ thống.

Trong lúc phát triển, bạn có thể nạp tiện ích mà không cần đóng gói: trong Thunderbird mở Công cụ → Công cụ nhà phát triển → Gỡ lỗi tiện ích, nhấn "Tải tiện ích tạm thời…" và chọn `dist/manifest.json`.

## Sử dụng

Mở một thư. Nút "Dịch thư" xuất hiện trên thanh công cụ ở phần đầu thư. Nhấn nút này sẽ mở một cửa sổ bật lên với các điều khiển sau:

- "Dịch thư này": bắt đầu dịch. Khi bản dịch đang chạy hoặc đang hiển thị, nút đổi thành "Hiện bản gốc" và nhấn vào sẽ khôi phục bản gốc.
- Hiển thị: chuyển giữa song ngữ và chỉ bản dịch; thay đổi áp dụng ngay cho thư hiện tại.
- Ngôn ngữ đích: sau khi đổi, thư đang được dịch sẽ được dịch lại sang ngôn ngữ mới.
- Dịch vụ dịch: chọn dịch vụ đang dùng.
- Tự động dịch thư không ở ngôn ngữ đích: khi được đánh dấu, thư có nội dung không ở ngôn ngữ đích sẽ được dịch ngay khi mở.

Cửa sổ bật lên hiển thị tiến độ, ví dụ "Đã dịch 8 trên 12". Khi một đoạn dịch lỗi, dòng chữ đỏ "Dịch thất bại, nhấn để thử lại" xuất hiện sau đoạn đó; di chuột lên sẽ thấy thông báo lỗi, nhấn vào sẽ dịch lại đoạn đó.

Alt+A dịch thư hiện tại hoặc khôi phục bản gốc; Alt+S chuyển giữa song ngữ và chỉ bản dịch. Có thể đổi cả hai phím tắt trong mục "Quản lý phím tắt tiện ích mở rộng" ở menu bánh răng của Trình quản lý tiện ích.

Ở chế độ chỉ bản dịch, di chuột lên một bản dịch sẽ hiện văn bản gốc trong chú thích nổi.

## Cài đặt tiện ích

Mở trang cài đặt bằng nút "Tùy chọn" của tiện ích này trong Trình quản lý tiện ích. Cài đặt được lưu tự động; dòng chữ "Đã lưu" xuất hiện ở góc trên bên phải sau khi ghi xong.

| Mục | Nội dung |
| --- | --- |
| Chung | Ngôn ngữ giao diện, ngôn ngữ đích, chế độ hiển thị mặc định, dịch vụ hiện tại, dịch tự động |
| Dịch vụ dịch | Điểm cuối, khóa API, mô hình và nhiệt độ của từng dịch vụ; nút "Kiểm tra kết nối" và "Dùng dịch vụ này" |
| Lời nhắc hệ thống | Lời nhắc hệ thống tùy chỉnh cho dịch vụ AI; `{{to}}` được thay bằng tên ngôn ngữ đích; để trống nghĩa là dùng lời nhắc tích hợp sẵn |
| Gộp yêu cầu | Thời gian gom đoạn, số ký tự và số đoạn tối đa mỗi yêu cầu, số yêu cầu đồng thời, số lần thử lại, có gộp yêu cầu AI hay không |
| Kiểu bản dịch | Viền trái, viền trái nét đứt, tô sáng hoặc đơn giản; màu nhấn, độ đục của chữ, tỷ lệ cỡ chữ; xem trước trực tiếp |
| Bộ nhớ đệm | Bật hoặc tắt bộ nhớ đệm, số đoạn tối đa trong bộ nhớ đệm, số mục hiện có, xóa bộ nhớ đệm |

"Kiểm tra kết nối" gửi một câu thử với các giá trị đang có trong ô nhập. Khi thành công, nút hiển thị bản dịch; khi thất bại, nút hiển thị lỗi do dịch vụ trả về, ví dụ khóa không hợp lệ hoặc tên mô hình không tồn tại.

## Ngôn ngữ giao diện

Tùy chọn "Ngôn ngữ giao diện" trong mục Chung có hai loại giá trị:

- "Theo Thunderbird" (mặc định): tiện ích dùng ngôn ngữ được hỗ trợ gần nhất với ngôn ngữ giao diện của Thunderbird. Nhãn của tùy chọn hiển thị ngôn ngữ đang được chọn, ví dụ "Theo Thunderbird (Deutsch)".
- Một trong 12 ngôn ngữ được hỗ trợ: tiện ích dùng ngôn ngữ đó, không phụ thuộc ngôn ngữ của Thunderbird.

Lựa chọn này áp dụng cho cửa sổ bật lên, trang cài đặt, các nhãn trong thư ("Đang dịch…", "Dịch thất bại, nhấn để thử lại"), thông báo lỗi, kết quả kiểm tra kết nối và chú thích của nút trên thanh công cụ. Trang cài đặt hoặc cửa sổ bật lên đang mở sẽ đổi văn bản ngay lập tức. Các nhãn trong thư đã được dịch sẽ đổi ở lần vẽ tiếp theo.

Một số văn bản do chính Thunderbird đọc từ tệp manifest của tiện ích và luôn theo ngôn ngữ giao diện của Thunderbird: tên và mô tả của tiện ích trong Trình quản lý tiện ích, và mô tả phím tắt trong "Quản lý phím tắt tiện ích mở rộng". Trang cài đặt có ghi chú điều này bên dưới tùy chọn.

"Theo Thunderbird" ánh xạ ngôn ngữ của Thunderbird như sau:

| Ngôn ngữ của Thunderbird | Ngôn ngữ giao diện được dùng |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Tiếng Trung phồn thể |
| các `zh-*` khác | Tiếng Trung giản thể |
| `pt-*` | Tiếng Bồ Đào Nha (Brazil) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | ngôn ngữ có cùng thẻ con chính |
| mọi ngôn ngữ khác | Tiếng Anh |

Danh sách ngôn ngữ đích hiển thị tên mỗi ngôn ngữ bằng ngôn ngữ giao diện, kèm tên gốc của ngôn ngữ đó, ví dụ "Tiếng Nhật (日本語)". Lời nhắc gửi đến dịch vụ AI luôn dùng tên ngôn ngữ bằng tiếng Anh, vì mô hình làm theo chỉ dẫn tiếng Anh ổn định nhất.

Ở lần cài đặt đầu tiên, ngôn ngữ đích được đặt theo ngôn ngữ giao diện: Thunderbird tiếng Nhật bắt đầu với ngôn ngữ đích là tiếng Nhật, Thunderbird tiếng Anh bắt đầu với tiếng Anh. Ngôn ngữ đích đã có sẵn không bao giờ bị ghi đè.

## Ngôn ngữ giao diện được hỗ trợ

| Mã | Ngôn ngữ |
| --- | --- |
| `en` | English |
| `zh_CN` | 简体中文 (Tiếng Trung giản thể) |
| `zh_TW` | 繁體中文 (Tiếng Trung phồn thể) |
| `ja` | 日本語 (Tiếng Nhật) |
| `ko` | 한국어 (Tiếng Hàn) |
| `fr` | Français (Tiếng Pháp) |
| `de` | Deutsch (Tiếng Đức) |
| `es` | Español (Tiếng Tây Ban Nha) |
| `pt_BR` | Português (Brasil) (Tiếng Bồ Đào Nha, Brazil) |
| `ru` | Русский (Tiếng Nga) |
| `tr` | Türkçe (Tiếng Thổ Nhĩ Kỳ) |
| `vi` | Tiếng Việt (Tiếng Việt) |

Danh sách ngôn ngữ đích là một danh sách riêng gồm 20 ngôn ngữ, trong đó có tiếng Ý, tiếng Ukraina, tiếng Ba Lan, tiếng Hà Lan, tiếng Thái, tiếng Indonesia, tiếng Ả Rập và tiếng Hindi.

## Cấu hình nhà cung cấp

### Dịch vụ miễn phí và tự lưu trữ

| Dịch vụ | Thiết lập | Ghi chú |
| --- | --- | --- |
| Google Dịch (miễn phí, mặc định) | Không cần | Gọi điểm cuối `client=gtx` của `translate.googleapis.com`; một yêu cầu POST mang nhiều tham số `q`, nên nhiều đoạn dùng chung một yêu cầu |
| Microsoft Translator (miễn phí) | Không cần | Trước tiên thử lấy token từ `edge.microsoft.com/translate/auth` rồi gọi `api-edge.cognitive.microsofttranslator.com`; khi Microsoft đã ngừng điểm cuối cấp token, tiện ích chuyển sang `edge.microsoft.com/translate/translatetext`. Cả hai cách đều nhận mảng một cách tự nhiên |
| DeepLX | Bắt buộc nhập điểm cuối | Dịch vụ DeepLX tự lưu trữ hoặc của bên thứ ba; token là tùy chọn. Nếu điểm cuối chứa `{{apiKey}}`, token sẽ thay vào vị trí đó; nếu không, token được gửi dưới dạng `Authorization: Bearer` |

### Nhà cung cấp AI

Mọi nhà cung cấp AI đều được gọi qua `generateText` của Vercel AI SDK. Nhà cung cấp có gói `@ai-sdk/*` chính thức thì dùng gói đó; các nhà cung cấp còn lại dùng `@ai-sdk/openai-compatible`. Điểm cuối, khóa API, mô hình và nhiệt độ đều đổi được cho mọi nhà cung cấp. Ô mô hình gợi ý các mô hình thường dùng và cũng chấp nhận bất kỳ tên mô hình nào.

| Nhà cung cấp | Gói SDK | Điểm cuối mặc định | Mô hình mặc định | Cần khóa |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Có |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Có |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Có |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-chat` | Có |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | Có |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Có |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Có |
| Ollama (cục bộ) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | Không |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Có |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Có |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Có |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Có |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Có |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Có |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Có |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Có |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Có |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Có |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | Có |
| Azure OpenAI | `@ai-sdk/azure` | Bắt buộc nhập | `gpt-4.1-mini` | Có |
| LM Studio (cục bộ) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | Không |
| Tùy chỉnh tương thích OpenAI | `@ai-sdk/openai-compatible` | Bắt buộc nhập | Bắt buộc nhập | Không |

Một số nhà cung cấp có yêu cầu riêng:

- Anthropic Claude: tiện ích thêm header `anthropic-dangerous-direct-browser-access: true`, vì Anthropic yêu cầu header này với các yêu cầu gửi từ ngữ cảnh trình duyệt. Dòng Claude 5 cùng Opus 4.7 và 4.8 từ chối nhiệt độ tùy chỉnh, nên tiện ích không gửi nhiệt độ cho các mô hình này, và ô nhiệt độ của mô hình mặc định để trống.
- Azure OpenAI: điểm cuối có dạng `https://<resource>.openai.azure.com/openai`, và ô mô hình nhận tên bản triển khai.
- Ollama: theo mặc định, Ollama từ chối các yêu cầu khác nguồn gốc (cross-origin) từ trang của tiện ích. Hãy khởi động Ollama với biến môi trường `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: điểm cuối mặc định là trang Trung Quốc `api.moonshot.cn`; tài khoản trên trang quốc tế dùng `https://api.moonshot.ai/v1`.
- Volcengine Doubao: ô mô hình nhận tên mô hình hoặc ID của một điểm cuối suy luận đã tạo trong bảng điều khiển Ark.

## Cách gộp yêu cầu hoạt động

Một thư thường có từ mười đến vài chục đoạn. Nếu mỗi đoạn là một yêu cầu, đoạn nào cũng mang theo một bản sao của lời nhắc hệ thống và chỉ dẫn, và đoạn nào cũng tiêu tốn một yêu cầu trong giới hạn tần suất. Gộp yêu cầu ghép các đoạn đến gần nhau về thời gian vào một yêu cầu, nên cả hai chi phí được tính theo lô thay vì theo đoạn.

### Luồng xử lý

1. Tập lệnh nội dung chuyển từng đoạn cần dịch cho tập lệnh nền.
2. Tập lệnh nền tra bộ nhớ đệm trước và trả lời ngay khi trúng. Khóa bộ nhớ đệm gồm nhà cung cấp, mô hình, ngôn ngữ đích, chữ ký của lời nhắc hệ thống và giá trị băm của văn bản đoạn. Khi cùng một văn bản đang được dịch, các yêu cầu đến sau dùng chung kết quả đó.
3. Các đoạn không có trong bộ nhớ đệm đi vào hàng đợi lô, được nhóm theo nhà cung cấp + mô hình + điểm cuối + ngôn ngữ đích. Các đoạn của một nhóm được gom trong 50 ms. Một nhóm được gửi đi khi hết thời gian gom, khi đạt giới hạn số đoạn, hoặc khi đoạn tiếp theo sẽ vượt giới hạn ký tự. Một đoạn đơn lẻ dài hơn giới hạn ký tự tự tạo thành một lô riêng.
4. Hàng đợi yêu cầu thực thi từng lô. Hàng đợi giới hạn số yêu cầu đồng thời và thử lại các lỗi 429, 5xx và lỗi mạng với thời gian chờ tăng theo hàm mũ; khi máy chủ gửi `Retry-After`, hàng đợi chờ đúng khoảng thời gian đó. Các lỗi như 401 và 400 được báo ngay mà không thử lại.
5. Kết quả được đưa vào bộ nhớ đệm trong bộ nhớ và được ghi vào `storage.local` trong một lần ghi sau 1 giây. Bộ nhớ đệm loại bỏ các mục ít được dùng gần đây nhất (LRU).

### Cách mỗi dịch vụ gộp đoạn

- Google: một yêu cầu POST với nhiều tham số `q`; mảng trả về khớp một-một với đầu vào.
- Microsoft: bản thân thân yêu cầu là một mảng.
- DeepLX: điểm cuối chỉ nhận một đoạn mỗi yêu cầu, nên các đoạn của một lô được gửi đồng thời.
- Nhà cung cấp AI: các đoạn được đánh số và đưa vào một tin nhắn, và mô hình được yêu cầu trả về một mảng JSON có cùng độ dài. Bộ phân tích lần lượt thử: mảng JSON (có thể nằm trong khối mã hoặc có lời giải thích bao quanh; ký tự xuống dòng trần trong chuỗi và dấu phẩy thừa ở cuối được sửa), các khối `<seg>` có đánh số, các dòng có đánh số, và dấu phân cách `%%`. Nếu tất cả đều thất bại hoặc số lượng không khớp, lô đó được gửi lại theo kiểu mỗi đoạn một yêu cầu, và người dùng thấy kết quả như nhau. Các lỗi không phải lỗi phân tích, chẳng hạn lỗi xác thực, không kích hoạt cơ chế dự phòng này, nên cùng một lỗi không bị lặp lại N lần.

### Ước tính chi phí

Giả sử lời nhắc hệ thống và chỉ dẫn chiếm $s$ token, mỗi đoạn trung bình $t$ token, tổng cộng có $N$ đoạn, kích thước lô là $B$, và mỗi đoạn tốn thêm $c$ token cho phần đánh số và dấu ngoặc kép của JSON.

Với mỗi đoạn một yêu cầu, tổng số token đầu vào là

$$
I_{\text{đơn}} = N(s + t).
$$

Khi gộp lô, có $\lceil N/B \rceil$ yêu cầu, và tổng số token đầu vào là

$$
I_{\text{lô}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

Hiệu số là

$$
I_{\text{đơn}} - I_{\text{lô}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

Chỉ cần $s$ lớn hơn $c$ đáng kể, lô càng lớn thì càng tiết kiệm. Với $s = 150$, $t = 60$, $c = 10$, $N = 20$ và $B = 30$:

$$
I_{\text{đơn}} = 20 \times 210 = 4200, \qquad I_{\text{lô}} = 150 + 20 \times 70 = 1550.
$$

Số token đầu vào giảm khoảng 63%, và số yêu cầu giảm từ 20 xuống 1. Số token đầu ra gần như bằng nhau trong cả hai trường hợp, vì độ dài bản dịch không đổi. Ít yêu cầu hơn cũng có lợi với các điểm cuối miễn phí: Google và Microsoft giới hạn điểm cuối miễn phí theo tần suất yêu cầu, và một thư 20 đoạn chỉ tốn một yêu cầu.

## Quyền riêng tư

- Khóa API chỉ được lưu trong `storage.local` của hồ sơ Thunderbird hiện tại và chỉ được gửi kèm các yêu cầu đến điểm cuối của nhà cung cấp tương ứng.
- Tập lệnh nội dung chạy bên trong trang thư; các cài đặt mà tập lệnh này nhận từ tập lệnh nền không bao giờ chứa khóa.
- Văn bản thư chỉ được gửi đến dịch vụ dịch đang được chọn. Tiện ích không thu thập số liệu thống kê và không liên hệ với địa chỉ mạng nào ngoài dịch vụ dịch.
- Bộ nhớ đệm bản dịch được lưu cục bộ và có thể tắt hoặc xóa trên trang cài đặt.
- Văn bản thư rời khỏi máy tính của bạn và được gửi đến dịch vụ dịch đã chọn. Với thư nhạy cảm, các mô hình cục bộ như Ollama hoặc LM Studio giữ mọi yêu cầu trên chính máy của bạn.

## Hạn chế đã biết

- Bản dịch là văn bản thuần. Liên kết, chữ đậm và các định dạng nội dòng khác của bản gốc không được giữ lại trong bản dịch. Ở chế độ song ngữ, bản gốc vẫn dùng được đầy đủ; ở chế độ chỉ bản dịch, bạn có thể di chuột để xem bản gốc hoặc chuyển lại sang song ngữ.
- Các điểm cuối miễn phí của Google và Microsoft không có tài liệu chính thức và có thể thay đổi hoặc bị giới hạn tần suất. Microsoft đã ngừng điểm cuối cấp token `edge.microsoft.com/translate/auth` vào tháng 7 năm 2026 (điểm cuối này trả về 404). Tiện ích vẫn thử điểm cuối cấp token ở yêu cầu đầu tiên, chuyển sang điểm cuối trực tiếp sau khi thất bại, và không thử lại điểm cuối cấp token trong một giờ.
- Để xác định một đoạn đã ở ngôn ngữ đích hay chưa, tiếng Trung, tiếng Nhật, tiếng Hàn và các hệ chữ tương tự được nhận diện theo lớp ký tự, còn các ngôn ngữ dùng chữ Latinh trước tiên dùng `i18n.detectLanguage` của API tiện ích. Khi API này không khả dụng hoặc kết quả không đáng tin cậy, chỉ tiếng Anh được nhận diện chính xác; các đoạn bằng ngôn ngữ chữ Latinh khác vẫn được gửi đi dịch như bình thường.
- Tập lệnh nội dung được đăng ký qua `messageDisplayScripts` và chỉ tác động đến các thư được mở sau khi đăng ký. Khi khởi động, tiện ích thử chèn tập lệnh vào các thư đang mở; nếu không thành công, chỉ cần chọn lại thư đó.
- Thông báo lỗi do tiện ích tạo ra được dịch. Văn bản lỗi do dịch vụ dịch hoặc AI SDK trả về (ví dụ nội dung của phản hồi HTTP 401) được hiển thị nguyên dạng nhận được, thường là tiếng Anh.
- Tên tiện ích, mô tả của tiện ích trong Trình quản lý tiện ích và mô tả phím tắt theo ngôn ngữ giao diện của Thunderbird, không theo tùy chọn ngôn ngữ giao diện.

## Kiểm thử

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

Các bài kiểm thử đơn vị bao gồm: nhóm lô và hàng đợi; phân tích đầu ra AI và cơ chế dự phòng; nhận diện đoạn cùng việc hiển thị song ngữ, chỉ bản dịch và khôi phục (trong jsdom); dựng yêu cầu và phân tích phản hồi cho Google, Microsoft và DeepLX (với fetch giả lập); URL yêu cầu và header xác thực của mọi cấu hình sẵn AI; và bản địa hóa: tập khóa và phần giữ chỗ giống nhau ở mọi ngôn ngữ, mọi tham chiếu `__MSG_*__` trong manifest, ánh xạ ngôn ngữ của Thunderbird sang ngôn ngữ được hỗ trợ, quay về tiếng Anh khi thiếu khóa, và việc không có văn bản giao diện viết cứng trong các trang HTML và mã nguồn.

`npm run build:debug` tạo một bản xpi gỡ lỗi, bắt đầu dịch ngay khi mở thư và ghi tiến độ ra console, dùng để kiểm tra toàn bộ luồng trong Thunderbird thật.

## Cấu trúc dự án

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

## Dịch giao diện

Văn bản giao diện nằm trong `locales/<language>.json`, mỗi ngôn ngữ là một đối tượng phẳng khóa → văn bản. `locales/en.json` là bản tham chiếu: mọi tệp khác có đúng cùng các khóa. `$1` đến `$9` là phần thay thế và phải xuất hiện trong mỗi bản dịch với cùng các số như bản tiếng Anh; `{{apiKey}}` và `{{to}}` là token nguyên văn và giữ nguyên. Tên sản phẩm như Google Translate, OpenAI hay DeepLX không được dịch.

`npm run build` chuyển các tệp này thành `dist/_locales/<language>/messages.json`, định dạng mà Thunderbird đọc. Bộ i18n riêng của tiện ích nạp chính các tệp đó khi chạy, nên ngôn ngữ giao diện đổi được mà không cần khởi động lại Thunderbird. Khóa bị thiếu sẽ quay về tiếng Anh.

Để thêm một ngôn ngữ, hãy tạo `locales/<code>.json` với đầy đủ khóa, thêm mã ngôn ngữ cùng tên gốc của ngôn ngữ đó vào `SUPPORTED_LOCALES` trong `src/shared/locales.ts`, rồi chạy `npm run locales:check` và `npm test`.

## Ghi nhận

Thiết kế nhận diện đoạn, hàng đợi lô, lời nhắc và cấu hình nhà cung cấp dựa theo [Read Frog](https://github.com/mengxi-ream/read-frog), một tiện ích trình duyệt dịch trang web phát hành theo giấy phép GPL-3.0. Dự án này đưa các ý tưởng đó sang trình đọc thư của Thunderbird và điều chỉnh cho email, ví dụ tách thư văn bản thuần tại các dòng trống và nối các dòng bị ngắt cứng.

## Giấy phép

GPL-3.0-or-later. Xem toàn văn tại [LICENSE](../LICENSE).
