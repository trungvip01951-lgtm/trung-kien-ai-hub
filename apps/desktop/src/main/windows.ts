import { spawn } from "node:child_process";

// Điều khiển Windows (Mốc 4) bằng UI Automation của Windows qua PowerShell có sẵn trên mọi máy Windows 10/11:
// đọc cửa sổ theo cây phần tử (ưu tiên hơn bấm theo toạ độ), bấm/nhập qua mẫu điều khiển (Invoke, Value, Toggle...),
// phím tắt, chuột, mở chương trình, chụp màn hình. Tham số đưa vào bằng biến môi trường dạng JSON
// (không ghép chuỗi vào lệnh), mỗi lệnh có thời hạn.

const TIMEOUT_MS = 30_000;

const PRELUDE = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing
$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]
$P = ConvertFrom-Json ([Environment]::GetEnvironmentVariable('TK_ARGS'))
if (-not ('TkUser32' -as [type])) {
  Add-Type -Namespace '' -Name TkUser32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern System.IntPtr WindowFromPoint(System.Drawing.Point p);
[DllImport("user32.dll")] public static extern System.IntPtr GetAncestor(System.IntPtr h, int flags);
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr SendMessage(System.IntPtr h, int msg, System.IntPtr w, string l);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr SendMessage(System.IntPtr h, int msg, System.IntPtr w, System.Text.StringBuilder l);
[DllImport("user32.dll")] public static extern System.IntPtr SendMessage(System.IntPtr h, int msg, System.IntPtr w, System.IntPtr l);
'@ -ReferencedAssemblies System.Drawing
}
# Cửa sổ của chính Trung Kiên AI Hub: agent không được đọc/bấm vào (tránh tự bấm "Cho phép" trong hộp hỏi quyền).
function Is-Self([int]$procId) { return @($P.selfPids) -contains $procId }
function Assert-NotSelf([System.IntPtr]$h) {
  $procId = 0; [void][TkUser32]::GetWindowThreadProcessId($h, [ref]$procId)
  if (Is-Self $procId) { throw 'Không được điều khiển cửa sổ của chính Trung Kiên AI Hub.' }
}
# Lưu ý: biến PowerShell không phân biệt hoa thường ($p chính là $P), nên tham số hàm đặt tên $q.
function Find-Window($q) {
  $all = $A::RootElement.FindAll($T::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($w in $all) {
    if (Is-Self $w.Current.ProcessId) { continue }
    if ($q.handle -and $w.Current.NativeWindowHandle -eq [int]$q.handle) { return $w }
    if ($q.window -and $w.Current.Name -like ('*' + $q.window + '*')) { return $w }
  }
  throw ('Không thấy cửa sổ: ' + $(if ($q.window) { $q.window } else { $q.handle }))
}
function Find-Element($win, $q) {
  if ($null -ne $q.index) {
    $list = $win.FindAll($T::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    if ([int]$q.index -ge $list.Count) { throw 'Số thứ tự phần tử vượt quá; đọc lại cửa sổ.' }
    return $list[[int]$q.index]
  }
  $all = $win.FindAll($T::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) {
    $c = $e.Current
    if ($q.automationId -and $c.AutomationId -eq $q.automationId) { return $e }
    if ($q.name -and $c.Name -eq $q.name -and (-not $q.controlType -or $c.ControlType.ProgrammaticName -like ('*' + $q.controlType))) { return $e }
  }
  if ($q.name) { foreach ($e in $all) { if ($e.Current.Name -like ('*' + $q.name + '*')) { return $e } } }
  throw 'Không thấy phần tử; đọc lại cửa sổ (read_window) để lấy tên hoặc số thứ tự.'
}
function Focus($w) {
  $h = [System.IntPtr]$w.Current.NativeWindowHandle
  [void][TkUser32]::ShowWindow($h, 9); [void][TkUser32]::SetForegroundWindow($h); Start-Sleep -Milliseconds 200
}
function Out($o) { ConvertTo-Json -InputObject $o -Depth 6 -Compress }
`;

const SCRIPTS = {
  list_windows: String.raw`
$all = $A::RootElement.FindAll($T::Children, [System.Windows.Automation.Condition]::TrueCondition)
$rows = foreach ($w in $all) { $c = $w.Current; if ($c.Name -and -not (Is-Self $c.ProcessId)) {
  $pn = ''; try { $pn = (Get-Process -Id $c.ProcessId).ProcessName } catch {}
  [pscustomobject]@{ title = $c.Name; handle = $c.NativeWindowHandle; process = $pn; pid = $c.ProcessId } } }
Out @($rows)`,
  read_window: String.raw`
$w = Find-Window $P
$list = $w.FindAll($T::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$max = [Math]::Min($list.Count, [int]$P.maxNodes)
$lines = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $max; $i++) {
  $c = $list[$i].Current
  if ($c.IsOffscreen -and -not $c.Name) { continue }
  $v = ''
  try { $vp = $list[$i].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $v = $vp.Current.Value } catch {}
  if ($v.Length -gt 200) { $v = $v.Substring(0, 200) + '…' }
  $t = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
  $s = '[' + $i + '] ' + $t + ' "' + $c.Name + '"'
  if ($c.AutomationId) { $s += ' id=' + $c.AutomationId }
  if ($v) { $s += ' value="' + $v + '"' }
  if (-not $c.IsEnabled) { $s += ' (mờ)' }
  $lines.Add($s)
}
Out @{ title = $w.Current.Name; handle = $w.Current.NativeWindowHandle; total = $list.Count; shown = $max; elements = $lines }`,
  focus_window: String.raw`
$w = Find-Window $P; Focus $w; Out @{ ok = $true; title = $w.Current.Name }`,
  click_element: String.raw`
$w = Find-Window $P; Focus $w; $e = Find-Element $w $P; $how = ''
foreach ($pat in @([System.Windows.Automation.InvokePattern], [System.Windows.Automation.TogglePattern], [System.Windows.Automation.SelectionItemPattern], [System.Windows.Automation.ExpandCollapsePattern])) {
  try { $o = $e.GetCurrentPattern($pat::Pattern) } catch { continue }
  if ($pat -eq [System.Windows.Automation.InvokePattern]) { $o.Invoke() }
  elseif ($pat -eq [System.Windows.Automation.TogglePattern]) { $o.Toggle() }
  elseif ($pat -eq [System.Windows.Automation.SelectionItemPattern]) { $o.Select() }
  else { $o.Expand() }
  $how = $pat.Name; break
}
if (-not $how) {
  $r = $e.Current.BoundingRectangle
  [void][TkUser32]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
  [TkUser32]::mouse_event(2, 0, 0, 0, 0); [TkUser32]::mouse_event(4, 0, 0, 0, 0); $how = 'chuột'
}
Out @{ ok = $true; element = $e.Current.Name; how = $how }`,
  set_text: String.raw`
$w = Find-Window $P; Focus $w; $e = Find-Element $w $P; $how = ''
$h = [System.IntPtr]$e.Current.NativeWindowHandle
try { $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue([string]$P.text); $how = 'ValuePattern' } catch {
  if ($h -ne [System.IntPtr]::Zero) {
    # Ô điều khiển Windows cổ điển: gửi WM_SETTEXT thẳng, không cần bàn phím hay tiêu điểm.
    Assert-NotSelf $h
    [void][TkUser32]::SendMessage($h, 0x000C, [System.IntPtr]::Zero, [string]$P.text); $how = 'WM_SETTEXT'
  } else {
    $e.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait('^a')
    $esc = ([string]$P.text) -replace '([+^%~(){}\[\]])', '{$1}'
    [System.Windows.Forms.SendKeys]::SendWait($esc); $how = 'gõ phím'
  }
}
Out @{ ok = $true; element = $e.Current.Name; how = $how }`,
  read_text: String.raw`
$w = Find-Window $P; $e = Find-Element $w $P; $v = $null
try { $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
if ($null -eq $v) { try { $v = $e.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(100000) } catch {} }
if ($null -eq $v -and $e.Current.NativeWindowHandle) {
  $h = [System.IntPtr]$e.Current.NativeWindowHandle
  $n = [int][TkUser32]::SendMessage($h, 0x000E, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
  if ($n -gt 0) { $sb = New-Object System.Text.StringBuilder ([Math]::Min($n, 100000) + 1); [void][TkUser32]::SendMessage($h, 0x000D, [System.IntPtr]($sb.Capacity), $sb); $v = $sb.ToString() }
}
if ($null -eq $v) { $v = $e.Current.Name }
Out @{ element = $e.Current.Name; text = $v }`,
  send_keys: String.raw`
if ($P.window -or $P.handle) { $w = Find-Window $P; Focus $w }
Assert-NotSelf ([TkUser32]::GetForegroundWindow())
[System.Windows.Forms.SendKeys]::SendWait([string]$P.keys); Out @{ ok = $true }`,
  mouse_click: String.raw`
Assert-NotSelf ([TkUser32]::GetAncestor([TkUser32]::WindowFromPoint((New-Object System.Drawing.Point ([int]$P.x), ([int]$P.y))), 2))
[void][TkUser32]::SetCursorPos([int]$P.x, [int]$P.y)
$down = 2; $up = 4; if ($P.button -eq 'right') { $down = 8; $up = 16 }
[TkUser32]::mouse_event($down, 0, 0, 0, 0); [TkUser32]::mouse_event($up, 0, 0, 0, 0)
if ($P.double) { [TkUser32]::mouse_event($down, 0, 0, 0, 0); [TkUser32]::mouse_event($up, 0, 0, 0, 0) }
Out @{ ok = $true }`,
  open_app: String.raw`
# PowerShell 5.1 nối tham số không có nháy: tự bọc nháy tham số có dấu cách để chạy đúng như hộp hỏi hiển thị.
$args2 = @(); if ($P.args) { $args2 = @($P.args | ForEach-Object { if ("$_" -match '\s') { '"' + ("$_" -replace '"', '\"') + '"' } else { "$_" } }) }
if ($args2.Count) { $proc = Start-Process -FilePath ([string]$P.target) -ArgumentList $args2 -PassThru } else { $proc = Start-Process -FilePath ([string]$P.target) -PassThru }
Start-Sleep -Milliseconds 1500
Out @{ ok = $true; pid = $(if ($proc) { $proc.Id } else { $null }) }`,
  screenshot: String.raw`
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$max = [int]$P.maxWidth; $out = $bmp
if ($b.Width -gt $max) {
  $h = [int]($b.Height * $max / $b.Width); $out = New-Object System.Drawing.Bitmap $max, $h
  $g2 = [System.Drawing.Graphics]::FromImage($out); $g2.InterpolationMode = 'HighQualityBicubic'; $g2.DrawImage($bmp, 0, 0, $max, $h)
}
$ms = New-Object System.IO.MemoryStream; $out.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
Out @{ width = $out.Width; height = $out.Height; scale = $out.Width / $b.Width; originX = $b.X; originY = $b.Y; png = [Convert]::ToBase64String($ms.ToArray()) }`,
} as const;

export type WinAction = keyof typeof SCRIPTS;
export const WIN_READ_ACTIONS = new Set<WinAction>(["list_windows", "read_window", "read_text", "screenshot"]);

// Tiến trình con của app (cửa sổ giao diện) cũng tính là "của app"; nơi gọi đăng ký nếu có.
let selfPids: (() => number[]) | null = null;
export function setSelfPids(fn: () => number[]) { selfPids = fn; }

export async function runWindows(action: WinAction, params: Record<string, unknown> = {}): Promise<unknown> {
  if (process.platform !== "win32") throw new Error("Điều khiển Windows chỉ chạy trên Windows.");
  const defaults = { maxNodes: 400, maxWidth: 1600 };
  const tkArgs = JSON.stringify({ ...defaults, ...params, selfPids: [process.pid, ...(selfPids?.() ?? [])] });
  if (tkArgs.length > 30_000) throw new Error("Nội dung quá dài cho một lần (tối đa khoảng 30.000 ký tự); chia nhỏ ra.");
  const env = { ...process.env, TK_ARGS: tkArgs };
  // Bọc lỗi thành JSON trên stdout: lỗi ghi ra stderr của PowerShell khi bị chuyển hướng là dạng CLIXML khó đọc.
  const script = `${PRELUDE}\ntry {\n${SCRIPTS[action]}\n} catch { ConvertTo-Json -InputObject @{ tkError = $_.Exception.Message } -Compress; exit 0 }`;
  return new Promise((resolve, reject) => {
    // -EncodedCommand (UTF-16LE base64): chạy nguyên khối lệnh, không phụ thuộc cách PowerShell đọc từng dòng.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { env, windowsHide: true });
    const out: Buffer[] = [], err: Buffer[] = [];
    const timer = setTimeout(() => { p.kill(); reject(new Error(`Quá ${TIMEOUT_MS / 1000} giây chưa xong (${action}).`)); }, TIMEOUT_MS);
    // Gom byte rồi mới giải mã UTF-8, để chữ có dấu không vỡ ở ranh giới các khúc dữ liệu.
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => err.push(d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(cleanPsError(Buffer.concat(err).toString("utf8")) || `PowerShell thoát mã ${code}`)); return; }
      const line = Buffer.concat(out).toString("utf8").trim().split(/\r?\n/).pop() ?? "";
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { reject(new Error(`Kết quả không đọc được: ${line.slice(0, 200)}`)); return; }
      const e = (parsed as { tkError?: unknown } | null)?.tkError;
      if (typeof e === "string") reject(new Error(e)); else resolve(parsed);
    });
    p.stdin.end();
  });
}

function cleanPsError(s: string): string {
  const first = s.split(/\r?\n/).find((l) => l.trim() && !/^(At line|\+|At |CategoryInfo|FullyQualifiedErrorId)/.test(l.trim())) ?? "";
  return first.replace(/^.*?:\s*/, "").trim().slice(0, 300);
}
