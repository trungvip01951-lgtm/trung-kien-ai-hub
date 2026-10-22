import { app, BrowserWindow } from "electron";
import path from "node:path";
import { runSmokeTest } from "./smoke";

const smoke = process.argv.includes("--smoke-test");
const outArg = process.argv.find((a) => a.startsWith("--smoke-out="));

app.whenReady().then(async () => {
  if (smoke) {
    const pass = await runSmokeTest(outArg?.slice("--smoke-out=".length));
    app.exit(pass ? 0 : 1);
    return;
  }
  const win = new BrowserWindow({ width: 1100, height: 720, title: "Trung Kiên AI Hub" });
  win.loadFile(path.join(__dirname, "index.html"));
});

app.on("window-all-closed", () => app.quit());
