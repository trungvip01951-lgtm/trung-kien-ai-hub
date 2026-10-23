import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkOpenable } from "./open-file";

test("mở tệp từ khung chat: tương đối theo dự án, chặn tệp chạy chương trình", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mo-tep-"));
  writeFileSync(path.join(dir, "bao-cao.xlsx"), "x");
  writeFileSync(path.join(dir, "cai.exe"), "x");
  assert.deepEqual(checkOpenable("bao-cao.xlsx", dir), { ok: true, file: path.join(dir, "bao-cao.xlsx") });
  assert.equal(checkOpenable("cai.exe", dir).ok, false);
  assert.equal(checkOpenable("khong-co.pdf", dir).ok, false);
  assert.equal(checkOpenable("", dir).ok, false);
  // Chỉ mở loại tệp tài liệu/bảng/ảnh; tệp chương trình python, dạng lách đuôi đều bị chặn.
  writeFileSync(path.join(dir, "chay.py"), "x");
  assert.equal(checkOpenable("chay.py", dir).ok, false);
  assert.equal(checkOpenable("cai.exe.", dir).ok, false);
  assert.equal(checkOpenable("cai.exe::$DATA", dir).ok, false);
  // Liên kết file:///, mã %xx và dấu % thật.
  writeFileSync(path.join(dir, "Lãi 100%.xlsx"), "x");
  assert.equal(checkOpenable("Lãi 100%.xlsx", dir).ok, true);
  assert.equal(checkOpenable(`file://${path.join(dir, "bao-cao.xlsx").replace(/ /g, "%20")}`, null).ok, true);
});
