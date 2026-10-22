import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import mammoth from "mammoth";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";

// Đọc/ghi tệp Excel và Word cho agent. Không import electron; đường dẫn tuyệt đối do nơi gọi đã kiểm quyền.
// Ghi đè tệp có sẵn luôn chép bản gốc vào thư mục sao lưu trước.

export type Cell = string | number | boolean | null;

export const EXCEL_MAX_ROWS = 500;
export const EXCEL_MAX_WRITE_CELLS = 100_000;
export const WORD_MAX_CHARS = 200_000;

// Kiểm phần mở rộng; báo rõ với định dạng cũ.
function checkExt(file: string, ext: ".xlsx" | ".docx") {
  const e = path.extname(file).toLowerCase();
  if (e === ext) return;
  if (e === ".xls" || e === ".doc") throw new Error("Định dạng cũ, mở bằng Excel/Word lưu lại thành .xlsx/.docx");
  throw new Error(`Chỉ hỗ trợ tệp ${ext}, tệp này là "${e || "không có đuôi"}".`);
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// Chép bản gốc vào backupDir: <tên gốc>.<yyyyMMdd-HHmmss>.bak.<đuôi>
function backupFile(file: string, backupDir: string): string {
  mkdirSync(backupDir, { recursive: true });
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const s = stamp(new Date());
  let dest = path.join(backupDir, `${base}${ext}.${s}.bak${ext}`);
  for (let i = 1; existsSync(dest); i++) dest = path.join(backupDir, `${base}${ext}.${s}-${i}.bak${ext}`);
  copyFileSync(file, dest);
  return dest;
}

// "A1" -> {col, row} (1-based)
function parseRef(ref: string): { col: number; row: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) throw new Error(`Địa chỉ ô "${ref}" không hợp lệ, ví dụ đúng: A1.`);
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  const row = Number(m[2]);
  if (row < 1 || col < 1 || col > 16384) throw new Error(`Địa chỉ ô "${ref}" nằm ngoài bảng tính.`);
  return { col, row };
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("formula" in o || "sharedFormula" in o) return cellValue((o.result ?? null) as ExcelJS.CellValue);
    if ("error" in o) return String(o.error);
    if ("text" in o) return cellValue(o.text as ExcelJS.CellValue);
  }
  return null;
}

export async function excelRead(file: string, opts: { sheet?: string; range?: string; maxRows?: number } = {}):
  Promise<{ sheets: string[]; sheet: string; rows: Cell[][]; truncated: boolean; totalRows: number }> {
  checkExt(file, ".xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets = wb.worksheets.map((w) => w.name);
  if (!sheets.length) throw new Error("Tệp Excel không có sheet nào.");
  const name = opts.sheet ?? sheets[0];
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Không có sheet "${name}". Các sheet trong tệp: ${sheets.join(", ")}.`);

  let c1 = 1, r1 = 1, c2 = Math.max(ws.columnCount, 1), r2 = ws.rowCount;
  if (opts.range) {
    const [a, b] = opts.range.split(":");
    const p = parseRef(a), q = parseRef(b ?? a);
    c1 = Math.min(p.col, q.col); c2 = Math.max(p.col, q.col);
    r1 = Math.min(p.row, q.row); r2 = Math.max(p.row, q.row);
  }
  const totalRows = Math.max(0, r2 - r1 + 1);
  const limit = Math.max(1, Math.floor(opts.maxRows ?? EXCEL_MAX_ROWS));
  const last = Math.min(r2, r1 + limit - 1);
  const rows: Cell[][] = [];
  for (let r = r1; r <= last; r++) {
    const row: Cell[] = [];
    for (let c = c1; c <= c2; c++) row.push(cellValue(ws.getCell(r, c).value));
    rows.push(row);
  }
  return { sheets, sheet: name, rows, truncated: totalRows > rows.length, totalRows };
}

export async function excelWrite(file: string, opts: { sheet: string; start: string; rows: Cell[][] }, backupDir: string):
  Promise<{ backup: string | null; cells: number; created: boolean }> {
  checkExt(file, ".xlsx");
  if (!opts.sheet.trim()) throw new Error("Thiếu tên sheet.");
  const cells = opts.rows.reduce((s, r) => s + r.length, 0);
  if (cells > EXCEL_MAX_WRITE_CELLS) throw new Error(`Ghi ${cells} ô một lần quá nhiều, tối đa ${EXCEL_MAX_WRITE_CELLS} ô.`);
  const { col, row } = parseRef(opts.start);

  const created = !existsSync(file);
  const wb = new ExcelJS.Workbook();
  let backup: string | null = null;
  if (created) {
    mkdirSync(path.dirname(file), { recursive: true });
  } else {
    await wb.xlsx.readFile(file);
    backup = backupFile(file, backupDir);
  }
  const ws = wb.getWorksheet(opts.sheet) ?? wb.addWorksheet(opts.sheet);
  opts.rows.forEach((r, i) => r.forEach((v, j) => {
    const cell = ws.getCell(row + i, col + j);
    if (typeof v === "string" && v.startsWith("=") && v.length > 1) cell.value = { formula: v.slice(1) } as ExcelJS.CellFormulaValue;
    else cell.value = v;
  }));
  await wb.xlsx.writeFile(file);
  return { backup, cells, created };
}

export async function wordRead(file: string): Promise<{ text: string; truncated: boolean }> {
  checkExt(file, ".docx");
  const { value } = await mammoth.extractRawText({ path: file });
  return value.length > WORD_MAX_CHARS ? { text: value.slice(0, WORD_MAX_CHARS), truncated: true } : { text: value, truncated: false };
}

export async function wordCreate(file: string, blocks: { type: "heading" | "paragraph" | "bullet"; text: string; level?: 1 | 2 | 3 }[]):
  Promise<{ paragraphs: number }> {
  checkExt(file, ".docx");
  if (existsSync(file)) throw new Error("Tệp đã có, không ghi đè. Đặt tên khác hoặc dùng chức năng thay chữ.");
  const heading = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;
  const children = blocks.map((b) => {
    if (b.type === "heading") return new Paragraph({ text: b.text, heading: heading[b.level ?? 1] ?? HeadingLevel.HEADING_1 });
    if (b.type === "bullet") return new Paragraph({ text: b.text, bullet: { level: 0 } });
    return new Paragraph({ text: b.text });
  });
  const buf = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf, { flag: "wx" });
  return { paragraphs: children.length };
}

const unescapeXml = (s: string) => s
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Thay chữ nằm trọn trong một thẻ <w:t>. Chữ bị tách qua nhiều đoạn định dạng sẽ không khớp (count = 0).
export async function wordReplace(file: string, find: string, replace: string, backupDir: string):
  Promise<{ count: number; backup: string }> {
  checkExt(file, ".docx");
  if (!find) throw new Error("Chữ cần tìm không được để trống.");
  const zip = await JSZip.loadAsync(readFileSync(file));
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  let count = 0;
  const changed = new Map<string, string>();
  for (const n of parts) {
    const xml = await zip.file(n)!.async("string");
    let local = 0;
    const out = xml.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (m, attrs: string | undefined, body: string) => {
      const text = unescapeXml(body);
      const hits = text.split(find).length - 1;
      if (!hits) return m;
      local += hits;
      const a = attrs ?? "";
      return `<w:t${/xml:space=/.test(a) ? a : `${a} xml:space="preserve"`}>${escapeXml(text.split(find).join(replace))}</w:t>`;
    });
    if (local) { count += local; changed.set(n, out); }
  }
  if (!count) return { count: 0, backup: "" };
  const backup = backupFile(file, backupDir);
  for (const [n, xml] of changed) zip.file(n, xml);
  writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return { count, backup };
}
