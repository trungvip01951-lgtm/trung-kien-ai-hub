import { BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";

// Xuất PDF từ HTML bằng cửa sổ ẩn của Electron (không chạy JavaScript trong HTML, không mở mạng ngoài trang).
export async function makePdf(html: string, file: string) {
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, nodeIntegration: false, contextIsolation: true, partition: "tkhub-pdf" } });
  try {
    w.webContents.session.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(data|about):/.test(d.url) }));
    await w.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`);
    const pdf = await w.webContents.printToPDF({ pageSize: "A4", printBackground: true });
    writeFileSync(file, pdf);
  } finally {
    w.destroy();
  }
}
