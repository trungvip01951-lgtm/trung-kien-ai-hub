import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChromeSettings } from "../shared/contract";
import { chromeServerConfig, decideBrowser, pageUrlFrom, siteMode } from "./chrome";

const s: ChromeSettings = { enabled: true, browser: "chrome", sites: [
  { host: "mau-a.vn", mode: "auto" }, { host: "doc.mau-a.vn", mode: "read" }, { host: "hoi.vn", mode: "ask" },
] };
const t = (n: string) => `mcp__chrome__${n}`;

test("quyền theo website: tên miền con, tên miền dài khớp trước, ngoài danh sách", () => {
  assert.equal(siteMode(s, "https://www.mau-a.vn/x"), "auto");
  assert.equal(siteMode(s, "https://doc.mau-a.vn/"), "read");
  assert.equal(siteMode(s, "https://mau-a.vn.lua-dao.com/"), null);
  assert.equal(siteMode(s, "https://xmau-a.vn/"), null);
  assert.equal(siteMode(s, "file:///C:/x"), null);
});

test("mở trang: trong danh sách tự mở, ngoài danh sách hỏi, không phải http thì chặn", () => {
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "https://mau-a.vn/" }, null).decision, "allow");
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "https://la.com/" }, null).decision, "ask");
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "file:///C:/Users/x/.ssh/id_rsa" }, null).decision, "deny");
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "javascript:alert(1)" }, null).decision, "deny");
});

test("thao tác: theo quyền của trang đang mở; đăng/lưu/gửi luôn hỏi", () => {
  const click = (el: string, url: string | null, ro = false) => decideBrowser(s, t("browser_click"), { element: el, target: "e1" }, url, ro).decision;
  assert.equal(click("ô tìm kiếm", "https://mau-a.vn/a"), "allow");
  assert.equal(click("nút Lưu bài", "https://mau-a.vn/a"), "ask");
  assert.equal(click("Publish button", "https://mau-a.vn/a"), "ask");
  assert.equal(click("Hướng dẫn", "https://mau-a.vn/a"), "allow");          // "guide"/"Hướng" không bị nhầm là "gửi"
  assert.equal(click("ô tìm kiếm", "https://hoi.vn/"), "ask");
  assert.equal(click("ô tìm kiếm", "https://doc.mau-a.vn/"), "deny");
  assert.equal(click("ô tìm kiếm", "https://la.com/"), "ask");
  assert.equal(click("ô tìm kiếm", null), "ask");
  assert.equal(click("ô tìm kiếm", "https://mau-a.vn/a", true), "deny");     // việc Chỉ đọc
  const type = (inp: object) => decideBrowser(s, t("browser_type"), inp, "https://mau-a.vn/").decision;
  assert.equal(type({ element: "ô tên", target: "e2", text: "Khách Mẫu A" }), "allow");
  assert.equal(type({ element: "ô tên", target: "e2", text: "x", submit: true }), "ask");
  assert.equal(decideBrowser(s, t("browser_press_key"), { key: "Enter" }, "https://mau-a.vn/").decision, "ask");
  assert.equal(decideBrowser(s, t("browser_file_upload"), { paths: ["a"] }, "https://mau-a.vn/").decision, "ask");
});

test("xem trang luôn được; cookie, bộ nhớ trang, mã tuỳ ý bị chặn", () => {
  for (const n of ["browser_snapshot", "browser_take_screenshot", "browser_tabs", "browser_wait_for"]) assert.equal(decideBrowser(s, t(n), {}, null).decision, "allow", n);
  for (const n of ["browser_cookie_list", "browser_localstorage_get", "browser_storage_state", "browser_route", "browser_run_code_unsafe", "browser_start_tracing"]) {
    assert.equal(decideBrowser(s, t(n), {}, "https://mau-a.vn/").decision, "deny", n);
  }
  assert.equal(decideBrowser(s, t("browser_evaluate"), { function: "() => 1" }, "https://mau-a.vn/").decision, "ask");
  assert.equal(decideBrowser(s, t("browser_tabs"), { action: "new", url: "https://la.com/" }, null).decision, "ask");
});

test("đọc địa chỉ trang từ kết quả công cụ; cấu hình chạy bằng tệp của app", () => {
  assert.equal(pageUrlFrom([{ type: "text", text: "### Page\n- Page URL: https://mau-a.vn/b\n- Page Title: x" }]), "https://mau-a.vn/b");
  assert.equal(pageUrlFrom("không có"), null);
  const c = chromeServerConfig(s, { nodeBinary: "C:/app/app.exe", cliPath: "C:/app/cli.js", profileDir: "C:/d/chrome-profile", outputDir: "C:/d/out" });
  assert.equal(c.command, "C:/app/app.exe");
  assert.deepEqual(c.env, { ELECTRON_RUN_AS_NODE: "1" });
  assert.ok(c.args!.includes("--user-data-dir") && c.args!.includes("C:/d/chrome-profile"));
  assert.deepEqual(c.args!.slice(-2), ["--browser", "chrome"]);
});
