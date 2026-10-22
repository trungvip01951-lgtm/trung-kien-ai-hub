import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChromeSettings } from "../shared/contract";
import { chromeServerConfig, decideBrowser, newBrowserState, pageUrlFrom, siteMode, updateBrowserState, type BrowserState } from "./chrome";

const s: ChromeSettings = { enabled: true, browser: "chrome", sites: [
  { host: "mau-a.vn", mode: "auto" }, { host: "doc.mau-a.vn", mode: "read" }, { host: "hoi.vn", mode: "ask" },
] };
const t = (n: string) => `mcp__chrome__${n}`;
// Trạng thái như sau một browser_snapshot thật của Playwright MCP.
const at = (url: string | null, snapshot = ""): BrowserState => {
  const st = newBrowserState();
  if (url) updateBrowserState(st, t("browser_snapshot"), [{ type: "text", text: `### Page\n- Page URL: ${url}\n- Page Title: x\n### Snapshot\n\`\`\`yaml\n${snapshot}\n\`\`\`` }]);
  return st;
};
const SNAP = '- textbox "Tìm kiếm" [ref=e1]\n- button "Lưu bài" [ref=e2]\n- link "Hướng dẫn" [ref=e3]\n- button "Xanh" [ref=e4]';

test("quyền theo website: tên miền con, tên miền dài khớp trước, ngoài danh sách", () => {
  assert.equal(siteMode(s, "https://www.mau-a.vn/x"), "auto");
  assert.equal(siteMode(s, "https://doc.mau-a.vn/"), "read");
  assert.equal(siteMode(s, "https://mau-a.vn.lua-dao.com/"), null);
  assert.equal(siteMode(s, "https://xmau-a.vn/"), null);
  assert.equal(siteMode(s, "file:///C:/x"), null);
});

test("mở trang: trong danh sách tự mở, ngoài danh sách hỏi, không phải http thì chặn", () => {
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "https://mau-a.vn/" }, at(null)).decision, "allow");
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "https://la.com/" }, at(null)).decision, "ask");
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "file:///C:/Users/x/.ssh/id_rsa" }, at(null)).decision, "deny");
  assert.equal(decideBrowser(s, t("browser_navigate"), { url: "javascript:alert(1)" }, at(null)).decision, "deny");
});

test("thao tác: theo quyền của trang đang mở; đăng/lưu/gửi luôn hỏi", () => {
  const click = (target: string, url: string | null, ro = false, el = "nút") => decideBrowser(s, t("browser_click"), { element: el, target }, at(url, SNAP), ro).decision;
  assert.equal(click("e1", "https://mau-a.vn/a"), "allow");
  assert.equal(click("e2", "https://mau-a.vn/a", false, "nút xanh"), "ask");   // chữ thật trên trang là "Lưu bài", model mô tả sai vẫn hỏi
  assert.equal(click("e4", "https://mau-a.vn/a", false, "Publish"), "ask");    // model mô tả là đăng thì hỏi
  assert.equal(click("e3", "https://mau-a.vn/a"), "allow");                    // "Hướng dẫn" không bị nhầm là "gửi"
  assert.equal(click("e9", "https://mau-a.vn/a"), "ask");                      // ref không có trong snapshot gần nhất
  assert.equal(click("#nut", "https://mau-a.vn/a"), "ask");                    // bộ chọn CSS: không biết chữ thật
  assert.equal(click("e1", "https://hoi.vn/"), "ask");
  assert.equal(click("e1", "https://doc.mau-a.vn/"), "deny");
  assert.equal(click("e1", "https://la.com/"), "ask");
  assert.equal(click("e1", null), "ask");
  assert.equal(click("e1", "https://mau-a.vn/a", true), "deny");               // việc Chỉ đọc
  const type = (inp: object) => decideBrowser(s, t("browser_type"), inp, at("https://mau-a.vn/", SNAP)).decision;
  assert.equal(type({ element: "ô tìm", target: "e1", text: "máy bơm" }), "allow");
  assert.equal(type({ element: "ô tìm", target: "e1", text: "x", submit: true }), "ask");
  for (const key of ["Enter", "Control+Enter", "Shift+Enter"]) assert.equal(decideBrowser(s, t("browser_press_key"), { key }, at("https://mau-a.vn/")).decision, "ask", key);
  assert.equal(decideBrowser(s, t("browser_press_key"), { key: "ArrowDown" }, at("https://mau-a.vn/")).decision, "allow");
  assert.equal(decideBrowser(s, t("browser_file_upload"), { paths: ["a"] }, at("https://mau-a.vn/")).decision, "ask");
});

test("xem trang luôn được; cookie, bộ nhớ trang, mã tuỳ ý bị chặn", () => {
  for (const n of ["browser_snapshot", "browser_take_screenshot", "browser_tabs", "browser_wait_for"]) assert.equal(decideBrowser(s, t(n), {}, at(null)).decision, "allow", n);
  for (const n of ["browser_cookie_list", "browser_localstorage_get", "browser_storage_state", "browser_route", "browser_run_code_unsafe", "browser_start_tracing",
    "browser_network_request", "browser_network_requests"]) {
    assert.equal(decideBrowser(s, t(n), {}, at("https://mau-a.vn/")).decision, "deny", n);
  }
  // Tên tệp tự đặt tính từ thư mục dự án: chặn để không ghi đè tệp dự án.
  assert.equal(decideBrowser(s, t("browser_take_screenshot"), { filename: ".git/hooks/pre-commit" }, at(null)).decision, "deny");
  assert.equal(decideBrowser(s, t("browser_evaluate"), { function: "() => 1" }, at("https://mau-a.vn/")).decision, "ask");
  assert.equal(decideBrowser(s, t("browser_tabs"), { action: "new", url: "https://la.com/" }, at(null)).decision, "ask");
  assert.equal(decideBrowser(s, t("webmcp_xoa_don"), {}, at("https://mau-a.vn/"), true).decision, "deny");
});

test("đọc địa chỉ trang từ kết quả công cụ; cấu hình chạy bằng tệp của app", () => {
  assert.equal(pageUrlFrom([{ type: "text", text: "### Page\n- Page URL: https://mau-a.vn/b\n- Page Title: x" }]), "https://mau-a.vn/b");
  assert.equal(pageUrlFrom("không có"), null);
  // Trang lạ tự ghi "Page URL" vào tiêu đề hoặc nội dung: không được tin.
  assert.equal(pageUrlFrom("### Page\n- Page URL: https://la.com/\n- Page Title: Page URL: https://mau-a.vn/"), "https://la.com/");
  assert.equal(pageUrlFrom("### Result\nđã chọn tab\n### Snapshot\n- text: x\n### Page\n- Page URL: https://mau-a.vn/"), null);
  // Đổi tab: kết quả không có địa chỉ → coi như chưa rõ trang, thao tác phải hỏi.
  const st = at("https://mau-a.vn/", SNAP);
  updateBrowserState(st, t("browser_tabs"), [{ type: "text", text: "### Result\n- 0: (current) [x](https://doc.mau-a.vn/)" }]);
  assert.equal(st.url, null);
  assert.equal(decideBrowser(s, t("browser_click"), { target: "e1" }, st).decision, "ask");
  const c = chromeServerConfig(s, { nodeBinary: "C:/app/app.exe", cliPath: "C:/app/cli.js", profileDir: "C:/d/chrome-profile", outputDir: "C:/d/out" });
  assert.equal(c.command, "C:/app/app.exe");
  assert.deepEqual(c.env, { ELECTRON_RUN_AS_NODE: "1" });
  assert.ok(c.args!.includes("--user-data-dir") && c.args!.includes("C:/d/chrome-profile"));
  assert.deepEqual(c.args!.slice(-2), ["--browser", "chrome"]);
  assert.ok(c.args!.includes("--no-webmcp"));
});
