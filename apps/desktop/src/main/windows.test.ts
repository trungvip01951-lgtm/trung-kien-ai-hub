import assert from "node:assert/strict";
import { test } from "node:test";
import { runWindows } from "./windows";

// Chạy thật trên Windows (máy CI windows-latest): mở Notepad, đọc cửa sổ, điền chữ, đọc lại, chụp màn hình, đóng.
const onWindows = process.platform === "win32";

test("điều khiển Windows bằng UI Automation (Notepad)", { skip: !onWindows && "chỉ chạy trên Windows" }, async () => {
  const opened = await runWindows("open_app", { target: "notepad.exe" }) as { pid: number };
  try {
    let win: { title: string; handle: number } | undefined;
    for (let i = 0; i < 10 && !win; i++) {
      const list = await runWindows("list_windows") as { title: string; handle: number; process: string }[];
      win = list.find((w) => /notepad/i.test(w.process));
      if (!win) await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(win, "không thấy cửa sổ Notepad");
    const tree = await runWindows("read_window", { handle: win.handle }) as { elements: string[] };
    console.log(tree.elements.slice(0, 15).join("\n"));
    const edit = tree.elements.find((l) => / (Edit|Document) /.test(l));
    assert.ok(edit, "không thấy ô soạn thảo");
    const index = Number(/^\[(\d+)\]/.exec(edit)![1]);
    const set = await runWindows("set_text", { handle: win.handle, index, text: "Khách Mẫu A 0000000001" }) as { how: string };
    console.log("set_text:", set.how);
    const read = await runWindows("read_text", { handle: win.handle, index }) as { text: string };
    assert.match(read.text, /Khách Mẫu A 0000000001/);
    const shot = await runWindows("screenshot", { maxWidth: 800 }) as { png: string; width: number };
    assert.ok(shot.width > 0 && shot.png.length > 1000);
  } finally {
    // Đóng Notepad không lưu.
    if (opened?.pid) { try { process.kill(opened.pid); } catch { /* đã đóng */ } }
    await runWindows("open_app", { target: "taskkill.exe", args: ["/IM", "notepad.exe", "/F"] }).catch(() => undefined);
  }
});
