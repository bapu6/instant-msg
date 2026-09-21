Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\bapup\.gemini\antigravity-ide\brain\1c6f3054-f10f-4330-9a3c-c786748e0bb9\app_icon_splash_theme_1790007027726.jpg"
$srcImg = [System.Drawing.Image]::FromFile($srcPath)

function Resize-And-Save($source, $targetPath, $width, $height) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $width, $height)
    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Saved: $targetPath ($width x $height)"
}

function Create-Solid-Background($targetPath, $width, $height, $colorHex) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($colorHex))
    $graphics.FillRectangle($brush, 0, 0, $width, $height)
    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose()
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Saved solid background: $targetPath ($width x $height)"
}

# 1. Update Expo Assets
Resize-And-Save $srcImg "client\assets\icon.png" 1024 1024
Resize-And-Save $srcImg "client\assets\splash-icon.png" 1024 1024
Resize-And-Save $srcImg "client\assets\android-icon-foreground.png" 432 432
Create-Solid-Background "client\assets\android-icon-background.png" 432 432 "#0B101E"

# 2. Update Android Mipmap Folders
$densities = @(
    @{ Name = "mipmap-mdpi"; Size = 48; FgSize = 108 },
    @{ Name = "mipmap-hdpi"; Size = 72; FgSize = 162 },
    @{ Name = "mipmap-xhdpi"; Size = 96; FgSize = 216 },
    @{ Name = "mipmap-xxhdpi"; Size = 144; FgSize = 324 },
    @{ Name = "mipmap-xxxhdpi"; Size = 192; FgSize = 432 }
)

$resDir = "client\android\app\src\main\res"

foreach ($d in $densities) {
    $folder = Join-Path $resDir $d.Name
    if (Test-Path $folder) {
        # Remove old webp files to prevent resource conflicts
        Get-ChildItem -Path $folder -Filter "*.webp" | Remove-Item -Force

        # Generate new PNG icons
        Resize-And-Save $srcImg (Join-Path $folder "ic_launcher.png") $d.Size $d.Size
        Resize-And-Save $srcImg (Join-Path $folder "ic_launcher_round.png") $d.Size $d.Size
        Resize-And-Save $srcImg (Join-Path $folder "ic_launcher_foreground.png") $d.FgSize $d.FgSize
        Resize-And-Save $srcImg (Join-Path $folder "ic_launcher_monochrome.png") $d.FgSize $d.FgSize
        Create-Solid-Background (Join-Path $folder "ic_launcher_background.png") $d.FgSize $d.FgSize "#0B101E"
    }
}

$srcImg.Dispose()
Write-Host "All icons generated successfully!"
