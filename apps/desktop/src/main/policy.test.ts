import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { decide } from "./policy";

const dir = path.resolve("/tmp/du-an-mau");

test("chỉ đọc: cho đọc, chặn sửa và chạy lệnh", () => {
  assert.equal(decide("read", "Read", { file_path: `${dir}/a.txt` }, dir).decision, "allow");
  assert.equal(decide("read", "Edit", { file_path: `${dir}/a.txt` }, dir).decision, "deny");
  assert.equal(decide("read", "Bash", { command: "ls" }, dir).decision, "deny");
  assert.equal(decide("read", "mcp__x__y", {}, dir).decision, "deny");
});

test("được sửa: sửa trong dự án tự cho, ngoài dự án và lệnh phải hỏi", () => {
  assert.equal(decide("write", "Write", { file_path: `${dir}/sub/b.md` }, dir).decision, "allow");
  assert.equal(decide("write", "Edit", { file_path: "sub/b.md" }, dir).decision, "allow");
  assert.equal(decide("write", "Edit", { file_path: `${dir}/../khac/b.md` }, dir).decision, "ask");
  assert.equal(decide("write", "Write", { file_path: `${dir}-gia/b.md` }, dir).decision, "ask");
  assert.equal(decide("write", "Bash", { command: "rm -rf x" }, dir).decision, "ask");
  assert.equal(decide("write", "Edit", {}, dir).decision, "ask");
});
