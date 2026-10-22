import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import JSZip from "jszip";
import { excelRead, excelWrite, wordCreate, wordReplace, wordRead } from "./office";

const tmp = mkdtempSync(path.join(os.tmpdir(), "tkhub-office-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe("Excel", () => {
  const file = path.join(tmp, "bang.xlsx");
  const bak = path.join(tmp, "bak");

  it("tạo mới, ghi công thức và đọc lại", async () => {
    const r = await excelWrite(file, { sheet: "Bán hàng", start: "B2", rows: [
      ["Khách", "SL", "Giá"],
      ["Khách Mẫu A", 2, 1000],
      ["Máy bơm mẫu", 3, 500],
      ["Tổng", "=SUM(B3:B4)", "0000000001"],
    ] }, bak);
    assert.deepEqual(r, { backup: null, cells: 12, created: true });
    assert.equal(existsSync(bak), false);
    const got = await excelRead(file);
    assert.deepEqual(got.sheets, ["Bán hàng"]);
    assert.equal(got.totalRows, 5);
    assert.equal(got.truncated, false);
    assert.deepEqual(got.rows[1], [null, "Khách", "SL", "Giá"]);
    assert.equal(got.rows[2][1], "Khách Mẫu A");
    assert.equal(got.rows[4][3], "0000000001");
    // Công thức chưa có giá trị tính sẵn: trả null, không ném lỗi.
    assert.equal(got.rows[4][2], null);
  });

  it("ghi đè: sao lưu bản gốc, thêm sheet mới, đọc range và maxRows", async () => {
    const before = readFileSync(file);
    const r = await excelWrite(file, { sheet: "Ngày", start: "A1", rows: [[new Date(Date.UTC(2026, 9, 22)) as unknown as string, true, null]] }, bak);
    assert.equal(r.created, false);
    assert.ok(r.backup && existsSync(r.backup));
    assert.match(path.basename(r.backup), /^bang\.xlsx\.\d{8}-\d{6}\.bak\.xlsx$/);
    assert.deepEqual(readFileSync(r.backup), before);
    assert.equal(readdirSync(bak).length, 1);

    const sheets = await excelRead(file, { sheet: "Ngày" });
    assert.deepEqual(sheets.sheets, ["Bán hàng", "Ngày"]);
    assert.equal(sheets.rows[0][0], "2026-10-22");
    assert.equal(sheets.rows[0][1], true);

    const part = await excelRead(file, { sheet: "Bán hàng", range: "B3:C4" });
    assert.deepEqual(part.rows, [["Khách Mẫu A", 2], ["Máy bơm mẫu", 3]]);

    const cut = await excelRead(file, { sheet: "Bán hàng", maxRows: 2 });
    assert.equal(cut.rows.length, 2);
    assert.equal(cut.truncated, true);
    assert.equal(cut.totalRows, 5);
  });

  it("sheet không tồn tại nêu danh sách sheet", async () => {
    await assert.rejects(() => excelRead(file, { sheet: "Không có" }), /Bán hàng, Ngày/);
  });

  it("quá 100.000 ô thì từ chối", async () => {
    const rows = [new Array(100_001).fill(1)];
    await assert.rejects(() => excelWrite(path.join(tmp, "lon.xlsx"), { sheet: "S", start: "A1", rows }, bak), /tối đa/);
  });

  it("báo lỗi rõ với .xls", async () => {
    await assert.rejects(() => excelRead(path.join(tmp, "cu.xls")), /Định dạng cũ/);
    await assert.rejects(() => excelWrite(path.join(tmp, "cu.xls"), { sheet: "S", start: "A1", rows: [] }, bak), /Định dạng cũ/);
  });
});

describe("Word", () => {
  const file = path.join(tmp, "van-ban.docx");
  const bak = path.join(tmp, "bak-word");

  it("tạo rồi đọc lại; không ghi đè", async () => {
    const r = await wordCreate(file, [
      { type: "heading", text: "Báo giá mẫu", level: 1 },
      { type: "paragraph", text: "Gửi Khách Mẫu A, sản phẩm Máy bơm mẫu." },
      { type: "bullet", text: "Điện thoại 0000000001" },
      { type: "paragraph", text: "Máy bơm mẫu, giá tốt. Máy bơm mẫu bền." },
    ]);
    assert.equal(r.paragraphs, 4);
    const w = await wordRead(file);
    assert.equal(w.truncated, false);
    assert.match(w.text, /Báo giá mẫu/);
    assert.match(w.text, /Điện thoại 0000000001/);
    await assert.rejects(() => wordCreate(file, []), /không ghi đè/);
  });

  it("thay chữ: đếm đúng, escape, có sao lưu", async () => {
    const before = readFileSync(file);
    const r = await wordReplace(file, "Máy bơm mẫu", "Máy <A&B>", bak);
    assert.equal(r.count, 3);
    assert.deepEqual(readFileSync(r.backup), before);
    const w = await wordRead(file);
    assert.match(w.text, /Máy <A&B>, giá tốt\. Máy <A&B> bền\./);
    const xml = await (await JSZip.loadAsync(readFileSync(file))).file("word/document.xml")!.async("string");
    assert.ok(xml.includes("Máy &lt;A&amp;B&gt;"));
    // So khớp trên chữ đã unescape: tìm lại "<A&B>" phải thấy 3 chỗ.
    const r2 = await wordReplace(file, "<A&B>", "X", bak);
    assert.equal(r2.count, 3);
  });

  it("count 0 thì tệp không đổi và không sao lưu", async () => {
    const before = readFileSync(file);
    const n = readdirSync(bak).length;
    const r = await wordReplace(file, "không tồn tại", "x", bak);
    assert.equal(r.count, 0);
    assert.deepEqual(readFileSync(file), before);
    assert.equal(readdirSync(bak).length, n);
  });

  it("find rỗng và .doc báo lỗi", async () => {
    await assert.rejects(() => wordReplace(file, "", "x", bak), /không được để trống/);
    const old = path.join(tmp, "cu.doc");
    writeFileSync(old, "x");
    await assert.rejects(() => wordRead(old), /Định dạng cũ/);
    await assert.rejects(() => wordCreate(old, []), /Định dạng cũ/);
  });
});
