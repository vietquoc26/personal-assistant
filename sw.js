/**
 * Service Worker cho La Bàn Việc (PWA)
 * ------------------------------------
 * Mục đích DUY NHẤT ở đây là giúp trình duyệt coi app đủ điều kiện "Cài đặt"
 * (Add to Home Screen / Install app) và mở lại được app-shell khi mất mạng.
 * KHÔNG can thiệp vào dữ liệu — mọi lưu trữ vẫn là localStorage trong trang,
 * và các request đồng bộ tới Google Apps Script (script.google.com) luôn được
 * cho đi thẳng ra mạng, không cache, không chặn.
 */

var CACHE_VERSION = "labanviec-shell-v1";
var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {
        // Nếu 1 file lỗi (vd icon thiếu) vẫn không chặn cài đặt SW
      });
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_VERSION) return caches.delete(key);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Chỉ xử lý GET, cùng origin (app-shell). Mọi request khác (đồng bộ Google
  // Sheet, font ngoài, v.v.) để mặc định đi thẳng ra mạng, không đụng vào.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Network-first cho trang HTML chính (luôn ưu tiên bản mới nhất khi có mạng),
  // rơi về cache khi mất mạng để app vẫn mở được (dữ liệu đọc từ localStorage).
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var resClone = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, resClone); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match("./index.html") || caches.match("./");
          });
        })
    );
    return;
  }

  // Cache-first cho icon/manifest tĩnh (ít đổi) — nhanh, đỡ tốn mạng.
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        var resClone = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, resClone); });
        return res;
      });
    })
  );
});
