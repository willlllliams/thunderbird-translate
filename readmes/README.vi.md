# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | Tiếng Việt

Thunderbird Translate là một tiện ích của Thunderbird, dùng để dịch nội dung thư bạn đang đọc ngay trong khung hiển thị thư. Bản dịch có thể nằm dưới từng đoạn gốc (song ngữ) hoặc thay thế đoạn gốc (chỉ bản dịch). Khi tắt dịch, thư gốc được khôi phục nguyên vẹn. Việc dịch chạy đồng thời trên ba tầng: từ điển ngoại tuyến, dịch máy (Google Dịch, Microsoft Translator, DeepLX hoặc các mô hình Bergamot ngoại tuyến) và dịch vụ AI (22 nhà cung cấp, trong đó có OpenAI, Claude, Gemini, DeepSeek và Qwen). Kết quả đến nhanh nhất được hiển thị trước, và kết quả của tầng cao nhất sẽ thay thế nó. Google Dịch (miễn phí) là dịch vụ mặc định và dùng được ngay sau khi cài đặt.

Tài liệu này viết cho người đọc chưa từng dùng tiện ích của Thunderbird. Nội dung đi theo thứ tự: cài đặt, sử dụng, cấu hình và cách hoạt động.

![Minh họa: dịch thư, chuyển giữa song ngữ và chỉ bản dịch, đổi ngôn ngữ đích](../docs/demo.gif)

## Tính năng

- Dịch nội dung thư: tiện ích tìm nội dung ở cấp đoạn trong phần thân thư, gồm đoạn văn, mục danh sách, ô bảng, tiêu đề, khối trích dẫn, div chỉ chứa văn bản, và các đoạn được ngăn cách bằng dòng trống trong thư văn bản thuần. Mã nguồn, các đoạn đã ở ngôn ngữ đích, con số, liên kết trơn và khoảng trắng được bỏ qua.
- Hai chế độ hiển thị: chế độ song ngữ chèn một khối bản dịch có viền trái nhạt dưới đoạn gốc, vẫn dễ đọc khi dùng giao diện tối. Chế độ chỉ bản dịch thay đoạn gốc bằng bản dịch; đoạn gốc được giữ trong bộ nhớ và được đặt lại khi tắt dịch.
- Cập nhật trực tiếp: khi đổi chế độ hiển thị hoặc ngôn ngữ đích trong lúc thư đang được dịch, trang được vẽ lại mà không cần mở lại thư. Đổi chế độ hiển thị chỉ vẽ lại từ các bản dịch đã nhận và không gửi yêu cầu mới.
- Điểm truy cập: nút "Dịch thư" trên thanh công cụ ở phần đầu thư cùng cửa sổ bật lên của nút, và hai phím tắt Alt+A (dịch / hiện bản gốc) và Alt+S (chuyển song ngữ / chỉ bản dịch).
- Dịch tự động (tùy chọn): thư không ở ngôn ngữ đích được dịch ngay khi mở.
- Gộp yêu cầu: tập lệnh nền gom các đoạn trong 50 ms rồi gộp thành một yêu cầu, có giới hạn số yêu cầu đồng thời, thử lại với thời gian chờ tăng theo hàm mũ, và bộ nhớ đệm cục bộ.
- Ba tầng dịch: từ điển, dịch máy và dịch bằng AI. Mỗi tầng có một dịch vụ riêng hoặc không được dùng; mỗi đoạn được gửi cùng lúc đến mọi tầng đang dùng. Kết quả của tầng thấp hơn được hiển thị như bản dịch tạm cho đến khi tầng cao nhất thay thế nó, và được giữ lại khi tầng cao nhất thất bại.
- Dịch vụ: một từ điển ngoại tuyến, 4 trình dịch máy (Google Dịch, Microsoft Translator, DeepLX, các mô hình Bergamot ngoại tuyến) và 22 cấu hình sẵn cho nhà cung cấp AI, trong đó có "Tùy chỉnh tương thích OpenAI". Danh sách của các tầng chỉ hiện những dịch vụ bạn đã thêm.
- Ngôn ngữ nguồn: tự động phát hiện hoặc một ngôn ngữ cố định, được truyền cho mọi dịch vụ.
- Ba lời nhắc cho tầng AI: một cho hiển thị song ngữ, một cho hiển thị chỉ bản dịch và một cho dịch chính xác.
- Dịch chính xác (tầng AI): toàn bộ thư làm ngữ cảnh cho mọi yêu cầu, nên tên riêng, thuật ngữ và cách xưng hô nhất quán giữa các đoạn.
- Công tắc chế độ suy nghĩ cho từng nhà cung cấp AI, mặc định tắt.
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
- Ngôn ngữ nguồn và ngôn ngữ đích: ngôn ngữ nguồn mặc định là "Tự động phát hiện". Sau khi đổi một trong hai, thư đang được dịch sẽ được dịch lại. Khi hai ngôn ngữ trùng nhau, một dòng ghi chú xuất hiện.
- Các tầng dịch: mỗi tầng có một danh sách (Tầng 1: Từ điển, Tầng 2: Dịch máy, Tầng 3: Dịch bằng AI), gồm "Không dùng" và các dịch vụ đã thêm của tầng đó. Phải có ít nhất một tầng được gán dịch vụ; khi chọn "Không dùng" cho tầng cuối cùng còn dịch vụ, lựa chọn bị từ chối kèm một dòng ghi chú. Mục "+ Thêm dịch vụ dịch" bên dưới các danh sách mở trang cài đặt tại phần dịch vụ dịch.
- Dịch chính xác: hiện khi tầng AI có dịch vụ.
- Tự động dịch thư không ở ngôn ngữ đích: khi được đánh dấu, thư có nội dung không ở ngôn ngữ đích sẽ được dịch ngay khi mở.

Cửa sổ bật lên hiển thị tiến độ, ví dụ "Đã dịch 8 trên 12". Các đoạn vẫn hiển thị bản dịch tạm của một tầng thấp hơn được đếm riêng, ví dụ "Đã dịch 7 trên 9 (2 đoạn là bản dịch tạm)". Khi mọi tầng đều dịch lỗi một đoạn, dòng chữ đỏ "Dịch thất bại, nhấn để thử lại" xuất hiện sau đoạn đó; di chuột lên sẽ thấy thông báo lỗi, nhấn vào sẽ dịch lại đoạn đó.

Alt+A dịch thư hiện tại hoặc khôi phục bản gốc; Alt+S chuyển giữa song ngữ và chỉ bản dịch. Có thể đổi cả hai phím tắt trong mục "Quản lý phím tắt tiện ích mở rộng" ở menu bánh răng của Trình quản lý tiện ích.

Ở chế độ chỉ bản dịch, di chuột lên một bản dịch sẽ hiện văn bản gốc trong chú thích nổi.

## Cài đặt tiện ích

Mở trang cài đặt bằng nút "Tùy chọn" của tiện ích này trong Trình quản lý tiện ích. Cài đặt được lưu tự động; dòng chữ "Đã lưu" xuất hiện ở góc trên bên phải sau khi ghi xong.

| Mục | Nội dung |
| --- | --- |
| Chung | Ngôn ngữ giao diện, ngôn ngữ nguồn, ngôn ngữ đích, chế độ hiển thị mặc định, dịch tự động |
| Các tầng dịch | Dịch vụ của từng tầng hoặc "Không dùng"; dịch chính xác |
| Dịch vụ dịch | Dịch vụ chia thành hai nhóm, "Đã thêm" và "Có thể thêm"; điểm cuối, khóa API, mô hình, nhiệt độ và chế độ suy nghĩ của từng dịch vụ; nút "Kiểm tra kết nối", "Thêm", "Dùng dịch vụ này" và "Gỡ" |
| Từ điển | Các cặp ngôn ngữ của tầng từ điển kèm dung lượng, giấy phép và ghi nhận nguồn; tải xuống và xóa; thẻ bản phát hành của các gói (nâng cao) |
| Mô hình dịch ngoại tuyến (Bergamot) | Các chiều dịch của mô hình Bergamot kèm dung lượng và phiên bản; lọc theo ngôn ngữ; tải xuống, cập nhật, hủy và xóa; các chiều dịch mà ngôn ngữ hiện tại cần |
| Lời nhắc (tầng AI) | Lời nhắc cho hiển thị song ngữ, hiển thị chỉ bản dịch và dịch chính xác, mỗi lời nhắc có nút "Khôi phục lời nhắc tích hợp sẵn" |
| Gộp yêu cầu | Thời gian gom đoạn, số ký tự và số đoạn tối đa mỗi yêu cầu, số yêu cầu đồng thời, số lần thử lại, có gộp yêu cầu AI hay không |
| Kiểu bản dịch | Viền trái, viền trái nét đứt, tô sáng hoặc đơn giản; màu nhấn, độ đục của chữ, tỷ lệ cỡ chữ; xem trước trực tiếp |
| Bộ nhớ đệm | Bật hoặc tắt bộ nhớ đệm, số đoạn tối đa trong bộ nhớ đệm, số mục hiện có, xóa bộ nhớ đệm |

"Kiểm tra kết nối" gửi một câu thử với các giá trị đang có trong ô nhập. Khi thành công, nút hiển thị bản dịch; khi thất bại, nút hiển thị lỗi do dịch vụ trả về, ví dụ khóa không hợp lệ hoặc tên mô hình không tồn tại.

## Thêm và gỡ dịch vụ

Danh sách bên cạnh trong phần dịch vụ dịch có hai nhóm. "Đã thêm" gồm các dịch vụ xuất hiện trong danh sách dịch vụ của cửa sổ bật lên và của trang cài đặt; "Có thể thêm" gồm tất cả dịch vụ còn lại. Chọn một dịch vụ sẽ hiện cấu hình và các nút của nó:

- Dịch vụ chưa được thêm có nút "Thêm". Nhập khóa API (với DeepLX là điểm cuối) cũng thêm dịch vụ.
- Dịch vụ đã thêm có nút "Dùng dịch vụ này", nút này đặt dịch vụ vào tầng của nó, và nút "Gỡ". Gỡ đưa dịch vụ ra khỏi các danh sách nhưng giữ lại cấu hình, nên khi thêm lại, khóa và mô hình được khôi phục.
- Không thể gỡ dịch vụ mà một tầng đang dùng. Khi đó nút "Gỡ" bị vô hiệu hóa và một dòng bên dưới nêu tên tầng đó. Trong danh sách bên cạnh, các dịch vụ đang được dùng mang nhãn "Đang dùng".

Bản cài đặt mới bắt đầu với Google Dịch và Microsoft Translator đã được thêm. Từ điển và Bergamot cần dữ liệu do bạn tải xuống, nên phải thêm thủ công. Khi tải cài đặt của phiên bản 1.1 trở về trước, một dịch vụ được coi là đã thêm trong các trường hợp sau:

| Dịch vụ | Được coi là đã thêm khi |
| --- | --- |
| Google Dịch, Microsoft Translator | luôn luôn |
| DeepLX | đã điền điểm cuối |
| Dịch vụ AI cần khóa | đã lưu khóa API |
| Ollama, LM Studio, Tùy chỉnh tương thích OpenAI | điểm cuối, mô hình hoặc nhiệt độ đã bị thay đổi |
| dịch vụ của các tầng | luôn luôn |

## Các tầng dịch

| Tầng | Dịch vụ | Kết quả |
| --- | --- | --- |
| 1 Từ điển | Từ điển (ngoại tuyến) | bản dịch từng từ dựa trên các gói từ điển đã cài, có ngay và không cần mạng |
| 2 Dịch máy | Google Dịch, Microsoft Translator, DeepLX, Bergamot (ngoại tuyến) | bản dịch đầy đủ trong vòng một hai giây |
| 3 Dịch bằng AI | 22 nhà cung cấp AI | bản dịch tốt nhất, theo lời nhắc của chế độ hiển thị |

Mỗi tầng có một dịch vụ hoặc "Không dùng", và ít nhất một tầng có dịch vụ. Mặc định chỉ có Google Dịch ở tầng 2.

Mỗi đoạn được gửi cùng lúc đến mọi tầng đang dùng. Mỗi tầng dùng cơ chế gộp yêu cầu và bộ nhớ đệm thông thường. Nội dung thư hiển thị theo một quy tắc: tầng cao nhất đã trả lời được ưu tiên.

| Trường hợp | Thư hiển thị gì |
| --- | --- |
| Một tầng thấp hơn trả lời trước | bản dịch của tầng đó, in nghiêng kèm nhãn ghi tên tầng ("Từ điển", "Dịch máy"); di chuột lên sẽ thấy tầng nào vẫn đang chạy. Tầng cao hơn thay thế nó khi trả lời. |
| Tầng cao nhất đang dùng trả lời | bản dịch của tầng đó, không có nhãn: đây là bản dịch cuối cùng. Kết quả của các tầng thấp hơn đến sau bị bỏ qua. |
| Tầng cao nhất thất bại | bản dịch tốt nhất của tầng thấp hơn được giữ lại, đánh dấu "Dịch bằng AI thất bại" (hoặc tên của tầng cao nhất); di chuột lên sẽ thấy lý do, nhấn vào chỉ dịch lại ở các tầng đã thất bại |
| Mọi tầng đều thất bại | dòng chữ đỏ "Dịch thất bại, nhấn để thử lại" |
| Bản dịch của tầng cao nhất đã có trong bộ nhớ đệm | bản dịch đó hiện ngay; các tầng thấp hơn không được hỏi |

Khi đổi chế độ hiển thị, bản dịch của từ điển và dịch máy được vẽ lại nguyên trạng. Tầng AI dùng một lời nhắc cho mỗi chế độ hiển thị, nên tầng này được hỏi lại với lời nhắc của chế độ mới; bản dịch đã có trong bộ nhớ đệm cho lời nhắc đó được trả về mà không cần gửi yêu cầu. Cửa sổ bật lên tính bản dịch cuối cùng là đã dịch và bản dịch của tầng thấp hơn là bản dịch tạm.

Cài đặt do phiên bản 1.3 trở về trước lưu được chuyển đổi một lần: nếu dịch vụ hiện tại là dịch vụ AI, nó trở thành tầng 3, và khi dịch song song đang bật thì dịch vụ nhanh của chế độ đó trở thành tầng 2; mọi dịch vụ hiện tại khác trở thành tầng 2. Tầng từ điển ban đầu không được dùng.

## Ngôn ngữ nguồn

Ngôn ngữ nguồn mặc định là "Tự động phát hiện", hoặc là một trong 20 ngôn ngữ của danh sách ngôn ngữ đích. Ngôn ngữ nguồn được truyền cho mọi dịch vụ:

| Dịch vụ | Tự động phát hiện | Ngôn ngữ cố định |
| --- | --- | --- |
| Google Dịch | `sl=auto` | `sl=<code>` |
| Microsoft Translator, miễn phí và dùng khóa | không có tham số `from` | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (các biến thể tiếng Trung đều là `ZH`) |
| Dịch vụ AI | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Từ điển | phát hiện theo từng đoạn | ngôn ngữ đã đặt |
| Bergamot | `"auto"`, với ngôn ngữ xác định theo hệ chữ và các từ dừng tiếng Anh làm phương án dự phòng | ngôn ngữ đã đặt |

Như trước đây, các đoạn được nhận diện là ngôn ngữ đích sẽ được bỏ qua. Khi ngôn ngữ nguồn cố định, các đoạn không nhận diện được ngôn ngữ một cách đáng tin cậy được coi là ngôn ngữ đó. Khóa bộ nhớ đệm và lô đều chứa ngôn ngữ nguồn, nên sau khi đổi ngôn ngữ nguồn, tiện ích không bao giờ trả về bản dịch tạo theo cài đặt cũ.

## Lời nhắc

Tầng AI có ba lời nhắc hệ thống. Mỗi lời nhắc có thể sửa trên trang cài đặt và khôi phục bằng nút "Khôi phục lời nhắc tích hợp sẵn"; để trống ô nhập cũng có nghĩa là dùng lời nhắc tích hợp sẵn. `{{to}}` được thay bằng tên tiếng Anh của ngôn ngữ đích. Tiện ích tự thêm ngôn ngữ nguồn và định dạng lô vào mọi yêu cầu.

| Lời nhắc | Dùng cho | Lời nhắc tích hợp sẵn yêu cầu |
| --- | --- | --- |
| Hiển thị song ngữ | tầng AI ở chế độ song ngữ | bản dịch sát bản gốc, dịch từng câu theo đúng thứ tự, không thêm và không bớt, vì người đọc đối chiếu bản dịch với bản gốc |
| Hiển thị chỉ bản dịch | tầng AI ở chế độ chỉ bản dịch | văn bản trôi chảy, đọc như một email viết bằng ngôn ngữ đích; có thể sắp xếp lại mệnh đề, tách hoặc gộp câu, miễn là giữ trọn ý nghĩa |
| Dịch chính xác | tầng AI khi dịch chính xác đang bật, ở cả hai chế độ hiển thị | thuật ngữ, tên riêng và cách xưng hô nhất quán trong toàn bộ thư, dựa vào bảng thuật ngữ, bản tóm tắt và các đoạn lân cận |

Khóa bộ nhớ đệm và khóa lô chứa loại lời nhắc và giá trị băm của nội dung lời nhắc. Vì vậy, sau khi sửa một lời nhắc, tiện ích không bao giờ trả về bản dịch tạo bằng nội dung cũ. Lời nhắc hệ thống tùy chỉnh do phiên bản 1.3 trở về trước lưu trở thành lời nhắc của cả hai chế độ hiển thị; lời nhắc dịch chính xác bắt đầu với nội dung tích hợp sẵn.

## Dịch chính xác

Dịch chính xác áp dụng cho tầng AI và gửi kèm thư làm ngữ cảnh trong mọi yêu cầu AI. Có thể bật chế độ này trong cửa sổ bật lên hoặc trong phần "Các tầng dịch" của trang cài đặt. Khi bắt đầu dịch, tập lệnh nội dung ghép các đoạn đã tìm thấy thành văn bản thuần của thư (cắt sau 20000 ký tự, kèm ghi chú rằng văn bản còn tiếp) và đăng ký văn bản đó với tập lệnh nền một lần. Thư được nhận diện bằng giá trị băm của toàn bộ văn bản; việc cắt chỉ áp dụng cho văn bản gửi làm ngữ cảnh.

Luồng xử lý phụ thuộc vào kích thước các đoạn cần dịch:

1. Nếu chúng vừa trong một yêu cầu (trong giới hạn "Số ký tự tối đa mỗi yêu cầu" và "Số đoạn tối đa mỗi yêu cầu"), một yêu cầu dịch tất cả; bản thân yêu cầu đó mang theo toàn bộ thư.
2. Nếu không, một yêu cầu bổ sung sẽ phân tích toàn bộ thư trước và trả về bản tóm tắt hai đến ba câu, bảng thuật ngữ gồm tên người, sản phẩm và các danh từ riêng khác kèm cách dịch cần dùng, cùng giọng điệu và cách xưng hô. Nếu không đọc được câu trả lời này, việc dịch vẫn tiếp tục mà không có nó.
3. Sau đó mọi yêu cầu bắt đầu bằng cùng một tiền tố: lời nhắc hệ thống, bản phân tích và, với thư dài đến khoảng 8000 ký tự, toàn văn. Sau tiền tố là các đoạn của lô, mỗi đoạn kèm đoạn liền trước và liền sau làm tham chiếu, các đoạn tham chiếu này không được dịch.

Tiền tố giống nhau từng ký tự trong mọi yêu cầu của một thư, nên các nhà cung cấp có lưu bộ nhớ đệm cho tiền tố lời nhắc lặp lại có thể phục vụ nó từ bộ nhớ đệm của họ. Với Anthropic, tiền tố được đánh dấu bằng `cacheControl: { type: "ephemeral" }`. Bản phân tích được lưu vào bộ nhớ đệm như bản dịch, với khóa gồm nhà cung cấp, mô hình, ngôn ngữ đích và giá trị băm của văn bản thư; các lô của cùng một thư chờ cùng một yêu cầu phân tích.

Bản dịch ở chế độ chính xác được lưu vào bộ nhớ đệm với khóa chứa giá trị băm của thư, và các lô không bao giờ trộn đoạn của những thư khác nhau. Vì vậy cùng một câu trong thư khác được dịch lại, với thư đó làm ngữ cảnh. Yêu cầu phân tích và các lời nhắc dài hơn khiến dịch chính xác tốn kém hơn dịch thông thường.

## Dịch bằng từ điển

Dịch vụ từ điển dịch từng từ bằng các gói từ điển lưu trong hồ sơ Thunderbird. Khi gói đã được cài, dịch vụ này không cần mạng và trả lời trong vài mili giây, nên nó lấp khoảng thời gian chờ tầng dịch máy và tầng AI trả lời. Kết quả là bản dịch từng từ: các từ giữ thứ tự của văn bản nguồn, không áp dụng ngữ pháp.

### Gói từ điển

Các gói được phát hành dưới dạng tệp đính kèm của một bản phát hành GitHub của kho mã này, mặc định là bản phát hành `dicts-v1`. Có thể đổi thẻ bản phát hành ở mục "Thẻ bản phát hành của các gói từ điển (nâng cao)" trong phần Từ điển. Mỗi chiều dịch là một tệp `dict-<src>-<tgt>.tsv.gz`, tức một tệp văn bản UTF-8 nén bằng gzip:

```text
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
w	<key>	<translation>
f	<key>	<lemmaKey>
```

Dòng đầu tiên mô tả gói. Các dòng bắt đầu bằng `w` là mục từ, các dòng bắt đầu bằng `f` ánh xạ một dạng biến tố sang khóa của dạng gốc (lemma), ví dụ `went` sang `go`. Khóa được chuẩn hóa NFC, chuyển sang chữ thường theo quy tắc của ngôn ngữ nguồn và cắt khoảng trắng ở hai đầu; khóa có thể là một cụm gồm nhiều từ. Tệp chỉ mục `dict-index.json` liệt kê mọi gói kèm dung lượng, số mục từ và số dạng biến tố, giá trị kiểm tra SHA-256, nguồn, giấy phép và ghi nhận nguồn. Các gói bao gồm tiếng Anh, tiếng Trung giản thể và phồn thể, tiếng Nhật, tiếng Hàn, tiếng Pháp, tiếng Đức, tiếng Tây Ban Nha, tiếng Bồ Đào Nha, tiếng Nga, tiếng Thổ Nhĩ Kỳ và tiếng Việt. [docs/dictionary-packs.md](../docs/dictionary-packs.md) mô tả cách tạo các gói.

Phần Từ điển đọc tệp chỉ mục và liệt kê mọi gói kèm dung lượng, giấy phép và ghi nhận nguồn. "Tải xuống" tải tệp về và hiển thị tiến độ, kiểm tra giá trị SHA-256 và phần đầu tệp, rồi lưu vào cơ sở dữ liệu IndexedDB `tt-dictionary` của tiện ích; "Xóa" gỡ tệp đó. Nếu không tải được tệp chỉ mục, phần này nêu lý do, và các gói đã cài vẫn có thể xóa.

### Cách dịch

1. Ngôn ngữ nguồn là ngôn ngữ đã đặt; khi tự động phát hiện, đó là ngôn ngữ của đoạn (theo hệ chữ, bộ nhận diện của trình duyệt và các từ dừng tiếng Anh).
2. `Intl.Segmenter` tách đoạn thành các từ. Tại mỗi từ, cụm dài nhất (tối đa ba từ) có mục từ được chọn trước, sau đó mới đến từ đơn. Từ không có mục từ được tra qua dạng gốc của nó; nếu vẫn không có, từ được giữ nguyên. Dấu câu và con số được giữ nguyên.
3. Khi ngôn ngữ đích là tiếng Trung hoặc tiếng Nhật, các từ được nối liền không có khoảng trắng; với các ngôn ngữ đích khác, các từ cách nhau bằng khoảng trắng.
4. Giữa hai ngôn ngữ đều khác tiếng Anh, văn bản đi qua tiếng Anh: tiếng Pháp sang tiếng Đức dùng gói Pháp → Anh và gói Anh → Đức.
5. Khi thiếu một gói cần thiết, thông báo lỗi nêu cặp ngôn ngữ và chỉ đến phần Từ điển.

Tập lệnh nền đọc một gói từ IndexedDB ở lần dùng đầu tiên và giữ gói đó trong bộ nhớ; sau năm phút không có yêu cầu dịch bằng từ điển, bộ nhớ này được giải phóng.

### Nguồn dữ liệu

Các gói được tạo từ Wiktionary, do wiktextract trích xuất và kaikki.org phát hành (CC BY-SA 4.0, © những người đóng góp cho Wiktionary), và từ ECDICT của skywind3000 (Giấy phép MIT). Mỗi gói ghi nguồn và giấy phép riêng trong tệp chỉ mục, và trang cài đặt hiển thị các thông tin này bên cạnh gói.

## Dịch ngoại tuyến (Bergamot)

Dịch vụ Bergamot dịch ngay trên máy tính của bạn bằng công cụ dịch và các mô hình của Firefox Translations, do Mozilla phát hành theo giấy phép MPL-2.0. Công cụ dịch đi kèm tiện ích; mỗi chiều dịch được tải xuống một lần từ Mozilla, dung lượng 24 đến 48 MB, và được lưu trong IndexedDB của tiện ích. Một chiều dịch đã nạp chiếm khoảng 200 MB bộ nhớ và được giải phóng sau năm phút không dùng. Mọi mô hình đều có tiếng Anh ở một phía, nên dịch tiếng Nhật sang tiếng Trung dùng chiều Nhật → Anh và chiều Anh → Trung.

Phần "Mô hình dịch ngoại tuyến (Bergamot)" của trang cài đặt liệt kê 114 chiều dịch giữa 58 ngôn ngữ kèm dung lượng và phiên bản, có thể lọc theo ngôn ngữ. Phần này nêu các chiều dịch mà ngôn ngữ nguồn và ngôn ngữ đích hiện tại cần và đưa chúng lên đầu danh sách. Quá trình tải xuống hiển thị tiến độ và có thể hủy; một chiều dịch đã cài mà Mozilla cung cấp phiên bản mới hơn sẽ hiện nút "Cập nhật". Khi xóa một chiều dịch mà ngôn ngữ hiện tại cần, tiện ích yêu cầu xác nhận. Việc cài đặt, dịch và gỡ đều chạy trong tập lệnh nền, nơi công cụ dịch hoạt động. [docs/bergamot.md](../docs/bergamot.md) mô tả cách chọn mô hình, kiểm tra, lưu trữ và công cụ dịch.

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
| Từ điển (ngoại tuyến) | Tải các cặp ngôn ngữ trong phần Từ điển | Dịch từng từ bằng các gói đã cài, xem "Dịch bằng từ điển" |
| Bergamot (ngoại tuyến) | Tải các chiều dịch trong phần "Mô hình dịch ngoại tuyến" | Dịch trên máy tính của bạn bằng các mô hình của Mozilla, xem "Dịch ngoại tuyến (Bergamot)" |
| Microsoft Translator (miễn phí) | Không cần | Gọi `edge.microsoft.com/translate/translatetext`, điểm cuối mà trình duyệt Edge dùng; thân yêu cầu là một mảng các đoạn. Tùy chọn “Dùng khóa của tôi (Azure Translator)” trong bảng cài đặt sẽ gọi API chính thức `api.cognitive.microsofttranslator.com`: tạo tài nguyên Translator trong cổng Azure, rồi chép khóa và khu vực ở mục “Keys and Endpoint” vào bảng (tài nguyên toàn cầu có thể để trống khu vực). |
| DeepLX | Bắt buộc nhập điểm cuối | Dịch vụ DeepLX tự lưu trữ hoặc của bên thứ ba; token là tùy chọn. Nếu điểm cuối chứa `{{apiKey}}`, token sẽ thay vào vị trí đó; nếu không, token được gửi dưới dạng `Authorization: Bearer` |

### Nhà cung cấp AI

Mọi nhà cung cấp AI đều được gọi qua `generateText` của Vercel AI SDK. Nhà cung cấp có gói `@ai-sdk/*` chính thức thì dùng gói đó; các nhà cung cấp còn lại dùng `@ai-sdk/openai-compatible`. Điểm cuối, khóa API, mô hình và nhiệt độ đều đổi được cho mọi nhà cung cấp. Ô mô hình gợi ý các mô hình thường dùng và cũng chấp nhận bất kỳ tên mô hình nào.

| Nhà cung cấp | Gói SDK | Điểm cuối mặc định | Mô hình mặc định | Cần khóa |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Có |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Có |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Có |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Có |
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

### Chế độ suy nghĩ

Mỗi nhà cung cấp AI có một công tắc "Chế độ suy nghĩ", mặc định tắt. Dịch không cần mô hình suy nghĩ trước, và suy nghĩ làm yêu cầu chậm hơn và tốn kém hơn. Nhiều mô hình hiện nay tự suy nghĩ nếu không được yêu cầu khác, ví dụ `deepseek-flash`, `claude-haiku-5-5` và `gemini-2.5-flash`, nên giá trị "tắt" được gửi đi một cách tường minh.

Mỗi nhà cung cấp viết công tắc này một kiểu, và ngay trong một nhà cung cấp cũng chỉ một số mô hình chấp nhận nó. Tiện ích so khớp tên mô hình với các mẫu bên dưới và gửi tùy chọn của nhà cung cấp theo mẫu khớp đầu tiên; mô hình không khớp mẫu nào thì không nhận tham số suy nghĩ. Khi suy nghĩ đang bật, không gửi nhiệt độ cho các mô hình khớp với một mẫu trong bảng, vì các mô hình suy nghĩ bỏ qua hoặc từ chối nó.

| Nhà cung cấp | Mô hình | Tắt | Bật | Nguồn |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` trở lên | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
|  | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | như trên |
|  | `o1`, `o3`, `o4-mini` … | `"low"` (không tắt được) | `"medium"` | như trên |
| Anthropic | dòng Claude 5, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
|  | Claude 3.7 và 4.x | không gửi gì (mặc định tắt) | `{ type: "enabled", budgetTokens: 1024 }` | như trên |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }` (giá trị tối thiểu, không tắt được) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
|  | các mô hình `gemini-2.5-*` khác | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | như trên |
|  | Gemini 3 trở lên | `{ thinkingLevel: "low" }` (không tắt hẳn được) | `{ thinkingLevel: "high" }` | như trên |
| DeepSeek | tất cả | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
|  | `grok-3-mini` | `"low"` | `"high"` | như trên |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"` kèm `reasoningFormat: "parsed"` | [Groq reasoning](https://console.groq.com/docs/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | như trên |
| Mistral AI | tất cả (SDK chỉ gửi tham số cho mô hình chấp nhận nó) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | như trên |
| DeepInfra | tất cả (mô hình không có chế độ suy nghĩ sẽ bỏ qua) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
|  | `gpt-oss` | `"low"` | `"medium"` | như trên |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
|  | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | như trên |
| DashScope | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | tất cả | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | mô hình luôn suy nghĩ (`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro và 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
|  | tất cả mô hình còn lại (mô hình không có chế độ suy nghĩ sẽ bỏ qua) | `{ enabled: false }` | `{ enabled: true }` | như trên |
| Zhipu GLM | GLM-4.5 trở lên | `zhipu.thinking: { type: "disabled" }`; không gửi gì cho GLM-5.3, vì mô hình này từ chối tham số | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5+, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| Volcengine Doubao | mô hình Seed và mô hình suy nghĩ | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark documentation](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio và dịch vụ Tùy chỉnh tương thích OpenAI không có tham số suy nghĩ nào được ghi trong tài liệu ở điểm cuối mà tiện ích dùng. Công tắc của các dịch vụ này bị vô hiệu hóa, và trang cài đặt cũng thông báo điều đó.

Với các cấu hình sẵn tương thích OpenAI (Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao), tùy chọn được ghi dưới ID cấu hình, và `@ai-sdk/openai-compatible` sao chép chúng nguyên trạng vào thân yêu cầu; khóa duy nhất nó đổi tên là `reasoningEffort`, thành `reasoning_effort`.

## Cách gộp yêu cầu hoạt động

Một thư thường có từ mười đến vài chục đoạn. Nếu mỗi đoạn là một yêu cầu, đoạn nào cũng mang theo một bản sao của lời nhắc hệ thống và chỉ dẫn, và đoạn nào cũng tiêu tốn một yêu cầu trong giới hạn tần suất. Gộp yêu cầu ghép các đoạn đến gần nhau về thời gian vào một yêu cầu, nên cả hai chi phí được tính theo lô thay vì theo đoạn.

### Luồng xử lý

1. Tập lệnh nội dung chuyển từng đoạn cần dịch cho tập lệnh nền, một lần cho mọi tầng đang dùng.
2. Với mỗi tầng, tập lệnh nền tra bộ nhớ đệm trước và trả lời ngay khi trúng. Khóa bộ nhớ đệm gồm nhà cung cấp, mô hình, ngôn ngữ nguồn và ngôn ngữ đích, với dịch vụ AI có thêm loại lời nhắc và giá trị băm của nội dung lời nhắc, ở chế độ chính xác có thêm giá trị băm của thư, và giá trị băm của văn bản đoạn. Khi cùng một văn bản đang được dịch, các yêu cầu đến sau dùng chung kết quả đó.
3. Các đoạn không có trong bộ nhớ đệm đi vào hàng đợi lô, được nhóm theo nhà cung cấp + mô hình + điểm cuối + ngôn ngữ nguồn + ngôn ngữ đích, với dịch vụ AI còn nhóm theo lời nhắc, với Microsoft Translator còn nhóm theo chế độ miễn phí hoặc dùng khóa, ở chế độ chính xác còn nhóm theo thư. Các đoạn của một nhóm được gom trong 50 ms. Một nhóm được gửi đi khi hết thời gian gom, khi đạt giới hạn số đoạn, hoặc khi đoạn tiếp theo sẽ vượt giới hạn ký tự. Một đoạn đơn lẻ dài hơn giới hạn ký tự tự tạo thành một lô riêng.
4. Hàng đợi yêu cầu thực thi từng lô. Hàng đợi giới hạn số yêu cầu đồng thời và thử lại các lỗi 408, 429, 5xx và lỗi mạng với thời gian chờ tăng theo hàm mũ; khi máy chủ gửi `Retry-After`, hàng đợi chờ đúng khoảng thời gian đó, tối đa 30 giây. Các lỗi như 401 và 400 được báo ngay mà không thử lại.
5. Kết quả được đưa vào bộ nhớ đệm trong bộ nhớ và được ghi vào `storage.local` trong một lần ghi sau 1 giây. Bộ nhớ đệm loại bỏ các mục ít được dùng gần đây nhất (LRU).

### Cách mỗi dịch vụ gộp đoạn

- Từ điển và Bergamot: cả lô được dịch trong một lần gọi cục bộ.
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
- Văn bản thư chỉ được gửi đến dịch vụ của các tầng đang dùng. Từ điển và Bergamot dịch trên máy tính của bạn và không gửi văn bản đi đâu cả. Gói từ điển được tải từ các bản phát hành GitHub của kho mã này, còn mô hình Bergamot được tải từ Mozilla, và chỉ khi bạn nhấn "Tải xuống". Tiện ích không thu thập số liệu thống kê và không liên hệ với địa chỉ mạng nào khác.
- Bộ nhớ đệm bản dịch được lưu cục bộ và có thể tắt hoặc xóa trên trang cài đặt.
- Khi dùng Google, Microsoft, DeepLX hoặc một dịch vụ AI trực tuyến, văn bản thư rời khỏi máy tính của bạn. Với thư nhạy cảm, chỉ dùng từ điển, Bergamot và các mô hình AI cục bộ như Ollama hoặc LM Studio; chúng giữ mọi yêu cầu trên chính máy của bạn.

## Hạn chế đã biết

- Bản dịch là văn bản thuần. Liên kết, chữ đậm và các định dạng nội dòng khác của bản gốc không được giữ lại trong bản dịch. Ở chế độ song ngữ, bản gốc vẫn dùng được đầy đủ; ở chế độ chỉ bản dịch, bạn có thể di chuột để xem bản gốc hoặc chuyển lại sang song ngữ.
- Các điểm cuối miễn phí của Google và Microsoft không có tài liệu chính thức và có thể thay đổi hoặc bị giới hạn tần suất. Microsoft đã ngừng điểm cuối cấp token `edge.microsoft.com/translate/auth` vào tháng 7 năm 2026; tiện ích chỉ dùng điểm cuối trực tiếp.
- Để xác định một đoạn đã ở ngôn ngữ đích hay chưa, tiếng Trung, tiếng Nhật, tiếng Hàn và các hệ chữ tương tự được nhận diện theo lớp ký tự, còn các ngôn ngữ dùng chữ Latinh và chữ Kirin trước tiên dùng `i18n.detectLanguage` của API tiện ích. Khi API này không khả dụng hoặc kết quả không đáng tin cậy, chỉ tiếng Anh được nhận diện chính xác; các đoạn bằng ngôn ngữ chữ Latinh khác vẫn được gửi đi dịch như bình thường.
- Tập lệnh nội dung được đăng ký qua `messageDisplayScripts` và chỉ tác động đến các thư được mở sau khi đăng ký. Khi khởi động, tiện ích thử chèn tập lệnh vào các thư đang mở; nếu không thành công, chỉ cần chọn lại thư đó.
- Thông báo lỗi do tiện ích tạo ra được dịch. Văn bản lỗi do dịch vụ dịch hoặc AI SDK trả về (ví dụ nội dung của phản hồi HTTP 401) được hiển thị nguyên dạng nhận được, thường là tiếng Anh.
- Tên tiện ích, mô tả của tiện ích trong Trình quản lý tiện ích và mô tả phím tắt theo ngôn ngữ giao diện của Thunderbird, không theo tùy chọn ngôn ngữ giao diện.
- Dịch chính xác nhận diện một thư bằng giá trị băm của văn bản nội dung, vì tập lệnh nội dung không truy cập được ID thư. Hai bản sao của cùng một văn bản dùng chung bản dịch và bản phân tích.
- Việc lưu bộ nhớ đệm cho lời nhắc do nhà cung cấp quyết định. Anthropic chỉ lưu các tiền tố vượt một độ dài tối thiểu tùy theo mô hình; tiền tố ngắn hơn được gửi và tính phí như bình thường.
- Công tắc suy nghĩ hoạt động bằng cách so khớp tên mô hình. Một mô hình mới có tên không khớp mẫu nào sẽ không nhận tham số suy nghĩ cho đến khi bảng trong `src/background/providers/thinking.ts` được mở rộng.
- Mỗi tầng đang dùng gửi yêu cầu riêng. Khi cả tầng AI và tầng dịch máy đều được dùng, mỗi thư còn tốn thêm yêu cầu đến trình dịch máy, và các yêu cầu này tính vào giới hạn tần suất của các điểm cuối miễn phí của Google và Microsoft.
- Dịch bằng từ điển là bản dịch từng từ: giữ thứ tự từ của văn bản nguồn và không biến tố. Các từ không có trong gói được giữ nguyên, không dịch.
- Bergamot và từ điển dịch một lô với một ngôn ngữ nguồn. Khi tự động phát hiện, Bergamot nhận diện ngôn ngữ của cả lô, nên một lô trộn nhiều ngôn ngữ được dịch theo ngôn ngữ chiếm ưu thế.

## Kiểm thử

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules, with and without a source language
```

Các bài kiểm thử đơn vị bao gồm: nhóm lô và hàng đợi; phân tích đầu ra AI và cơ chế dự phòng; nhận diện đoạn cùng việc hiển thị song ngữ, chỉ bản dịch và khôi phục (trong jsdom); dựng yêu cầu và phân tích phản hồi cho Google, Microsoft và DeepLX (với fetch giả lập); URL yêu cầu và header xác thực của mọi cấu hình sẵn AI; tham số suy nghĩ của từng nhà cung cấp; việc chuyển cài đặt cũ sang dịch vụ đã thêm, sang các tầng và các lời nhắc; danh sách của các tầng trong cửa sổ bật lên và trang cài đặt, việc từ chối để mọi tầng đều trống, và cơ chế chặn gỡ; các tầng (tầng thấp hơn đến trước rồi bị thay thế, tầng cao nhất đến trước và kết quả tầng thấp hơn đến sau bị bỏ qua, tầng cao nhất thất bại và kết quả tầng thấp hơn được giữ lại, mọi tầng đều thất bại, tầng không dùng, tầng cao nhất trúng bộ nhớ đệm); việc chọn lời nhắc và khóa bộ nhớ đệm; việc đổi chế độ hiển thị hỏi lại tầng AI và chỉ vẽ lại các tầng khác; ngôn ngữ nguồn trong yêu cầu của mọi dịch vụ và trong khóa bộ nhớ đệm; gói từ điển (phân tích tệp, tách từ và so khớp cụm từ, dạng biến tố, dịch qua tiếng Anh, thiếu gói, tải xuống kèm kiểm tra giá trị SHA-256, với một IndexedDB trong bộ nhớ); dịch vụ Bergamot và việc quản lý mô hình của nó với công cụ dịch giả lập; dịch chính xác (một yêu cầu, phân tích kèm nhiều lô, phân tích thất bại, khóa bộ nhớ đệm và lô theo từng thư, tiền tố lời nhắc giống hệt với điều khiển bộ nhớ đệm của Anthropic); và bản địa hóa: tập khóa và phần giữ chỗ giống nhau ở mọi ngôn ngữ, mọi tham chiếu `__MSG_*__` trong manifest, ánh xạ ngôn ngữ của Thunderbird sang ngôn ngữ được hỗ trợ, quay về tiếng Anh khi thiếu khóa, và việc không có văn bản giao diện viết cứng trong các trang HTML và mã nguồn.

`npm run build:debug` tạo một bản xpi gỡ lỗi, bắt đầu dịch ngay khi mở thư và ghi tiến độ ra console, dùng để kiểm tra toàn bộ luồng trong Thunderbird thật.

## Cấu trúc dự án

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators, dictionary, offline model management
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page
  offline/       Bergamot engine module: model list, download, storage, worker
  shared/        shared settings, provider presets, prompts, language table and detection, message types, i18n runtime
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, locale generation and checks, live endpoint test
readmes/         translated versions of this README
docs/            demo GIF used in this README
tests/           vitest tests
```

## Dịch giao diện

Văn bản giao diện nằm trong `locales/<language>.json`, mỗi ngôn ngữ là một đối tượng phẳng khóa → văn bản. `locales/en.json` là bản tham chiếu: mọi tệp khác có đúng cùng các khóa. `$1` đến `$9` là phần thay thế và phải xuất hiện trong mỗi bản dịch với cùng các số như bản tiếng Anh; `{{apiKey}}` và `{{to}}` là token nguyên văn và giữ nguyên. Tên sản phẩm như Google Translate, OpenAI hay DeepLX không được dịch.

`npm run build` chuyển các tệp này thành `dist/_locales/<language>/messages.json`, định dạng mà Thunderbird đọc. Bộ i18n riêng của tiện ích nạp chính các tệp đó khi chạy, nên ngôn ngữ giao diện đổi được mà không cần khởi động lại Thunderbird. Khóa bị thiếu sẽ quay về tiếng Anh.

Để thêm một ngôn ngữ, hãy tạo `locales/<code>.json` với đầy đủ khóa, thêm mã ngôn ngữ cùng tên gốc của ngôn ngữ đó vào `SUPPORTED_LOCALES` trong `src/shared/locales.ts`, rồi chạy `npm run locales:check` và `npm test`.

## Ghi nhận

Thiết kế nhận diện đoạn, hàng đợi lô, lời nhắc và cấu hình nhà cung cấp dựa theo [Read Frog](https://github.com/mengxi-ream/read-frog), một tiện ích trình duyệt dịch trang web phát hành theo giấy phép GPL-3.0. Dự án này đưa các ý tưởng đó sang trình đọc thư của Thunderbird và điều chỉnh cho email, ví dụ tách thư văn bản thuần tại các dòng trống và nối các dòng bị ngắt cứng.

Dữ liệu từ điển lấy từ [Wiktionary](https://en.wiktionary.org/) (© những người đóng góp cho Wiktionary, CC BY-SA 4.0), do [wiktextract](https://github.com/tatuylonen/wiktextract) trích xuất và [kaikki.org](https://kaikki.org/) phát hành, và từ [ECDICT](https://github.com/skywind3000/ECDICT) của skywind3000 (Giấy phép MIT). Dịch ngoại tuyến dùng công cụ dịch [Bergamot](https://browser.mt/) và các mô hình dịch của Firefox Translations, do Mozilla phát hành theo giấy phép MPL-2.0.

## Giấy phép

GPL-3.0-or-later. Xem toàn văn tại [LICENSE](../LICENSE).
