# Hướng dẫn bật đồng bộ tức thời (Firebase) cho La Bàn Việc

Từ bản `index.html` này, **cấu hình Firebase đã được gắn sẵn trong app** (dự án `la-ban-ac4f8`
bạn đã tạo) — bạn **không cần dán JSON vào app nữa**, mục 9 trong Cài đặt chỉ còn đúng 1 nút
"Đăng nhập bằng Google". Phần còn lại (bật đăng nhập Google, bật Firestore, dán Security Rules)
bạn vẫn cần tự làm 1 lần trên Firebase Console — Claude không có quyền truy cập tài khoản
Google/Firebase Console của bạn để làm thay.

Nếu bạn đã tạo xong dự án + lấy được khối JSON cấu hình (bước "Add project" và "</> Web app")
thì bỏ qua bước 1-2 bên dưới, chuyển thẳng sang bước 3.

## 1. Tạo dự án Firebase (bỏ qua nếu đã có)
1. Vào https://console.firebase.google.com → **Add project / Thêm dự án**.
2. Đặt tên bất kỳ (vd "la-ban-viec"), bấm Continue.
3. Có thể tắt Google Analytics (không cần cho app này) → **Create project**.

## 2. Thêm 1 "Web app" vào dự án — để lấy cấu hình (bỏ qua nếu đã có)
1. Ở trang tổng quan dự án, bấm biểu tượng **`</>`** (Web).
2. Đặt tên app (vd "La Bàn Việc"), **KHÔNG cần** tick "Firebase Hosting".
3. Bấm **Register app** — Firebase hiện ra 1 đoạn code có `const firebaseConfig = { ... }`.
4. Nếu đây là dự án MỚI (khác `la-ban-ac4f8` đã gắn sẵn trong app), báo lại khối JSON này cho
   Claude để cập nhật vào `index.html` — mục 9 giờ không còn ô để tự dán cấu hình trong app nữa.

## 3. Bật đăng nhập bằng Google
1. Menu trái → **Authentication** → **Get started**.
2. Tab **Sign-in method** → chọn **Google** → bật (Enable) → chọn 1 email hỗ trợ → **Save**.

## 4. Cho phép domain đang host app đăng nhập được
1. Vẫn ở **Authentication** → tab **Settings** → **Authorized domains**.
2. Bấm **Add domain**, nhập đúng domain bạn đang host app, ví dụ:
   `vietquoc26.github.io`
3. Save. (`localhost` đã có sẵn để bạn tự test khi cần.)

## 5. Bật Firestore (nơi lưu dữ liệu thật)
1. Menu trái → **Firestore Database** → **Create database**.
2. Chọn vị trí máy chủ gần bạn (vd `asia-southeast1`).
3. **Chọn "Start in production mode"** (KHÔNG chọn test mode — test mode mở cho ai đọc/ghi
   cũng được trong 30 ngày rồi tự khoá, không an toàn).
4. Enable.

## 6. Dán Security Rules (bắt buộc — đây là lớp bảo mật thật sự)
1. Firestore Database → tab **Rules**.
2. Xoá hết nội dung mặc định, dán đè bằng **toàn bộ nội dung file `firestore.rules`** Claude gửi
   kèm.
3. Bấm **Publish**.

Rules này đảm bảo: chỉ đúng tài khoản Google bạn đã đăng nhập mới đọc/ghi được dữ liệu của bạn —
dù `apiKey`/`projectId` ở bước 2 không phải bí mật (ai xem mã nguồn app cũng thấy được, đây là
thiết kế bình thường của Firebase), không đăng nhập đúng tài khoản thì không làm gì được.

## 7. Đăng nhập — làm trên TỪNG thiết bị
1. Mở app La Bàn Việc (bản mới nhất) → **Cài đặt** → mục **9) Đồng bộ tức thời qua Firebase**.
2. Bấm **🔑 Đăng nhập bằng Google** → chọn tài khoản Google của bạn. (Không cần dán gì cả — cấu
   hình đã có sẵn trong app.)
3. Trạng thái sẽ đổi thành "🟢 Đang đồng bộ tức thời — đăng nhập: ...".
4. **Lặp lại đúng bước 7 này trên điện thoại** — bấm đăng nhập, chọn CÙNG 1 tài khoản Google —
   đồng bộ tức thời chỉ hoạt động giữa các thiết bị đã đăng nhập chung 1 tài khoản.

## 8. Kiểm tra
Trên máy tính, kéo-thả đổi giờ 1 việc bất kỳ (hoặc thêm/xoá 1 việc). Trên điện thoại (đang mở
app, có mạng), thay đổi sẽ tự xuất hiện trong vài giây — **không cần** mở lại app hay bấm
"Đồng bộ ngay".

## Lưu ý
- Đây là kênh **tuỳ chọn**, hoạt động **song song** với Google Sheet đang dùng (mục 8) — không
  ảnh hưởng gì tới Sheet, cả hai chạy độc lập.
- Cấu hình Firebase (apiKey, projectId...) giờ gắn sẵn trong `index.html`, không còn ô để tự dán
  trong app nữa — mục 9 chỉ còn 1 nút đăng nhập. Điều này an toàn: apiKey/projectId của Firebase
  không phải bí mật (Google thiết kế để lộ công khai trong mã nguồn cũng không sao), thứ bảo vệ
  dữ liệu là bắt buộc đăng nhập Google + Security Rules ở bước 6.
- Nếu **chưa đăng nhập**, app vẫn tự tải sẵn Firebase SDK ở nền (để nút đăng nhập dùng được ngay)
  nhưng chưa đọc/ghi dữ liệu gì — chỉ khi bạn bấm "Đăng nhập bằng Google" thành công thì đồng bộ
  mới thật sự chạy.
- Gói Firebase miễn phí (Spark) cho phép ~50.000 lượt đọc / 20.000 lượt ghi mỗi ngày, 1GiB lưu
  trữ — dư sức dùng cho 1 người dùng cá nhân, không cần nhập thẻ tín dụng.
- Nếu đổi mật khẩu/khoá tài khoản Google, chỉ cần đăng nhập lại — không cần đổi lại cấu hình.
- Nếu sau này muốn đổi sang 1 dự án Firebase khác, cấu hình phải sửa trực tiếp trong mã nguồn —
  báo lại khối JSON mới cho Claude để cập nhật giúp.
