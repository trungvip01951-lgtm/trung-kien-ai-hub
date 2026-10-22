import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Connections } from "./connections";

// Máy chủ MCP + máy chủ cấp quyền OAuth giả trên máy (đăng ký client tự động, PKCE, mã làm mới).
async function fakeOAuth() {
  const log: string[] = [];
  let issued = 0;
  const srv = createServer((req, res) => {
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const u = new URL(req.url ?? "/", base);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (o: unknown, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      log.push(`${req.method} ${u.pathname}`);
      if (u.pathname.startsWith("/.well-known/oauth-protected-resource")) return json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ["doc"] });
      if (u.pathname.startsWith("/.well-known/oauth-authorization-server")) return json({ issuer: base, authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"] });
      if (u.pathname === "/register") return json({ ...JSON.parse(body), client_id: "client-mau" }, 201);
      if (u.pathname === "/authorize") {
        assert.equal(u.searchParams.get("code_challenge_method"), "S256");
        res.writeHead(302, { location: `${u.searchParams.get("redirect_uri")}?code=ma-mau&state=${u.searchParams.get("state")}` });
        return res.end();
      }
      if (u.pathname === "/token") {
        const p = new URLSearchParams(body);
        log.push(`grant=${p.get("grant_type")}`);
        if (p.get("grant_type") === "authorization_code") assert.ok(p.get("code_verifier"));
        return json({ access_token: `ma-truy-cap-${++issued}`, refresh_token: "ma-lam-moi", expires_in: p.get("grant_type") === "refresh_token" ? 3600 : 60, token_type: "Bearer" });
      }
      json({ error: "khong-co" }, 404);
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, log, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/mcp` };
}

const cipher = { encrypt: (s: string) => Buffer.from(s.split("").reverse().join("")), decrypt: (b: Buffer) => b.toString().split("").reverse().join("") };

test("đăng nhập OAuth: đăng ký client, mở trang đồng ý, nhận mã, làm mới mã khi sắp hết hạn", async (t0) => {
  const f = await fakeOAuth();
  t0.after(() => f.srv.close());
  const dir = mkdtempSync(path.join(os.tmpdir(), "ket-noi-"));
  // "Trình duyệt" giả: mở trang cấp quyền, đi theo chuyển hướng về localhost:8765/callback.
  const opened: string[] = [];
  const c = new Connections(path.join(dir, "c.json"), path.join(dir, "c.bin"), cipher, async (url) => { opened.push(url); await fetch(url); }, fetch, { port: 0 });
  const r = c.add("custom", "Dịch vụ mẫu", f.url);
  assert.ok(r.ok, r.message);
  assert.equal(c.info()[0].status, "needs-login");
  const login = await c.login(r.id!);
  assert.ok(login.ok, login.message);
  assert.equal(opened.length, 1);
  const info = c.info()[0];
  assert.equal(info.status, "connected");
  assert.equal(info.toolPrefix, "mcp__dich-vu-mau__");
  // Mã lưu mã hoá, không ở dạng chữ thường trong tệp.
  assert.ok(!readFileSync(path.join(dir, "c.bin"), "utf8").includes("ma-truy-cap"));
  assert.ok(!readFileSync(path.join(dir, "c.json"), "utf8").includes("ma-truy-cap"));

  // Mã còn 60 giây (< 5 phút): forTask làm mới trước khi đưa cho agent.
  const t = await c.forTask();
  assert.deepEqual(t.notes, []);
  assert.equal((t.servers["dich-vu-mau"] as { headers: Record<string, string> }).headers.Authorization, "Bearer ma-truy-cap-2");
  assert.ok(f.log.includes("grant=refresh_token"));
  // Hai việc bắt đầu cùng lúc khi mã sắp hết hạn: chỉ làm mới một lần.
  const sec = JSON.parse(cipher.decrypt(readFileSync(path.join(dir, "c.bin"))));
  sec["dich-vu-mau"].tokens.savedAt = Date.now() - 3590 * 1000;
  writeFileSync(path.join(dir, "c.bin"), cipher.encrypt(JSON.stringify(sec)));
  const cc = new Connections(path.join(dir, "c.json"), path.join(dir, "c.bin"), cipher, () => {}, fetch, { port: 0 });
  const before = f.log.filter((x) => x === "grant=refresh_token").length;
  const [a, b] = await Promise.all([cc.forTask(), cc.forTask()]);
  assert.equal(f.log.filter((x) => x === "grant=refresh_token").length, before + 1);
  assert.deepEqual([a.notes, b.notes], [[], []]);
  // Còn hạn dài: không gọi mạng nữa.
  const n = f.log.length;
  await cc.forTask();
  assert.equal(f.log.length, n);

  // Mở lại app (đọc từ tệp): vẫn còn kết nối.
  const c2 = new Connections(path.join(dir, "c.json"), path.join(dir, "c.bin"), cipher, () => {}, fetch, { port: 0 });
  assert.equal(c2.info()[0].status, "connected");
  c2.logout(r.id!);
  assert.equal(c2.info()[0].status, "needs-login");
  assert.match((await c2.forTask()).notes[0], /chưa đăng nhập/);
  f.srv.close();
});

test("quyền công cụ kết nối: đọc tự cho, ghi phải hỏi, Chỉ đọc chặn ghi, Đủ quyền cho hết", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ket-noi-"));
  const c = new Connections(path.join(dir, "c.json"), path.join(dir, "c.bin"), cipher, () => {});
  c.add("sheets");
  c.add("windsor");
  assert.equal(c.owns("mcp__sheets__get_values"), true);
  assert.equal(c.owns("mcp__chrome__browser_click"), false);
  assert.equal(c.decide("mcp__sheets__get_values", "read").decision, "allow");
  assert.equal(c.decide("mcp__sheets__update_values", "write").decision, "ask");
  assert.equal(c.decide("mcp__windsor__execute_action", "read").decision, "deny");
  assert.equal(c.decide("mcp__windsor__get_data", "write").decision, "allow");
  assert.equal(c.decide("mcp__windsor__execute_action", "full").decision, "allow");
  const g = c.info().find((x) => x.kind === "sheets")!;
  assert.equal(g.needsClientId, true);
  assert.equal(c.setClient(g.id, "sai-dinh-dang", "").ok, false);
  assert.ok(c.setClient(g.id, "123-abc.apps.googleusercontent.com", "bi-mat-mau").ok);
  // Thêm Gmail sau: dùng chung OAuth client đã nhập.
  c.add("gmail");
  c.setClient(g.id, "123-abc.apps.googleusercontent.com", "bi-mat-mau");
  assert.equal(c.info().find((x) => x.kind === "gmail")!.hasClientId, true);
  assert.equal(c.add("custom", "x", "http://vi-du.vn/mcp").ok, false);   // phải https
});
