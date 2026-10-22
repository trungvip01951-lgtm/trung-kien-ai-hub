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
'@
}
# Lưu ý: biến PowerShell không phân biệt hoa thường ($p chính là $P), nên tham số hàm đặt tên $q.
function Find-Window($q) {
  $all = $A::RootElement.FindAll($T::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($w in $all) {
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
function Out($o) { $o | ConvertTo-Json -Depth 6 -Compress }
`;

const SCRIPTS = {
  list_windows: String.raw`
$all = $A::RootElement.FindAll($T::Children, [System.Windows.Automation.Condition]::TrueCondition)
$rows = foreach ($w in $all) { $c = $w.Current; if ($c.Name) {
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
try { $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue([string]$P.text); $how = 'ValuePattern' } catch {
  $e.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait('^a')
  $esc = ([string]$P.text) -replace '([+^%~(){}\[\]])', '{$1}'
  [System.Windows.Forms.SendKeys]::SendWait($esc); $how = 'gõ phím'
}
Out @{ ok = $true; element = $e.Current.Name; how = $how }`,
  read_text: String.raw`
$w = Find-Window $P; $e = Find-Element $w $P; $v = $null
try { $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
if ($null -eq $v) { try { $v = $e.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(100000) } catch {} }
if ($null -eq $v) { $v = $e.Current.Name }
Out @{ element = $e.Current.Name; text = $v }`,
  send_keys: String.raw`
if ($P.window -or $P.handle) { $w = Find-Window $P; Focus $w }
[System.Windows.Forms.SendKeys]::SendWait([string]$P.keys); Out @{ ok = $true }`,
  mouse_click: String.raw`
[void][TkUser32]::SetCursorPos([int]$P.x, [int]$P.y)
$down = 2; $up = 4; if ($P.button -eq 'right') { $down = 8; $up = 16 }
[TkUser32]::mouse_event($down, 0, 0, 0, 0); [TkUser32]::mouse_event($up, 0, 0, 0, 0)
if ($P.double) { [TkUser32]::mouse_event($down, 0, 0, 0, 0); [TkUser32]::mouse_event($up, 0, 0, 0, 0) }
Out @{ ok = $true }`,
  open_app: String.raw`
$args2 = @(); if ($P.args) { $args2 = @($P.args) }
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

export async function runWindows(action: WinAction, params: Record<string, unknown> = {}): Promise<unknown> {
  if (process.platform !== "win32") throw new Error("Điều khiển Windows chỉ chạy trên Windows.");
  const defaults = { maxNodes: 400, maxWidth: 1600 };
  const env = { ...process.env, TK_ARGS: JSON.stringify({ ...defaults, ...params }) };
  const script = `${PRELUDE}\n${SCRIPTS[action]}`;
  return new Promise((resolve, reject) => {
    // -EncodedCommand (UTF-16LE base64): chạy nguyên khối lệnh, không phụ thuộc cách PowerShell đọc từng dòng.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { env, windowsHide: true });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error(`Quá ${TIMEOUT_MS / 1000} giây chưa xong (${action}).`)); }, TIMEOUT_MS);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(cleanPsError(err) || `PowerShell thoát mã ${code}`)); return; }
      const line = out.trim().split(/\r?\n/).pop() ?? "";
      try { resolve(JSON.parse(line)); } catch { reject(new Error(`Kết quả không đọc được: ${line.slice(0, 200)}`)); }
    });
    p.stdin.end();
  });
}

function cleanPsError(s: string): string {
  const first = s.split(/\r?\n/).find((l) => l.trim() && !/^(At line|\+|At |CategoryInfo|FullyQualifiedErrorId)/.test(l.trim())) ?? "";
  return first.replace(/^.*?:\s*/, "").trim().slice(0, 300);
}
