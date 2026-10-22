import { inflateRawSync } from "node:zlib";

// Đọc tệp .zip (Skill tải lên) mà không cần thư viện ngoài. Chỉ đọc vào bộ nhớ, không ghi gì;
// chặn đường dẫn thoát ra ngoài (../, ổ đĩa, đường dẫn tuyệt đối), liên kết tượng trưng (symlink),
// tệp mã hoá và tệp bung quá lớn (zip bomb).

export interface ZipEntry { path: string; data: Buffer }
export interface ZipLimits { maxEntries: number; maxTotalBytes: number; maxFileBytes: number }
export const ZIP_LIMITS: ZipLimits = { maxEntries: 2000, maxTotalBytes: 50 * 1024 * 1024, maxFileBytes: 20 * 1024 * 1024 };

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

// Chuẩn hoá đường dẫn trong zip; trả null nếu không an toàn.
export function safeZipPath(name: string): string | null {
  const p = name.replace(/\\/g, "/");
  if (!p || p.startsWith("/") || /^[a-zA-Z]:/.test(p) || p.includes("\0")) return null;
  const parts = p.split("/").filter((x) => x !== "" && x !== ".");
  if (parts.some((x) => x === "..")) return null;
  // Tên Windows không ghi được: ký tự cấm, luồng dữ liệu phụ (a:b), tên thiết bị (CON, AUX...), đuôi dấu chấm/cách.
  if (parts.some((x) => /[<>:"|?*\x00-\x1f]/.test(x) || /[. ]$/.test(x) || /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(x))) return null;
  return parts.join("/");
}

export function readZip(buf: Buffer, limits: ZipLimits = ZIP_LIMITS): ZipEntry[] {
  // Tìm bản ghi kết thúc thư mục trung tâm (EOCD) ở cuối tệp (có thể kèm chú thích tối đa 64 KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Tệp không phải .zip hợp lệ.");
  const count = buf.readUInt16LE(eocd + 10);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cenOffset === 0xffffffff) throw new Error("Tệp .zip quá lớn (ZIP64), chưa hỗ trợ.");
  if (count > limits.maxEntries) throw new Error(`Tệp .zip có ${count} mục, vượt giới hạn ${limits.maxEntries}.`);

  const out: ZipEntry[] = [];
  let total = 0;
  let p = cenOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new Error("Tệp .zip bị hỏng (thư mục trung tâm).");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const madeBy = buf.readUInt16LE(p + 4) >> 8;
    const extAttr = buf.readUInt32LE(p + 38);
    const locOffset = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    const name = flags & 0x800 ? rawName.toString("utf8") : rawName.toString("latin1");
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || name.endsWith("\\")) continue; // thư mục
    if (flags & 0x1) throw new Error(`Tệp ${name} trong .zip bị mã hoá, không nhập được.`);
    // Hệ Unix (madeBy 3): kiểu tệp nằm ở 16 bit cao của thuộc tính ngoài; 0o120000 là symlink.
    if (madeBy === 3 && ((extAttr >>> 16) & 0o170000) === 0o120000) throw new Error(`Tệp ${name} là liên kết tượng trưng (symlink), không nhập.`);
    const safe = safeZipPath(name);
    if (!safe) throw new Error(`Đường dẫn không an toàn trong .zip: ${name}`);
    if (usize > limits.maxFileBytes) throw new Error(`Tệp ${safe} quá lớn (${usize} byte).`);
    total += usize;
    if (total > limits.maxTotalBytes) throw new Error(`Tổng dung lượng bung ra vượt ${limits.maxTotalBytes} byte.`);

    if (locOffset + 30 > buf.length || buf.readUInt32LE(locOffset) !== LOC_SIG) throw new Error(`Tệp .zip bị hỏng ở ${safe}.`);
    const start = locOffset + 30 + buf.readUInt16LE(locOffset + 26) + buf.readUInt16LE(locOffset + 28);
    const comp = buf.subarray(start, start + csize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = inflateRawSync(comp, { maxOutputLength: limits.maxFileBytes + 1 });
    else throw new Error(`Tệp ${safe} nén theo kiểu ${method}, chưa hỗ trợ.`);
    if (data.length !== usize) throw new Error(`Tệp ${safe} bung ra sai kích thước.`);
    out.push({ path: safe, data });
  }
  return out;
}
