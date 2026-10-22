// Chép tệp tĩnh (HTML) từ src sang dist sau khi tsc biên dịch.
import { copyFileSync } from "node:fs";
copyFileSync("src/index.html", "dist/index.html");
