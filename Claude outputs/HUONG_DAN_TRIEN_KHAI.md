# La Bàn Việc — hướng dẫn triển khai (bản 04/10/2026)

Thư mục này chứa đủ toàn bộ file để app chạy. Có 2 nơi cần cập nhật:

## 1. GitHub Pages (repo `vietquoc26/personal-assistant`, nhánh `main`)

Tải lên **đúng tên file, đúng vị trí** (ghi đè file cũ cùng tên trong repo):

- `index.html`
- `sw.js`
- `manifest.json`
- toàn bộ thư mục `icons/`

Lưu ý quan trọng: khi tải file từ chat về máy, trình duyệt hay tự đổi tên thành `index-11.html`, `Code-3.gs`... Trên GitHub file **bắt buộc** phải tên đúng `index.html`, nếu không trang web sẽ vẫn chạy bản cũ.

Sau khi commit, đợi lượt "pages build and deployment" trong tab **Actions** của repo có dấu ✅, rồi mở lại app. Lần đầu sau khi cập nhật, nếu chưa thấy màn hình khởi động có la bàn chuyển động: tải lại trang thêm 1 lần (trên điện thoại đã cài app: đóng hẳn app rồi mở lại).

**Không** tải thư mục `apps-script/` lên GitHub (Code.gs chứa TOKEN bí mật của bạn sau khi điền).

## 2. Google Apps Script (bắt buộc cho email nhắc nhở)

1. Mở Apps Script của file Google Sheet → dán đè toàn bộ nội dung `apps-script/Code.gs` → sửa lại dòng `var TOKEN = "..."` thành đúng Token bạn đang dùng trong app.
2. **Deploy ▸ Manage deployments ▸** chọn bản Web App đang chạy **▸ ✏️ ▸ Version: New version ▸ Deploy** (giữ nguyên URL `.../exec`).
3. Kiểm tra **Triggers** (biểu tượng đồng hồ): hàm `checkAndSendReminders` phải là **Time-driven ▸ Minutes timer ▸ Every 5 minutes**.
4. Mở app → Cài đặt → **7) Đồng bộ với Google Sheet** → bấm **Đồng bộ ngay**. Phải thấy "✅ Đã đồng bộ". Nếu Tổng quan hiện khung đỏ "Đồng bộ Google Sheet đang lỗi", làm lại bước 1–2.

## 3. Firebase (không đổi)

`firebase/firestore.rules` và `firebase/HUONG_DAN_FIREBASE.md` giữ nguyên như trước, chỉ để tra cứu khi cần.
