# Minimal static file server for local development (no Node/Python needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8765]
param([int]$Port = 8765)
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8";
           ".json"="application/json"; ".png"="image/png"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".md"="text/plain" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($path -eq "/") { $path = "/index.html" }
  $file = Join-Path $root ($path -replace "/", "\")
  $res = $ctx.Response
  $res.Headers.Add("Cache-Control", "no-store")
  if ((Test-Path $file -PathType Leaf) -and ($file.StartsWith($root))) {
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
    $bytes = [IO.File]::ReadAllBytes($file)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.OutputStream.Close()
}
