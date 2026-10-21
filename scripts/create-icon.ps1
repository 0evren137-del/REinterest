$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
    $bitmap = New-Object Drawing.Bitmap($size, $size)
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.ScaleTransform(($size / 256.0), ($size / 256.0))
    $shape = New-Object Drawing.Drawing2D.GraphicsPath
    $shape.AddArc(8, 8, 116, 116, 180, 90)
    $shape.AddArc(132, 8, 116, 116, 270, 90)
    $shape.AddArc(132, 132, 116, 116, 0, 90)
    $shape.AddArc(8, 132, 116, 116, 90, 90)
    $shape.CloseFigure()
    $brush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#173f35'))
    $g.FillPath($brush, $shape)
    $ring = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#f4f1df'), 21)
    $arrow = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#d7edaa'), 19)
    foreach ($pen in @($ring, $arrow)) {
        $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
        $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    }
    $g.DrawArc($ring, 60, 76, 120, 120, 0, 270)
    $g.DrawLine($arrow, 122, 134, 186, 70)
    $g.DrawLines($arrow, [Drawing.PointF[]]@([Drawing.PointF]::new(150,70), [Drawing.PointF]::new(186,70), [Drawing.PointF]::new(186,106)))
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images += ,$stream.ToArray()
    if ($size -eq 256) { $bitmap.Save((Join-Path $root 'web/icon-preview.png'), [Drawing.Imaging.ImageFormat]::Png) }
    $stream.Dispose(); $g.Dispose(); $bitmap.Dispose(); $shape.Dispose(); $brush.Dispose(); $ring.Dispose(); $arrow.Dispose()
}
$output = [IO.File]::Create((Join-Path $root 'web/icon.ico'))
$writer = New-Object IO.BinaryWriter($output)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dimension = $sizes[$i] % 256
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
} finally { $writer.Dispose(); $output.Dispose() }
