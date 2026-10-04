/**
 * LA BÀN VIỆC — ĐỒNG BỘ 2 CHIỀU VỚI GOOGLE SHEET
 * =================================================
 * File này biến chính Google Sheet này thành một "kho lưu trữ" thứ hai cho app
 * La Bàn Việc (file index.html, chạy bằng localStorage trên trình duyệt —
 * dù mở dạng file tải về hay host online, ví dụ tại
 * https://vietquoc26.github.io/personal-assistant/).
 *
 * CÁCH CÀI ĐẶT (làm 1 lần):
 *   1. Mở Google Sheet này → Tiện ích (Extensions) → Apps Script.
 *   2. Xoá hết nội dung mặc định trong Code.gs, dán toàn bộ nội dung file này vào.
 *   3. Đổi giá trị hằng số TOKEN bên dưới thành một chuỗi bí mật do bạn tự nghĩ ra
 *      (không cần nhớ phức tạp, chỉ cần không public — coi như mật khẩu ngắn).
 *      QUAN TRỌNG: đừng chia sẻ URL Web App + Token này cho ai, vì ai có cả 2 thứ
 *      đó đều đọc/sửa được toàn bộ dữ liệu công việc của bạn.
 *   4. Bấm nút ▶ Run, chọn hàm "setupSheets", cho phép (authorize) khi được hỏi.
 *      Hàm này sẽ: đổi tên + ẩn các sheet công thức cũ (Tổng quan/Lịch ngày/
 *      Lịch tuần/Lịch tháng/Công việc cũ/Cài đặt cũ) để không còn 2 nơi tự tính
 *      lịch song song (app JS là nơi DUY NHẤT tính lịch từ nay), rồi tạo 3 sheet
 *      dữ liệu sạch: "Công việc", "Thói quen", "Cài đặt". Chạy lại hàm này lúc
 *      nào cũng an toàn (không mất dữ liệu đã đồng bộ).
 *   5. Deploy → New deployment → chọn loại "Web app". Execute as: Me.
 *      Who has access: Anyone. Bấm Deploy, copy URL (dạng .../exec).
 *   6. Mở app (https://vietquoc26.github.io/personal-assistant/) → Cài đặt →
 *      mục "8) Đồng bộ với Google Sheet" →
 *      dán URL vào ô "URL Web App", dán đúng TOKEN vào ô "Token bí mật" → bấm
 *      "Lưu cấu hình" rồi "Kiểm tra kết nối". Nếu báo "Kết nối OK" là xong —
 *      lần "Đồng bộ ngay" tiếp theo sẽ tự điền toàn bộ dữ liệu hiện có trong app
 *      lên Sheet (không cần bạn nhập lại tay).
 *   7. Mỗi khi sửa Code.gs (ví dụ đổi TOKEN), phải bấm Deploy → Manage deployments
 *      → sửa deployment hiện có → Version: New version → Deploy lại thì URL cũ
 *      mới nhận code mới (nếu deploy bản mới hoàn toàn thì URL sẽ đổi).
 *   8. (Tuỳ chọn, phần 24) Muốn nhận NHẮC NHỞ QUA EMAIL kể cả khi đã tắt máy/đóng
 *      app: bấm ▶ Run, chọn hàm "setupReminderTrigger", cho phép quyền gửi email
 *      khi được hỏi — làm 1 lần. Rồi vào app → Cài đặt → mục 9) Nhắc nhở → bật +
 *      điền email nhận → Lưu.
 */

var TOKEN = "DOI_CHUOI_NAY_THANH_BI_MAT_CUA_BAN";

var SHEET_NAMES = {
  TASKS: "Công việc",
  HABITS: "Thói quen",
  SETTINGS: "Cài đặt",
  GUIDE: "Hướng dẫn nhanh",
  TRASH: "Nhật ký xoá (ẩn - đừng sửa)",
  REMIND_LOG: "Nhật ký nhắc nhở (ẩn - đừng sửa)" // phần 24: chống gửi trùng email nhắc nhở
};

// Từ phần 22: thêm 3 cột theo dõi "thời gian thực tế đã dùng" (time spent) — thoiGianThucTe (số
// giờ thực tế, điền khi đánh dấu Hoàn thành), trackedSeconds (số giây đã cộng dồn qua nút bấm giờ
// Start/Stop, trong lúc việc CHƯA hoàn thành), timerRunningSince (mốc thời gian mili-giây lúc bấm
// Start gần nhất, null nếu đang không bấm giờ). Nếu THIẾU những cột này, mỗi lần đồng bộ qua Google
// Sheet sẽ ÂM THẦM LÀM MẤT dữ liệu time-tracking (đọc từ Sheet về sẽ không có field này, rồi ghi
// đè mất bản đang có ở máy khác) — xem cùng lỗi đã từng xảy ra với "pools" ở phần 10.
// Từ phần 24: thêm 3 cột "lịch dự kiến" (lichDuKienNgay/lichDuKienGio/lichDuKienKetThuc) — đây là
// bản CHỤP LẠI (snapshot) gần nhất của _assignedDate/_start/_end mà bộ xếp lịch PHÍA CLIENT (JS
// trong index.html, hàm runSchedule()) đã tính ra, được app tự gửi kèm mỗi lần đồng bộ. Code.gs
// KHÔNG tự tính lịch (bộ xếp lịch chỉ tồn tại ở client) — 3 cột này CHỈ để checkAndSendReminders()
// biết "việc này đang được xếp vào giờ nào" hòng gửi email nhắc trước giờ / báo trễ giờ, dù app có
// đang đóng hay không. Vì đây là ảnh chụp tại thời điểm đồng bộ GẦN NHẤT (không phải tính lại tại
// chỗ), có thể lệch vài phút so với thực tế nếu lâu chưa đồng bộ — chấp nhận được cho mục đích nhắc
// nhở (không phải dữ liệu cốt lõi).
// Từ phần 36: thêm cột "soLanDaDoi" (đếm số lần việc bị dời qua nút "Dời sang ngày mai"/tự động
// dọn lịch mỗi sáng) — dùng để phát hiện + cảnh báo "việc cứ bị dời mãi" ngay trên Dashboard.
var TASK_HEADERS = ["id","ten","linhVuc","mucDo","gio","deadline","ngayBatDau","trangThai","ngayHoanThanh","pausedAt","ghiChu","order","createdAt","ghimNgay","ghimGio","updatedAt","deleted","thoiGianThucTe","trackedSeconds","timerRunningSince","lichDuKienNgay","lichDuKienGio","lichDuKienKetThuc","soLanDaDoi"];
var TASK_TEXT_COLUMNS = ["deadline","ngayBatDau","ngayHoanThanh","pausedAt","ghimNgay","lichDuKienNgay"]; // giữ dạng text "yyyy-MM-dd", tránh Sheet tự đổi thành ngày

// Danh sách cột "Công việc" app hiện tại biết đọc/ghi — trả về cho client trong ping/doGet/doPost
// (taskFields) để app tự phát hiện khi Web App này đang chạy 1 bản Code.gs CŨ hơn (thiếu cột nào,
// vd 3 cột time-tracking ở phần 22, hoặc 3 cột lịch dự kiến ở phần 24), giống hệt cơ chế
// settingsFields đã có cho sheet Cài đặt.
var TASK_FIELDS = TASK_HEADERS;

var HABIT_HEADERS = ["id","ten","nhom","active","order","hoanThanhJson","updatedAt","deleted"];

// Sheet ẩn "Nhật ký nhắc nhở" (phần 24) — chỉ để checkAndSendReminders() nhớ "đã gửi email loại X
// cho việc/ngày Y chưa", tránh gửi trùng nhiều lần trong cùng 1 ngày khi trigger chạy lặp lại mỗi
// vài phút. Mỗi hàng là 1 "khoá" duy nhất, ví dụ "before:<taskId>:2026-09-27" hoặc "digest:2026-09-27".
var REMIND_LOG_HEADERS = ["key","sentAt"];

// Sheet "Nhật ký xoá" — KHÔNG chứa dữ liệu hiển thị, chỉ ghi lại "id nào đã bị xoá lúc nào"
// (loai = "task" hoặc "habit"). Đây là cách để: (1) sheet "Công việc"/"Thói quen" chỉ còn
// đúng những dòng đang tồn tại — xoá trong app là dòng biến mất thật, không còn cột
// deleted=TRUE nữa; (2) vẫn tránh được tình huống 1 thiết bị khác chưa đồng bộ kịp, còn giữ
// bản cũ của việc đã xoá, lỡ đẩy dữ liệu lên làm "hồi sinh" lại dòng vừa xoá — vì server vẫn
// nhớ được thời điểm xoá để so sánh, dù dòng gốc đã không còn trên sheet hiển thị.
var TRASH_HEADERS = ["loai","id","deletedAt"];

var SETTINGS_FIELDS = ["scoreCao","scoreTB","scoreThap","bonusSoon","bonusLate","daysSoon","planDays","weeklyTemplate","capacityOverrides","routine","lvMap","poolWindows","focusWindows","pools","remind"];

var OLD_SHEETS_TO_RETIRE = ["Tổng quan","Lịch ngày","Lịch tuần","Lịch tháng"];
var ROW_BUFFER = 2000; // đủ dùng cho vài năm dữ liệu cá nhân

/* ===================== WEB APP ENTRY POINTS ===================== */

function doGet(e){
  if (!checkToken_(e)) return jsonOut_({error:"unauthorized"});
  var action = (e && e.parameter && e.parameter.action) || "ping";
  // settingsFields đi kèm cả ở "ping": app dùng nó để tự phát hiện khi Web App này đang chạy
  // 1 bản Code.gs CŨ hơn app (thiếu trường nào đó trong SETTINGS_FIELDS, vd "pools") — ngay từ
  // lúc bấm "Kiểm tra kết nối", không cần đợi đồng bộ đầy đủ mới biết.
  if (action === "ping") return jsonOut_({ok:true, serverTime: Date.now(), settingsFields: SETTINGS_FIELDS, taskFields: TASK_FIELDS});
  // Phần 24: nút "Gửi email thử" trong Cài đặt > mục 9 gọi action này để xác nhận ngay Code.gs +
  // MailApp gửi được email tới đúng địa chỉ đã cấu hình, không cần đợi trigger tự chạy (tối đa 5
  // phút/lần) rồi mới biết có gửi được hay không.
  if (action === "test-reminder") return sendTestReminderEmail_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsRead = readSettingsFromSheet_(ss);
  return jsonOut_({
    tasks: readTasksFromSheet_(ss),
    habits: readHabitsFromSheet_(ss),
    settings: settingsRead.settings,
    settingsUpdatedAt: settingsRead.updatedAt,
    settingsFields: SETTINGS_FIELDS,
    taskFields: TASK_FIELDS,
    serverTime: Date.now()
  });
}

function doPost(e){
  if (!checkToken_(e)) return jsonOut_({error:"unauthorized"});
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch(lockErr){ return jsonOut_({error:"server_busy_thu_lai_sau"}); }

  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var taskTomb = readTombstones_(ss, "task");
    var sheetTasksForMerge = readTasksFromSheet_(ss).concat(tombstoneRows_(taskTomb));
    var mergedTasks = mergeRows_(sheetTasksForMerge, Array.isArray(body.tasks) ? body.tasks : []);
    var liveTasks = mergedTasks.filter(function(t){ return !t.deleted; });
    var deletedTasksNow = mergedTasks.filter(function(t){ return t.deleted; });
    writeTasksToSheet_(ss, liveTasks);
    saveTombstones_(ss, "task", deletedTasksNow);

    var habitTomb = readTombstones_(ss, "habit");
    var sheetHabitsForMerge = readHabitsFromSheet_(ss).concat(tombstoneRows_(habitTomb));
    var mergedHabits = mergeRows_(sheetHabitsForMerge, Array.isArray(body.habits) ? body.habits : []);
    var liveHabits = mergedHabits.filter(function(h){ return !h.deleted; });
    var deletedHabitsNow = mergedHabits.filter(function(h){ return h.deleted; });
    writeHabitsToSheet_(ss, liveHabits);
    saveTombstones_(ss, "habit", deletedHabitsNow);

    var sheetSettings = readSettingsFromSheet_(ss);
    var incomingSettings = body.settings || null;
    var incomingSettingsUpdatedAt = Number(body.settingsUpdatedAt || 0);
    var finalSettings, finalSettingsUpdatedAt;
    if (incomingSettings && incomingSettingsUpdatedAt >= sheetSettings.updatedAt){
      finalSettings = incomingSettings;
      finalSettingsUpdatedAt = incomingSettingsUpdatedAt || Date.now();
      writeSettingsToSheet_(ss, finalSettings, finalSettingsUpdatedAt);
    } else {
      finalSettings = sheetSettings.settings;
      finalSettingsUpdatedAt = sheetSettings.updatedAt;
    }

    return jsonOut_({
      tasks: mergedTasks,
      habits: mergedHabits,
      settings: finalSettings,
      settingsUpdatedAt: finalSettingsUpdatedAt,
      settingsFields: SETTINGS_FIELDS,
      taskFields: TASK_FIELDS,
      serverTime: Date.now()
    });
  } catch(err){
    return jsonOut_({error: String(err)});
  } finally {
    lock.releaseLock();
  }
}

function checkToken_(e){
  var t = (e && e.parameter && e.parameter.token) || "";
  return t === TOKEN;
}

function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== MERGE (bản sửa sau cùng thắng) ===================== */

function mergeRows_(sheetRows, incomingRows){
  var byId = {};
  sheetRows.forEach(function(r){
    if (!r || !r.id) return;
    var cur = byId[r.id];
    if (!cur || Number(r.updatedAt||0) >= Number(cur.updatedAt||0)) byId[r.id] = r;
  });
  incomingRows.forEach(function(r){
    if (!r || !r.ten && !r.id) return; // bỏ rác
    if (!r.id){ r.id = Utilities.getUuid(); r.updatedAt = r.updatedAt || Date.now(); }
    var existing = byId[r.id];
    if (!existing || Number(r.updatedAt || 0) >= Number(existing.updatedAt || 0)){
      byId[r.id] = r;
    }
  });
  var merged = Object.keys(byId).map(function(id){ return byId[id]; });
  merged.sort(function(a,b){
    return (Number(a.order||0) - Number(b.order||0)) || (Number(a.createdAt||0) - Number(b.createdAt||0));
  });
  return merged;
}

/* ===================== CÔNG VIỆC (Tasks) ===================== */

// Phần 42: múi giờ của file Sheet (dùng để đổi ô kiểu Ngày về đúng "yyyy-MM-dd" như người dùng thấy).
function sheetTimeZone_(ss){
  try { var tz = ss.getSpreadsheetTimeZone(); if (typeof tz === "string" && tz) return tz; } catch(e){}
  return "Asia/Ho_Chi_Minh";
}
function toDateKey_(v, tz){
  if (v === "" || v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  return String(v).trim();
}

function readTasksFromSheet_(ss){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TASKS, TASK_HEADERS);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2,1,lastRow-1,TASK_HEADERS.length).getValues();
  var dateTz = sheetTimeZone_(ss);
  var out = [];
  for (var i=0;i<values.length;i++){
    var row = values[i];
    var obj = {};
    TASK_HEADERS.forEach(function(h, idx){ obj[h] = row[idx]; });
    // Phần 42: chuẩn hoá mọi cột ngày về chuỗi "yyyy-MM-dd" — ô nào đã bị Google Sheets tự đổi sang
    // kiểu Ngày (Date) từ trước (xem applyTextFormat_) vẫn đọc ra đúng, không còn thành chuỗi kiểu
    // "Mon Oct 05 2026 00:00:00 GMT+0700" khiến so khớp "việc của hôm nay" luôn trượt.
    TASK_TEXT_COLUMNS.forEach(function(h){ obj[h] = toDateKey_(obj[h], dateTz); });
    var ten = String(obj.ten||"").trim();
    var id = String(obj.id||"").trim();
    if (!ten && !id) continue; // hàng trống

    if (!id){
      id = Utilities.getUuid();
      obj.updatedAt = Date.now();
      if (!obj.createdAt) obj.createdAt = Date.now();
      if (!obj.order) obj.order = i+1;
      sh.getRange(2+i, TASK_HEADERS.indexOf("id")+1).setValue(id);
      sh.getRange(2+i, TASK_HEADERS.indexOf("updatedAt")+1).setValue(obj.updatedAt);
      sh.getRange(2+i, TASK_HEADERS.indexOf("createdAt")+1).setValue(obj.createdAt);
      sh.getRange(2+i, TASK_HEADERS.indexOf("order")+1).setValue(obj.order);
    }

    var ghimNgay = obj.ghimNgay ? String(obj.ghimNgay).trim() : "";
    var ghimGio = (obj.ghimGio!==""&&obj.ghimGio!=null) ? Number(obj.ghimGio) : null;

    out.push({
      id: id,
      ten: ten,
      linhVuc: String(obj.linhVuc||"").trim(),
      mucDo: String(obj.mucDo||"Trung bình").trim() || "Trung bình",
      gio: Number(obj.gio) || 0.25,
      deadline: obj.deadline ? String(obj.deadline).trim() : null,
      ngayBatDau: obj.ngayBatDau ? String(obj.ngayBatDau).trim() : null,
      trangThai: String(obj.trangThai||"Chưa bắt đầu").trim() || "Chưa bắt đầu",
      ngayHoanThanh: obj.ngayHoanThanh ? String(obj.ngayHoanThanh).trim() : null,
      pausedAt: obj.pausedAt ? String(obj.pausedAt).trim() : null,
      ghiChu: obj.ghiChu ? String(obj.ghiChu) : "",
      order: Number(obj.order) || 0,
      createdAt: Number(obj.createdAt) || Date.now(),
      ghim: (ghimNgay && ghimGio!=null) ? {ngay: ghimNgay, gioBatDau: ghimGio} : null,
      updatedAt: Number(obj.updatedAt) || 0,
      deleted: obj.deleted === true || String(obj.deleted).toUpperCase() === "TRUE",
      thoiGianThucTe: (obj.thoiGianThucTe!==""&&obj.thoiGianThucTe!=null) ? Number(obj.thoiGianThucTe) : null,
      trackedSeconds: Number(obj.trackedSeconds) || 0,
      timerRunningSince: (obj.timerRunningSince!==""&&obj.timerRunningSince!=null) ? Number(obj.timerRunningSince) : null,
      lichDuKienNgay: obj.lichDuKienNgay ? String(obj.lichDuKienNgay).trim() : null,
      lichDuKienGio: (obj.lichDuKienGio!==""&&obj.lichDuKienGio!=null) ? Number(obj.lichDuKienGio) : null,
      lichDuKienKetThuc: (obj.lichDuKienKetThuc!==""&&obj.lichDuKienKetThuc!=null) ? Number(obj.lichDuKienKetThuc) : null,
      // Phần 42: trước đây cột này được GHI (phần 36) nhưng không bao giờ được ĐỌC lại → mỗi lần kéo
      // dữ liệu từ Sheet về, số lần bị dời của mọi việc bị mất.
      soLanDaDoi: Number(obj.soLanDaDoi) || 0
    });
  }
  return out;
}

function writeTasksToSheet_(ss, tasks){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TASKS, TASK_HEADERS);
  // Phần 42: luôn đảm bảo các cột ngày ở định dạng TEXT TRƯỚC khi ghi (rẻ, vài lệnh định dạng), để
  // cả Sheet đã tạo từ các bản cũ cũng không còn bị Google Sheets tự đổi chuỗi ngày thành kiểu Ngày.
  applyTextFormat_(sh, TASK_HEADERS, TASK_TEXT_COLUMNS);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2,1,lastRow-1,TASK_HEADERS.length).clearContent();
  tasks = (tasks||[]).filter(function(t){ return !t.deleted; }); // xoá thật: không ghi lại dòng đã xoá
  if (!tasks.length) return;
  // Phần 42: sửa lỗi GỐC khiến MỌI lượt đồng bộ thất bại từ phần 36 — trước đây mỗi dòng được dựng
  // bằng 1 mảng viết tay theo thứ tự cột, nhưng khi thêm cột "soLanDaDoi" vào TASK_HEADERS (phần 36)
  // thì mảng này KHÔNG được thêm theo (23 giá trị cho vùng 24 cột) → setValues() ném lỗi "number of
  // columns in the data does not match", doPost trả {error}, Sheet đứng yên ở dữ liệu cũ (kể cả
  // 3 cột "lịch dự kiến") → email "Kế hoạch hôm nay" luôn báo 0 việc, nhắc thói quen dựa trên dữ liệu
  // cũ. Giờ dựng mỗi dòng TỪ CHÍNH TASK_HEADERS (tra theo tên cột) — thêm cột mới sau này không bao
  // giờ còn lệch số cột được nữa.
  var rows = tasks.map(function(t){
    var v = {
      id: t.id||"", ten: t.ten||"", linhVuc: t.linhVuc||"", mucDo: t.mucDo||"", gio: Number(t.gio)||0,
      deadline: t.deadline||"", ngayBatDau: t.ngayBatDau||"", trangThai: t.trangThai||"", ngayHoanThanh: t.ngayHoanThanh||"",
      pausedAt: t.pausedAt||"", ghiChu: t.ghiChu||"", order: Number(t.order)||0, createdAt: Number(t.createdAt)||0,
      ghimNgay: (t.ghim && t.ghim.ngay) || "", ghimGio: (t.ghim && t.ghim.gioBatDau!=null) ? t.ghim.gioBatDau : "",
      updatedAt: Number(t.updatedAt)||0, deleted: !!t.deleted,
      thoiGianThucTe: (t.thoiGianThucTe!=null && t.thoiGianThucTe!=="") ? Number(t.thoiGianThucTe) : "",
      trackedSeconds: Number(t.trackedSeconds)||0,
      timerRunningSince: (t.timerRunningSince!=null && t.timerRunningSince!=="") ? Number(t.timerRunningSince) : "",
      lichDuKienNgay: t.lichDuKienNgay || "",
      lichDuKienGio: (t.lichDuKienGio!=null && t.lichDuKienGio!=="") ? Number(t.lichDuKienGio) : "",
      lichDuKienKetThuc: (t.lichDuKienKetThuc!=null && t.lichDuKienKetThuc!=="") ? Number(t.lichDuKienKetThuc) : "",
      soLanDaDoi: Number(t.soLanDaDoi)||0
    };
    return TASK_HEADERS.map(function(h){ return (v[h]!==undefined) ? v[h] : ""; });
  });
  sh.getRange(2,1,rows.length,TASK_HEADERS.length).setValues(rows);
}

/* ===================== THÓI QUEN (Habits) ===================== */

function readHabitsFromSheet_(ss){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.HABITS, HABIT_HEADERS);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2,1,lastRow-1,HABIT_HEADERS.length).getValues();
  var out = [];
  for (var i=0;i<values.length;i++){
    var row = values[i];
    var obj = {};
    HABIT_HEADERS.forEach(function(h, idx){ obj[h] = row[idx]; });
    var ten = String(obj.ten||"").trim();
    var id = String(obj.id||"").trim();
    if (!ten && !id) continue;

    if (!id){
      id = Utilities.getUuid();
      obj.updatedAt = Date.now();
      if (!obj.order) obj.order = i+1;
      sh.getRange(2+i, HABIT_HEADERS.indexOf("id")+1).setValue(id);
      sh.getRange(2+i, HABIT_HEADERS.indexOf("updatedAt")+1).setValue(obj.updatedAt);
      sh.getRange(2+i, HABIT_HEADERS.indexOf("order")+1).setValue(obj.order);
    }

    var hoanThanh = {};
    try { hoanThanh = obj.hoanThanhJson ? JSON.parse(obj.hoanThanhJson) : {}; } catch(err){ hoanThanh = {}; }

    out.push({
      id: id,
      ten: ten,
      nhom: String(obj.nhom||"work").trim() || "work",
      active: obj.active !== false && String(obj.active).toUpperCase() !== "FALSE",
      order: Number(obj.order) || 0,
      hoanThanh: hoanThanh,
      updatedAt: Number(obj.updatedAt) || 0,
      deleted: obj.deleted === true || String(obj.deleted).toUpperCase() === "TRUE"
    });
  }
  return out;
}

function writeHabitsToSheet_(ss, habits){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.HABITS, HABIT_HEADERS);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2,1,lastRow-1,HABIT_HEADERS.length).clearContent();
  habits = (habits||[]).filter(function(h){ return !h.deleted; }); // xoá thật: không ghi lại dòng đã xoá
  if (!habits.length) return;
  var rows = habits.map(function(h){
    return [
      h.id||"", h.ten||"", h.nhom||"work", h.active!==false,
      Number(h.order)||0, JSON.stringify(h.hoanThanh||{}),
      Number(h.updatedAt)||0, !!h.deleted
    ];
  });
  sh.getRange(2,1,rows.length,HABIT_HEADERS.length).setValues(rows);
}

/* ===================== NHẬT KÝ XOÁ (tombstones — chỉ để chống "hồi sinh" nhầm) =====================
   Khi 1 việc/thói quen bị xoá, dòng của nó biến mất thật khỏi sheet "Công việc"/"Thói quen" (xem
   writeTasksToSheet_/writeHabitsToSheet_ ở trên). Nhưng nếu chỉ xoá dòng thôi thì có rủi ro: một
   thiết bị khác chưa đồng bộ kịp (còn đang lưu bản CŨ, chưa xoá, trong bộ nhớ máy đó) mà mở app và
   đồng bộ, app sẽ đẩy lại việc đó lên như thể "vẫn còn sống" — vì server (sau khi xoá) không còn dấu
   vết gì để biết id đó vừa bị xoá, nên vô tình tạo lại (hồi sinh nhầm) dòng vừa xoá.
   Sheet ẩn "Nhật ký xoá" (SHEET_NAMES.TRASH) giải quyết việc đó: chỉ ghi id + thời điểm xoá, không
   chứa nội dung việc/thói quen. Khi merge, server coi mỗi tombstone như 1 "bản ghi đã xoá" để so
   sánh updatedAt như bình thường — id nào bị đẩy lên với updatedAt CŨ hơn thời điểm xoá thì vẫn bị
   coi là đã xoá (không hồi sinh); còn nếu bạn thật sự tạo lại việc đó sau (updatedAt mới hơn) thì
   vẫn được thêm lại bình thường. Sheet này ẩn theo mặc định — không cần mở/sửa tay. */

function readTombstones_(ss, loai){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TRASH, TRASH_HEADERS);
  var lastRow = sh.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var values = sh.getRange(2,1,lastRow-1,TRASH_HEADERS.length).getValues();
  values.forEach(function(row){
    var rowLoai = String(row[0]||"").trim();
    var id = String(row[1]||"").trim();
    if (rowLoai === loai && id) map[id] = Number(row[2])||0;
  });
  return map;
}

// Biến map {id: deletedAt} thành các "dòng ảo" có hình dạng giống 1 task/habit bị xoá, để đưa vào
// chung với sheetRows khi gọi mergeRows_ — nhờ vậy logic so sánh updatedAt dùng lại được, không cần
// viết thêm 1 bộ luật merge riêng.
function tombstoneRows_(map){
  return Object.keys(map).map(function(id){
    return {id: id, ten: "", updatedAt: map[id], createdAt: 0, order: 0, deleted: true};
  });
}

function saveTombstones_(ss, loai, deletedItems){
  if (!deletedItems || !deletedItems.length) return;
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TRASH, TRASH_HEADERS);
  var lastRow = sh.getLastRow();
  var existing = lastRow >= 2 ? sh.getRange(2,1,lastRow-1,TRASH_HEADERS.length).getValues() : [];
  var map = {}; // key "loai|id" -> deletedAt — giữ nguyên tombstone của loại khác (task/habit) khi ghi lại
  existing.forEach(function(row){
    var k = String(row[0]||"") + "|" + String(row[1]||"");
    map[k] = Number(row[2])||0;
  });
  deletedItems.forEach(function(t){
    var k = loai + "|" + t.id;
    var newAt = Number(t.updatedAt) || Date.now();
    if (!map[k] || newAt > map[k]) map[k] = newAt;
  });
  var rows = Object.keys(map).map(function(k){
    var sep = k.indexOf("|");
    return [k.slice(0,sep), k.slice(sep+1), map[k]];
  });
  if (lastRow > 1) sh.getRange(2,1,lastRow-1,TRASH_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2,1,rows.length,TRASH_HEADERS.length).setValues(rows);
}

/* ===================== CÀI ĐẶT (Settings) — key/value, mỗi giá trị là JSON ===================== */

function readSettingsFromSheet_(ss){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.SETTINGS, ["Thông số","Giá trị (JSON)"]);
  var lastRow = sh.getLastRow();
  var map = {};
  if (lastRow >= 2){
    var values = sh.getRange(2,1,lastRow-1,2).getValues();
    values.forEach(function(r){
      var key = String(r[0]||"").trim();
      if (!key) return;
      try { map[key] = JSON.parse(r[1]); } catch(err){ map[key] = null; }
    });
  }
  var settings = {};
  SETTINGS_FIELDS.forEach(function(f){ if (map[f]!==undefined && map[f]!==null) settings[f] = map[f]; });
  var updatedAt = Number(map._updatedAt || 0);
  return {settings: settings, updatedAt: updatedAt};
}

function writeSettingsToSheet_(ss, settings, updatedAt){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.SETTINGS, ["Thông số","Giá trị (JSON)"]);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2,1,lastRow-1,2).clearContent();
  var rows = SETTINGS_FIELDS.map(function(f){
    return [f, JSON.stringify(settings[f]!==undefined ? settings[f] : null)];
  });
  rows.push(["_updatedAt", JSON.stringify(updatedAt || Date.now())]);
  sh.getRange(2,1,rows.length,2).setValues(rows);
}

/* ===================== TIỆN ÍCH SHEET ===================== */

function getOrCreateSheet_(ss, name, headers){
  var sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight("bold").setBackground("#E1EEE8");
    sh.setFrozenRows(1);
    if (name === SHEET_NAMES.TASKS) applyTextFormat_(sh, headers, TASK_TEXT_COLUMNS);
    if (name === SHEET_NAMES.SETTINGS) ensureSettingsNote_(sh);
    if (name === SHEET_NAMES.TRASH || name === SHEET_NAMES.REMIND_LOG) { try { sh.hideSheet(); } catch(e){} }
    try { sh.autoResizeColumns(1, headers.length); } catch(e){}
  } else {
    // đảm bảo header hàng 1 luôn đúng, kể cả khi sheet đã có từ trước
    var curHeader = sh.getRange(1,1,1,headers.length).getValues()[0];
    var same = curHeader.every(function(v,i){ return v === headers[i]; });
    if (!same){
      sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight("bold").setBackground("#E1EEE8");
      sh.setFrozenRows(1);
      // Phần 42: trước đây định dạng TEXT cho các cột ngày chỉ được áp lúc TẠO MỚI sheet — các cột
      // thêm về sau (vd "lichDuKienNgay" ở phần 24) trên 1 sheet đã có sẵn vẫn để định dạng tự động,
      // Google Sheets tự đổi "2026-10-05" thành kiểu Ngày → đọc lại không còn khớp chuỗi "yyyy-MM-dd"
      // → email "Kế hoạch hôm nay" lọc ra 0 việc. Áp lại mỗi khi cấu trúc cột thay đổi.
      if (name === SHEET_NAMES.TASKS) applyTextFormat_(sh, headers, TASK_TEXT_COLUMNS);
    }
    if (name === SHEET_NAMES.SETTINGS) ensureSettingsNote_(sh);
  }
  return sh;
}

// Ghi chú cố định ở cột D của sheet "Cài đặt", giải thích vì sao Thói quen hằng ngày
// không nằm trong sheet này. Đặt ở cột D (không phải A/B) để writeSettingsToSheet_
// (chỉ clearContent cột A:B) không bao giờ xoá mất ghi chú này khi đồng bộ.
function ensureSettingsNote_(sh){
  var marker = sh.getRange(1,4).getValue();
  if (marker === "Ghi chú") return; // đã có ghi chú từ trước, không ghi đè
  sh.getRange(1,4).setValue("Ghi chú").setFontWeight("bold").setBackground("#E1EEE8");
  var lines = [
    ["Sheet này chỉ chứa THÔNG SỐ cấu hình của app (điểm ưu tiên, sức chứa theo tuần, khung giờ hợp lý...) ở cột A/B — không sửa tay 2 cột đó, app sẽ tự ghi đè mỗi lần đồng bộ."],
    [""],
    ["📌 Thói quen hằng ngày KHÔNG nằm ở sheet này — chúng có tab riêng tên \"" + SHEET_NAMES.HABITS + "\", tách biệt với thông số cấu hình để dễ quản lý."],
    ["Nếu tab \"" + SHEET_NAMES.HABITS + "\" đang trống: mở app La Bàn Việc → Cài đặt → mục 7) Đồng bộ với Google Sheet → bấm \"Đồng bộ ngay\" một lần — danh sách thói quen đang có trên app sẽ tự điền vào tab đó."],
    ["Sau đó bạn có thể thêm / sửa / xoá thói quen trực tiếp trong tab \"" + SHEET_NAMES.HABITS + "\" (cột: " + HABIT_HEADERS.join(", ") + ") — app sẽ tự gộp thay đổi ở lần đồng bộ tiếp theo."],
  ];
  sh.getRange(2,4,lines.length,1).setValues(lines).setWrap(true).setVerticalAlignment("top");
  try { sh.setColumnWidth(4, 480); } catch(e){}
}

function applyTextFormat_(sh, headers, textCols){
  textCols.forEach(function(col){
    var idx = headers.indexOf(col);
    if (idx>=0) sh.getRange(2, idx+1, ROW_BUFFER, 1).setNumberFormat("@");
  });
}

/* ===================== KHỞI TẠO / LÀM MỚI CẤU TRÚC SHEET (chạy 1 lần) =====================
   An toàn khi chạy lại nhiều lần. KHÔNG di chuyển dữ liệu từ sheet "Công việc" cũ (dạng
   công thức) sang — vì id ở sheet cũ chỉ là số thứ tự 1,2,3.. không khớp với id thật của
   app, ghép vào sẽ tạo trùng lặp. Thay vào đó: sheet mới bắt đầu trống, lần "Đồng bộ ngay"
   ĐẦU TIÊN từ app sẽ tự điền lại đầy đủ dữ liệu hiện có trong app lên đây — không cần bạn
   nhập lại tay. Các sheet công thức cũ chỉ được ẩn + đổi tên (không xoá), bạn có thể tự xoá
   sau khi đã yên tâm. */
function setupSheets(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  OLD_SHEETS_TO_RETIRE.concat([SHEET_NAMES.TASKS, SHEET_NAMES.SETTINGS]).forEach(function(name){
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var retiredName = name + " (cũ)";
    if (ss.getSheetByName(retiredName)) return; // đã đổi tên từ lần chạy trước rồi, bỏ qua
    sh.setName(retiredName);
    try { sh.hideSheet(); } catch(e){}
  });

  getOrCreateSheet_(ss, SHEET_NAMES.TASKS, TASK_HEADERS);
  getOrCreateSheet_(ss, SHEET_NAMES.HABITS, HABIT_HEADERS);
  getOrCreateSheet_(ss, SHEET_NAMES.SETTINGS, ["Thông số","Giá trị (JSON)"]);
  getOrCreateSheet_(ss, SHEET_NAMES.TRASH, TRASH_HEADERS); // sheet ẩn, xem ghi chú ở phần "NHẬT KÝ XOÁ"
  getOrCreateSheet_(ss, SHEET_NAMES.REMIND_LOG, REMIND_LOG_HEADERS); // sheet ẩn, phần 24 — xem "NHẮC NHỞ QUA EMAIL"
  setupGuideSheet_(ss);

  // Sắp xếp thứ tự sheet cho dễ nhìn
  var order = [SHEET_NAMES.GUIDE, SHEET_NAMES.TASKS, SHEET_NAMES.HABITS, SHEET_NAMES.SETTINGS];
  order.forEach(function(name, i){
    var sh = ss.getSheetByName(name);
    if (sh) ss.setActiveSheet(sh) && ss.moveActiveSheet(i+1);
  });

  SpreadsheetApp.getUi().alert(
    "Đã khởi tạo xong 3 sheet dữ liệu: \"Công việc\", \"Thói quen\", \"Cài đặt\" (đang trống).\n\n" +
    "Các sheet công thức cũ đã được ẩn + đổi tên thêm \"(cũ)\", không bị xoá.\n\n" +
    "Bước tiếp theo: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) " +
    "→ copy URL → dán vào app La Bàn Việc, mục Cài đặt > 8) Đồng bộ với Google Sheet. " +
    "Lần \"Đồng bộ ngay\" đầu tiên từ app sẽ tự điền đầy đủ dữ liệu lên đây."
  );
}

/* ===================== DỌN DỮ LIỆU MẪU BỊ NHÂN BẢN (chạy TAY 1 LẦN nếu cần) =====================
   Bối cảnh: bản app cũ (trước 2026-09-21 phần 6) có lỗi — mỗi lần mở app SAU KHI đã xoá hết việc
   rồi tải lại trang, app hiểu nhầm là máy hoàn toàn mới nên TỰ SINH LẠI trọn bộ việc/thói quen mẫu
   (id bắt đầu bằng "seed-" / "habit-seed-") với ID NGẪU NHIÊN MỚI mỗi lần. Mỗi lượt sinh lại đó,
   khi đồng bộ, bị Sheet coi là dữ liệu hoàn toàn mới (vì id khác) nên CỘNG DỒN thành nhiều bản
   trùng tên (ví dụ thấy 2-3 dòng "Cân + đo số đo cơ thể" khác id). Bản app mới đã vá lỗi này
   (không tự sinh lại nữa), nhưng không tự dọn được các bản trùng đã lỡ nằm sẵn trong Sheet.

   Chạy hàm xoaSachDuLieuMauBiTrung() bên dưới (▶ Run, chọn đúng tên hàm này) để dọn — hàm CHỈ xoá
   các hàng có "id" bắt đầu bằng "seed-" hoặc "habit-seed-" (dữ liệu mẫu), GIỮ NGUYÊN mọi việc/thói
   quen bạn đã tự thêm hoặc tự sửa tay (id không có tiền tố đó, hoặc id mẫu nhưng đã bị đổi khi sửa
   — thực ra id không đổi khi sửa nội dung, chỉ khi tạo mới). An toàn chạy lại nhiều lần. */
function xoaSachDuLieuMauBiTrung(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var removedTasks = removeSeedRows_(ss, SHEET_NAMES.TASKS, TASK_HEADERS, "seed-");
  var removedHabits = removeSeedRows_(ss, SHEET_NAMES.HABITS, HABIT_HEADERS, "habit-seed-");
  SpreadsheetApp.getUi().alert(
    "Đã dọn xong.\n\n" +
    "• Xoá " + removedTasks + " dòng việc mẫu (id bắt đầu \"seed-\").\n" +
    "• Xoá " + removedHabits + " dòng thói quen mẫu (id bắt đầu \"habit-seed-\").\n\n" +
    "Mọi việc/thói quen bạn tự thêm (id khác) vẫn được giữ nguyên. Có thể chạy lại hàm này bất " +
    "cứ lúc nào nếu cần dọn thêm."
  );
}

function removeSeedRows_(ss, sheetName, headers, idPrefix){
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return 0;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var idCol = headers.indexOf("id");
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var kept = values.filter(function(row){ return String(row[idCol] || "").indexOf(idPrefix) !== 0; });
  var removed = values.length - kept.length;
  if (!removed) return 0;
  sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (kept.length) sh.getRange(2, 1, kept.length, headers.length).setValues(kept);
  return removed;
}

/* ===================== DỌN BỚT NHẬT KÝ XOÁ CŨ (chạy TAY, không bắt buộc) =====================
   Sheet ẩn "Nhật ký xoá" chỉ lưu id + thời điểm xoá (không lưu nội dung việc/thói quen) nên rất
   nhẹ, nhưng nếu bạn xoá rất nhiều theo thời gian, có thể chạy hàm này để dọn bớt các mục xoá đã
   quá cũ (mặc định: cũ hơn 180 ngày) — an toàn, vì các thiết bị lâu ngày không đồng bộ đến mức đó
   thường không còn ý nghĩa để bảo vệ khỏi hồi sinh nhầm nữa. */
function donDepNhatKyXoaCu(){
  var soNgay = 180;
  var nguong = Date.now() - soNgay * 24 * 60 * 60 * 1000;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TRASH, TRASH_HEADERS);
  var lastRow = sh.getLastRow();
  if (lastRow < 2){
    SpreadsheetApp.getUi().alert("Nhật ký xoá đang trống, không có gì để dọn.");
    return;
  }
  var values = sh.getRange(2,1,lastRow-1,TRASH_HEADERS.length).getValues();
  var kept = values.filter(function(row){ return (Number(row[2])||0) >= nguong; });
  var removed = values.length - kept.length;
  sh.getRange(2,1,lastRow-1,TRASH_HEADERS.length).clearContent();
  if (kept.length) sh.getRange(2,1,kept.length,TRASH_HEADERS.length).setValues(kept);
  SpreadsheetApp.getUi().alert(
    "Đã dọn " + removed + " mục xoá cũ hơn " + soNgay + " ngày trong nhật ký xoá.\n\n" +
    "Lưu ý: nếu có thiết bị nào không mở app quá " + soNgay + " ngày rồi mới đồng bộ lại, việc/thói " +
    "quen đã xoá có thể (hiếm khi) bị đẩy lại lên Sheet. Chỉ chạy hàm này nếu bạn chắc mọi thiết bị " +
    "đều đã đồng bộ gần đây."
  );
}

/* ===================== NHẮC NHỞ QUA EMAIL (phần 24) =====================
   Kênh nhắc nhở THỨ 2 (song song với push-khi-app-đang-mở phía client) — chạy hoàn toàn phía SERVER
   (Apps Script, qua 1 trigger theo giờ) nên hoạt động dù máy tính/điện thoại đã tắt hẳn, đóng app.
   Giới hạn quan trọng cần hiểu: Code.gs không tự tính lịch (bộ xếp lịch CHỈ có trong index.html) —
   mọi quyết định "việc này xếp vào giờ nào" đều dựa vào 3 cột "lịch dự kiến" (lichDuKienNgay/Gio/
   KetThuc) — ảnh chụp gần nhất mà client gửi kèm mỗi lần đồng bộ (xem ghi chú ở TASK_HEADERS phía
   trên). Nếu lâu chưa đồng bộ, email có thể dựa trên 1 vị trí lịch đã hơi cũ.

   CÀI ĐẶT (làm 1 lần, SAU KHI đã dán đè Code.gs bản có tính năng này + Deploy lại):
     Bấm ▶ Run, chọn hàm "setupReminderTrigger", cho phép (authorize) khi được hỏi (lần đầu sẽ hỏi
     thêm quyền gửi email thay bạn). Hàm này tạo 1 trigger chạy checkAndSendReminders() mỗi 5 phút.
     Chạy lại hàm này bất cứ lúc nào cũng an toàn (tự xoá trigger cũ trước khi tạo trigger mới, không
     bị nhân đôi). Sau đó vào app → Cài đặt → mục 9) Nhắc nhở → bật + điền email + Lưu. */

function getRemindLogSheet_(ss){
  return getOrCreateSheet_(ss, SHEET_NAMES.REMIND_LOG, REMIND_LOG_HEADERS);
}

// Đọc TOÀN BỘ khoá đã gửi thành 1 Set — đọc 1 lần cho cả lượt chạy checkAndSendReminders(), tránh
// phải getRange() lặp lại cho từng việc/kiểm tra (rẻ hơn nhiều về API call).
function readRemindLogKeys_(ss){
  var sh = getRemindLogSheet_(ss);
  var lastRow = sh.getLastRow();
  var set = {};
  if (lastRow < 2) return set;
  var values = sh.getRange(2,1,lastRow-1,1).getValues();
  values.forEach(function(row){ var k = String(row[0]||"").trim(); if (k) set[k] = true; });
  return set;
}

function appendRemindLogKeys_(ss, keys){
  if (!keys || !keys.length) return;
  var sh = getRemindLogSheet_(ss);
  var now = Date.now();
  var rows = keys.map(function(k){ return [k, now]; });
  sh.getRange(sh.getLastRow()+1, 1, rows.length, REMIND_LOG_HEADERS.length).setValues(rows);
}

// "Bây giờ" tính theo timezone đã cấu hình (mặc định "Asia/Ho_Chi_Minh") — KHÔNG dùng trực tiếp
// new Date().getHours() vì đó là giờ theo timezone của DỰ ÁN Apps Script (có thể là UTC hoặc khác
// múi giờ thật của user), sẽ tính sai lệch nếu 2 timezone không khớp nhau.
function nowInTz_(tz){
  var now = new Date();
  var dateKey = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var hh = Number(Utilities.formatDate(now, tz, "H"));
  var mm = Number(Utilities.formatDate(now, tz, "m"));
  return {dateKey: dateKey, hourDecimal: hh + mm/60};
}

function fmtHm_(hourDecimal){
  if (hourDecimal==null) return "?";
  var h = Math.floor(hourDecimal);
  var m = Math.round((hourDecimal - h) * 60);
  if (m===60){ h++; m=0; }
  return (h<10?"0":"")+h + ":" + (m<10?"0":"")+m;
}

// Hàm CHÍNH — gọi bởi trigger theo giờ (setupReminderTrigger()) mỗi 5 phút. An toàn khi gọi thủ
// công (▶ Run) để test — không làm gì nếu remind.enabled=false hoặc chưa điền email.
function checkAndSendReminders(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsRead = readSettingsFromSheet_(ss);
  var remind = settingsRead.settings && settingsRead.settings.remind;
  if (!remind || !remind.enabled || !remind.email) return;

  var tz = remind.timezone || "Asia/Ho_Chi_Minh";
  var now = nowInTz_(tz);
  var beforeMin = Number(remind.beforeMinutes) || 10;
  // Cửa sổ kiểm tra digest/thói quen — rộng hơn nhịp trigger (5 phút) một chút để không bỏ lỡ nếu
  // trigger bị trễ vài phút do tải hệ thống — không nên quá rộng vì sẽ trễ cả tiếng nếu bỏ lỡ hẳn.
  var CHECK_WINDOW_HOURS = 0.34; // ~20 phút

  // Phần 42: việc đã GHIM luôn biết chắc ngày/giờ ngay trên chính dữ liệu việc (không phụ thuộc
  // ảnh chụp "lịch dự kiến" do app gửi lên) — dùng ghim làm nguồn ưu tiên cho việc ghim, và làm
  // phương án dự phòng khi ảnh chụp bị trống/cũ, để email không bao giờ bỏ sót việc đã ghim cho hôm nay.
  var tasks = readTasksFromSheet_(ss).map(function(t){
    if (t.ghim && t.ghim.ngay && t.ghim.gioBatDau != null){
      t.lichDuKienNgay = t.ghim.ngay;
      t.lichDuKienGio = Number(t.ghim.gioBatDau);
      t.lichDuKienKetThuc = Number(t.ghim.gioBatDau) + (Number(t.gio) || 0);
    }
    return t;
  }).filter(function(t){
    return !t.deleted && t.lichDuKienNgay === now.dateKey && t.lichDuKienGio != null
      && (t.trangThai === "Chưa bắt đầu" || t.trangThai === "Đang làm");
  });
  var habits = readHabitsFromSheet_(ss).filter(function(h){ return !h.deleted && h.active !== false; });

  var sentKeys = readRemindLogKeys_(ss);
  var newKeys = [];
  var emails = []; // {subject, body}

  if (remind.beforeStart !== false){
    tasks.forEach(function(t){
      if (t.trangThai !== "Chưa bắt đầu") return;
      var startsIn = t.lichDuKienGio - now.hourDecimal;
      if (startsIn < -0.001 || startsIn > beforeMin/60 + 0.001) return; // chưa tới cửa sổ trước giờ, hoặc đã quá giờ (thuộc nhóm "trễ" bên dưới)
      var key = "before:" + t.id + ":" + now.dateKey;
      if (sentKeys[key]) return;
      newKeys.push(key);
      emails.push({
        subject: "⏰ Sắp đến giờ: " + t.ten,
        body: "Việc \"" + t.ten + "\" (" + (t.linhVuc||"") + ") dự kiến bắt đầu lúc " + fmtHm_(t.lichDuKienGio) +
          " hôm nay — còn khoảng " + Math.max(0, Math.round(startsIn*60)) + " phút nữa.\n\n" +
          (t.ghiChu ? ("Ghi chú: " + t.ghiChu + "\n\n") : "") +
          "— La Bàn Việc"
      });
    });
  }

  if (remind.overdue !== false){
    tasks.forEach(function(t){
      if (t.trangThai !== "Chưa bắt đầu") return;
      if (t.lichDuKienGio == null || t.lichDuKienGio >= now.hourDecimal - 0.001) return; // chưa trễ
      var key = "overdue:" + t.id + ":" + now.dateKey;
      if (sentKeys[key]) return;
      newKeys.push(key);
      var lateMin = Math.round((now.hourDecimal - t.lichDuKienGio) * 60);
      emails.push({
        subject: "🔴 Đã trễ giờ: " + t.ten,
        body: "Việc \"" + t.ten + "\" (" + (t.linhVuc||"") + ") đáng lẽ bắt đầu lúc " + fmtHm_(t.lichDuKienGio) +
          " nhưng vẫn đang \"Chưa bắt đầu\" — trễ khoảng " + lateMin + " phút.\n\n" +
          "— La Bàn Việc"
      });
    });
  }

  if (remind.morningDigest !== false){
    var morningHour = Number(remind.morningHour);
    if (isNaN(morningHour)) morningHour = 7;
    if (now.hourDecimal >= morningHour && now.hourDecimal < morningHour + CHECK_WINDOW_HOURS){
      var key = "digest:" + now.dateKey;
      if (!sentKeys[key]){
        newKeys.push(key);
        var todays = tasks.slice().sort(function(a,b){ return (a.lichDuKienGio||0) - (b.lichDuKienGio||0); });
        var totalH = todays.reduce(function(s,t){ return s + (Number(t.gio)||0); }, 0);
        var lines = todays.length
          ? todays.map(function(t){ return "• " + fmtHm_(t.lichDuKienGio) + "–" + fmtHm_(t.lichDuKienKetThuc) + " — " + t.ten + " (" + (t.linhVuc||"") + ")"; }).join("\n")
          : "(Không có việc nào được xếp lịch cho hôm nay.)";
        emails.push({
          subject: "🧭 Kế hoạch hôm nay (" + now.dateKey + ") — " + todays.length + " việc, " + totalH + "h",
          body: lines + "\n\n— La Bàn Việc"
        });
      }
    }
  }

  if (remind.habitsEndOfDay !== false){
    var habitsHour = Number(remind.habitsHour);
    if (isNaN(habitsHour)) habitsHour = 21;
    if (now.hourDecimal >= habitsHour && now.hourDecimal < habitsHour + CHECK_WINDOW_HOURS){
      var key = "habits:" + now.dateKey;
      if (!sentKeys[key]){
        var notDone = habits.filter(function(h){ return !(h.hoanThanh && h.hoanThanh[now.dateKey]); });
        if (notDone.length){
          newKeys.push(key);
          var hlines = notDone.map(function(h){ return "• " + h.ten; }).join("\n");
          emails.push({
            subject: "🔥 Còn " + notDone.length + " thói quen chưa làm hôm nay (hạn 23:59)",
            body: hlines + "\n\n— La Bàn Việc"
          });
        } else {
          newKeys.push(key); // xong hết — vẫn đánh dấu đã kiểm tra để khỏi lặp lại trong cửa sổ, không gửi email
        }
      }
    }
  }

  emails.forEach(function(m){
    // Phần 29: TRƯỚC ĐÂY lỗi bị nuốt hoàn toàn im lặng (không ghi lại gì) — nếu email thất bại vì
    // BẤT KỲ lý do gì (hết quota, mất quyền, lỗi tạm thời...), không có cách nào biết được ngoài
    // việc để ý thấy KHÔNG nhận được email, không rõ tại sao. Giờ ghi lại lỗi bằng console.error —
    // xem được tại Apps Script editor > "Execution log"/"Executions" (đồng hồ bên trái) > mở đúng
    // lượt chạy checkAndSendReminders() quanh giờ dự kiến gửi > mục "Logs" sẽ thấy dòng lỗi cụ thể.
    try { MailApp.sendEmail(remind.email, m.subject, m.body); }
    catch(err){ console.error("Gửi email nhắc nhở thất bại (\"" + m.subject + "\"): " + err); }
  });
  appendRemindLogKeys_(ss, newKeys);
}

// Phần 37: CỐ Ý cho gửi thử được ngay cả khi "Bật nhắc nhở qua Email" (remind.enabled) đang TẮT —
// để người dùng test được kênh Email trước khi bật hẳn. Nhưng điều đó tạo ra 1 điểm mù: gửi thử
// OK không hề đảm bảo NHẮC NHỞ THẬT (checkAndSendReminders(), có kiểm tra remind.enabled) sẽ chạy —
// nếu quên bấm "Lưu tất cả thay đổi" sau khi tick checkbox, remind.enabled trên Sheet vẫn là false,
// gửi thử vẫn "✅ Đã gửi" bình thường nhưng nhắc nhở tự động sẽ KHÔNG BAO GIỜ chạy, không có gì báo
// hiệu cho người dùng biết. Trả kèm remindEnabled để client tự cảnh báo rõ ràng ngay khi test OK.
function sendTestReminderEmail_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsRead = readSettingsFromSheet_(ss);
  var remind = settingsRead.settings && settingsRead.settings.remind;
  if (!remind || !remind.email) return jsonOut_({ok:false, error:"Chưa điền email trong Cài đặt > mục 9) Nhắc nhở."});
  try {
    MailApp.sendEmail(remind.email, "✅ La Bàn Việc — email thử nghiệm", "Nếu bạn nhận được email này, nghĩa là Code.gs + MailApp đang gửi email thành công tới đúng địa chỉ đã cấu hình.\n\n— La Bàn Việc");
    return jsonOut_({ok:true, remindEnabled: !!remind.enabled});
  } catch(err){
    return jsonOut_({ok:false, error:String(err)});
  }
}

// Phần 28: `sendTestReminderEmail_()` có gạch dưới `_` ở cuối tên nên bị Apps Script TỰ ẨN khỏi
// danh sách chọn hàm để chạy (▶ Run) trên thanh công cụ editor — quy ước ngầm của Apps Script,
// không phải lỗi. Vì vậy chạy `setupReminderTrigger` (không gọi MailApp) sẽ KHÔNG bao giờ hiện
// popup xin quyền gửi email, dù chạy bao nhiêu lần — phải chạy đúng 1 hàm có gọi MailApp.sendEmail
// mới ép được Google hiện popup xin quyền đó. Hàm này (không có `_`, chọn chạy trực tiếp được)
// chỉ để CHẠY TAY 1 LẦN DUY NHẤT trong Apps Script editor (không phải qua app) nhằm mục đích xin
// quyền — chạy xong nếu thấy email thử gửi tới đúng địa chỉ đã cấu hình ở mục 9 Cài đặt nghĩa là
// đã cấp quyền thành công, từ đó "Gửi email thử" trong app và email nhắc nhở thật (checkAndSendReminders())
// sẽ tự gửi được, không cần chạy lại hàm này nữa.
function uyQuyenGuiEmailLanDau(){
  var result = sendTestReminderEmail_();
  var body = JSON.parse(result.getContent());
  SpreadsheetApp.getUi().alert(
    body.ok
      ? "✅ Đã gửi thành công! Google vừa cấp quyền gửi email cho dự án — từ giờ nút \"Gửi email thử\" trong app và email nhắc nhở thật sẽ tự gửi được, không cần chạy lại hàm này."
      : "⚠️ Chưa gửi được: " + (body.error || "(không rõ lỗi)") + "\n\nNếu lỗi vẫn nhắc tới quyền (permission/authorization), thử chạy lại hàm này 1 lần nữa. Nếu lỗi khác (vd \"Chưa điền email...\"), vào app → Cài đặt → mục 9 điền email rồi bấm \"Lưu tất cả thay đổi\" trước."
  );
}

// Tạo (hoặc thay mới) trigger chạy checkAndSendReminders() mỗi 5 phút — chạy TAY 1 lần (▶ Run,
// chọn đúng tên hàm này). An toàn chạy lại nhiều lần: luôn xoá trigger CŨ của đúng hàm này trước khi
// tạo trigger mới, không bao giờ bị nhân đôi (chạy 2 lần/2 email cho cùng 1 thứ).
function setupReminderTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(tr){
    if (tr.getHandlerFunction() === "checkAndSendReminders") ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger("checkAndSendReminders").timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert(
    "Đã bật nhắc nhở qua email — checkAndSendReminders() sẽ tự chạy mỗi 5 phút.\n\n" +
    "Nhớ vào app → Cài đặt → mục 9) Nhắc nhở → bật + điền đúng email + bấm \"Lưu tất cả thay đổi\" " +
    "thì mới thực sự có email gửi ra (trigger chạy nhưng sẽ tự bỏ qua nếu chưa bật/chưa điền email)."
  );
}

// Dọn bớt nhật ký nhắc nhở cũ (chạy TAY, không bắt buộc) — mỗi khoá chỉ vài chục byte nên rất nhẹ,
// nhưng có thể dọn định kỳ nếu muốn — xoá các mục cũ hơn 60 ngày (dữ liệu ngày nào cũng có khoá mới
// nên không cần giữ lâu như "Nhật ký xoá").
function xoaSachNhatKyNhacNhoCu(){
  var soNgay = 60;
  var nguong = Date.now() - soNgay * 24 * 60 * 60 * 1000;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getRemindLogSheet_(ss);
  var lastRow = sh.getLastRow();
  if (lastRow < 2){
    SpreadsheetApp.getUi().alert("Nhật ký nhắc nhở đang trống, không có gì để dọn.");
    return;
  }
  var values = sh.getRange(2,1,lastRow-1,REMIND_LOG_HEADERS.length).getValues();
  var kept = values.filter(function(row){ return (Number(row[1])||0) >= nguong; });
  var removed = values.length - kept.length;
  sh.getRange(2,1,lastRow-1,REMIND_LOG_HEADERS.length).clearContent();
  if (kept.length) sh.getRange(2,1,kept.length,REMIND_LOG_HEADERS.length).setValues(kept);
  SpreadsheetApp.getUi().alert("Đã dọn " + removed + " mục cũ hơn " + soNgay + " ngày trong nhật ký nhắc nhở.");
}

function setupGuideSheet_(ss){
  var sh = ss.getSheetByName(SHEET_NAMES.GUIDE);
  if (!sh) sh = ss.insertSheet(SHEET_NAMES.GUIDE);
  sh.clear();
  var lines = [
    ["🧭 HƯỚNG DẪN NHANH — La Bàn Việc"],
    [""],
    ["File Sheet này giờ chỉ đóng vai trò KHO LƯU TRỮ dữ liệu, đồng bộ 2 chiều với app"],
    ["La Bàn Việc — https://vietquoc26.github.io/personal-assistant/ (đã cài như app"],
    ["trên điện thoại). App là nơi DUY NHẤT tự động xếp lịch, tính điểm ưu tiên, hiển"],
    ["thị Lịch ngày/tuần/tháng — Sheet không còn công thức tự xếp lịch nữa, để tránh"],
    ["2 nơi tính ra 2 kết quả khác nhau."],
    [""],
    ["Các sheet dữ liệu chính (còn 2 sheet ẩn — đừng mở/sửa, chỉ dùng nội bộ:"],
    ["\"" + SHEET_NAMES.TRASH + "\" nhớ id nào vừa bị xoá tránh hồi sinh nhầm, \"" + SHEET_NAMES.REMIND_LOG + "\""],
    ["nhớ email nhắc nhở nào đã gửi tránh gửi trùng):"],
    ["• Công việc — mỗi hàng là 1 việc. Có thể thêm hàng mới trực tiếp ở đây (chỉ cần"],
    ["  điền cột \"ten\" — id sẽ được tự sinh ở lần đồng bộ kế tiếp); có thể sửa Trạng"],
    ["  thái, Ghi chú... trực tiếp. Xoá 1 việc trong app → dòng tương ứng sẽ TỰ BIẾN"],
    ["  MẤT khỏi Sheet này ở lần đồng bộ kế tiếp (không còn giữ lại + đánh dấu"],
    ["  deleted=TRUE như trước — Sheet luôn chỉ hiển thị đúng việc đang tồn tại)."],
    ["• Thói quen — danh sách thói quen theo dõi hằng ngày, xoá cũng hoạt động y hệt"],
    ["  (dòng biến mất khỏi Sheet khi bạn xoá thói quen trong app)."],
    ["• Cài đặt — các thông số của app (điểm ưu tiên, sức chứa theo tuần, khung giờ..."],
    ["  ở dạng JSON trong cột \"Giá trị\"). Sửa trực tiếp ở đây cần cẩn thận đúng cú"],
    ["  pháp JSON — nên sửa trong app rồi để app tự đồng bộ lên đây thì an toàn hơn."],
    [""],
    ["Đồng bộ: mở app → Cài đặt → mục 7 → dán URL Web App + Token → \"Đồng bộ ngay\"."],
    ["App tự đồng bộ nền sau mỗi lần thêm/sửa/xoá và mỗi lần mở app. Nếu sửa gì trực"],
    ["tiếp trên Sheet này, thay đổi sẽ được app kéo về ở lần đồng bộ tiếp theo."],
    [""],
    ["Xung đột (sửa cùng lúc ở cả app và Sheet): bản có thời điểm sửa (updatedAt) mới"],
    ["hơn sẽ thắng, ghi đè bản cũ hơn."],
    [""],
    ["Đồng bộ hoạt động khi mở app qua https://vietquoc26.github.io/personal-assistant/"],
    ["(hoặc file index.html tải về/tự host) — riêng bản xem trước dạng link"],
    ["claude.ai/artifact không gọi mạng ra ngoài được nên không đồng bộ."],
    [""],
    ["🔔 Nhắc nhở qua email (tuỳ chọn, phần 24): bấm ▶ Run, chọn hàm \"setupReminderTrigger\","],
    ["cho phép quyền gửi email khi được hỏi — chạy 1 lần là xong. Sau đó vào app → Cài đặt →"],
    ["mục 9) Nhắc nhở → bật + điền email nhận → Lưu. checkAndSendReminders() sẽ tự chạy mỗi"],
    ["5 phút để gửi email nhắc trước giờ / báo trễ giờ / tổng hợp kế hoạch sáng / thói quen"],
    ["chưa làm cuối ngày — hoạt động cả khi máy tính/điện thoại đã tắt hẳn."]
  ];
  sh.getRange(1,1,lines.length,1).setValues(lines);
  sh.setColumnWidth(1, 720);
  sh.getRange(1,1).setFontWeight("bold").setFontSize(14);
}
