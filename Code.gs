/**
 * LA BÀN VIỆC — ĐỒNG BỘ 2 CHIỀU VỚI GOOGLE SHEET
 * =================================================
 * File này biến chính Google Sheet này thành một "kho lưu trữ" thứ hai cho app
 * La Bàn Việc (file la-ban-viec.html chạy bằng localStorage trên máy bạn).
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
 *   6. Mở app la-ban-viec.html → Cài đặt → mục "8) Đồng bộ với Google Sheet" →
 *      dán URL vào ô "URL Web App", dán đúng TOKEN vào ô "Token bí mật" → bấm
 *      "Lưu cấu hình" rồi "Kiểm tra kết nối". Nếu báo "Kết nối OK" là xong —
 *      lần "Đồng bộ ngay" tiếp theo sẽ tự điền toàn bộ dữ liệu hiện có trong app
 *      lên Sheet (không cần bạn nhập lại tay).
 *   7. Mỗi khi sửa Code.gs (ví dụ đổi TOKEN), phải bấm Deploy → Manage deployments
 *      → sửa deployment hiện có → Version: New version → Deploy lại thì URL cũ
 *      mới nhận code mới (nếu deploy bản mới hoàn toàn thì URL sẽ đổi).
 */

var TOKEN = "DOI_CHUOI_NAY_THANH_BI_MAT_CUA_BAN";

var SHEET_NAMES = {
  TASKS: "Công việc",
  HABITS: "Thói quen",
  SETTINGS: "Cài đặt",
  GUIDE: "Hướng dẫn nhanh"
};

var TASK_HEADERS = ["id","ten","linhVuc","mucDo","gio","deadline","ngayBatDau","trangThai","ngayHoanThanh","pausedAt","ghiChu","order","createdAt","ghimNgay","ghimGio","updatedAt","deleted"];
var TASK_TEXT_COLUMNS = ["deadline","ngayBatDau","ngayHoanThanh","pausedAt","ghimNgay"]; // giữ dạng text "yyyy-MM-dd", tránh Sheet tự đổi thành ngày

var HABIT_HEADERS = ["id","ten","nhom","active","order","hoanThanhJson","updatedAt","deleted"];

var SETTINGS_FIELDS = ["scoreCao","scoreTB","scoreThap","bonusSoon","bonusLate","daysSoon","planDays","weeklyTemplate","capacityOverrides","routine","lvMap","poolWindows","focusWindows"];

var OLD_SHEETS_TO_RETIRE = ["Tổng quan","Lịch ngày","Lịch tuần","Lịch tháng"];
var ROW_BUFFER = 2000; // đủ dùng cho vài năm dữ liệu cá nhân

/* ===================== WEB APP ENTRY POINTS ===================== */

function doGet(e){
  if (!checkToken_(e)) return jsonOut_({error:"unauthorized"});
  var action = (e && e.parameter && e.parameter.action) || "ping";
  if (action === "ping") return jsonOut_({ok:true, serverTime: Date.now()});
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOut_({
    tasks: readTasksFromSheet_(ss),
    habits: readHabitsFromSheet_(ss),
    settings: readSettingsFromSheet_(ss).settings,
    settingsUpdatedAt: readSettingsFromSheet_(ss).updatedAt,
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

    var mergedTasks = mergeRows_(readTasksFromSheet_(ss), Array.isArray(body.tasks) ? body.tasks : []);
    writeTasksToSheet_(ss, mergedTasks);

    var mergedHabits = mergeRows_(readHabitsFromSheet_(ss), Array.isArray(body.habits) ? body.habits : []);
    writeHabitsToSheet_(ss, mergedHabits);

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
  sheetRows.forEach(function(r){ byId[r.id] = r; });
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

function readTasksFromSheet_(ss){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TASKS, TASK_HEADERS);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2,1,lastRow-1,TASK_HEADERS.length).getValues();
  var out = [];
  for (var i=0;i<values.length;i++){
    var row = values[i];
    var obj = {};
    TASK_HEADERS.forEach(function(h, idx){ obj[h] = row[idx]; });
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
      deleted: obj.deleted === true || String(obj.deleted).toUpperCase() === "TRUE"
    });
  }
  return out;
}

function writeTasksToSheet_(ss, tasks){
  var sh = getOrCreateSheet_(ss, SHEET_NAMES.TASKS, TASK_HEADERS);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2,1,lastRow-1,TASK_HEADERS.length).clearContent();
  if (!tasks || !tasks.length) return;
  var rows = tasks.map(function(t){
    return [
      t.id||"", t.ten||"", t.linhVuc||"", t.mucDo||"", Number(t.gio)||0,
      t.deadline||"", t.ngayBatDau||"", t.trangThai||"", t.ngayHoanThanh||"",
      t.pausedAt||"", t.ghiChu||"", Number(t.order)||0, Number(t.createdAt)||0,
      (t.ghim && t.ghim.ngay) || "", (t.ghim && t.ghim.gioBatDau!=null) ? t.ghim.gioBatDau : "",
      Number(t.updatedAt)||0, !!t.deleted
    ];
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
  if (!habits || !habits.length) return;
  var rows = habits.map(function(h){
    return [
      h.id||"", h.ten||"", h.nhom||"work", h.active!==false,
      Number(h.order)||0, JSON.stringify(h.hoanThanh||{}),
      Number(h.updatedAt)||0, !!h.deleted
    ];
  });
  sh.getRange(2,1,rows.length,HABIT_HEADERS.length).setValues(rows);
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
    try { sh.autoResizeColumns(1, headers.length); } catch(e){}
  } else {
    // đảm bảo header hàng 1 luôn đúng, kể cả khi sheet đã có từ trước
    var curHeader = sh.getRange(1,1,1,headers.length).getValues()[0];
    var same = curHeader.every(function(v,i){ return v === headers[i]; });
    if (!same){
      sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight("bold").setBackground("#E1EEE8");
      sh.setFrozenRows(1);
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
    ["Nếu tab \"" + SHEET_NAMES.HABITS + "\" đang trống: mở app La Bàn Việc → Cài đặt → mục 8) Đồng bộ với Google Sheet → bấm \"Đồng bộ ngay\" một lần — danh sách thói quen đang có trên app sẽ tự điền vào tab đó."],
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

function setupGuideSheet_(ss){
  var sh = ss.getSheetByName(SHEET_NAMES.GUIDE);
  if (!sh) sh = ss.insertSheet(SHEET_NAMES.GUIDE);
  sh.clear();
  var lines = [
    ["🧭 HƯỚNG DẪN NHANH — La Bàn Việc"],
    [""],
    ["File Sheet này giờ chỉ đóng vai trò KHO LƯU TRỮ dữ liệu, đồng bộ 2 chiều với app"],
    ["La Bàn Việc (file la-ban-viec.html). App là nơi DUY NHẤT tự động xếp lịch, tính"],
    ["điểm ưu tiên, hiển thị Lịch ngày/tuần/tháng — Sheet không còn công thức tự xếp"],
    ["lịch nữa, để tránh 2 nơi tính ra 2 kết quả khác nhau."],
    [""],
    ["3 sheet dữ liệu:"],
    ["• Công việc — mỗi hàng là 1 việc. Có thể thêm hàng mới trực tiếp ở đây (chỉ cần"],
    ["  điền cột \"ten\" — id sẽ được tự sinh ở lần đồng bộ kế tiếp); có thể sửa Trạng"],
    ["  thái, Ghi chú... trực tiếp. Cột \"deleted\" = TRUE nghĩa là việc đã bị xoá."],
    ["• Thói quen — danh sách thói quen theo dõi hằng ngày."],
    ["• Cài đặt — các thông số của app (điểm ưu tiên, sức chứa theo tuần, khung giờ..."],
    ["  ở dạng JSON trong cột \"Giá trị\"). Sửa trực tiếp ở đây cần cẩn thận đúng cú"],
    ["  pháp JSON — nên sửa trong app rồi để app tự đồng bộ lên đây thì an toàn hơn."],
    [""],
    ["Đồng bộ: mở app → Cài đặt → mục 8 → dán URL Web App + Token → \"Đồng bộ ngay\"."],
    ["App tự đồng bộ nền sau mỗi lần thêm/sửa/xoá và mỗi lần mở app. Nếu sửa gì trực"],
    ["tiếp trên Sheet này, thay đổi sẽ được app kéo về ở lần đồng bộ tiếp theo."],
    [""],
    ["Xung đột (sửa cùng lúc ở cả app và Sheet): bản có thời điểm sửa (updatedAt) mới"],
    ["hơn sẽ thắng, ghi đè bản cũ hơn."],
    [""],
    ["Chỉ bản la-ban-viec.html tải về (mở bằng file .html hoặc tự host) đồng bộ được —"],
    ["bản xem trên claude.ai/artifact không gọi được ra ngoài nên không đồng bộ."]
  ];
  sh.getRange(1,1,lines.length,1).setValues(lines);
  sh.setColumnWidth(1, 720);
  sh.getRange(1,1).setFontWeight("bold").setFontSize(14);
}
