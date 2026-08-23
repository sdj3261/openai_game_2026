param(
  [string]$Narration = "$PSScriptRoot\narration.json",
  [string]$OutputDir = "$PSScriptRoot\.work\tts",
  [string]$Only = "",
  [int]$Rate = 0
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$scenes = Get-Content -Raw -LiteralPath $Narration | ConvertFrom-Json
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $speaker.GetInstalledVoices() |
  ForEach-Object { $_.VoiceInfo } |
  Where-Object { $_.Culture.Name -eq "ko-KR" } |
  Select-Object -First 1

if (-not $voice) {
  throw "한국어 Windows TTS 음성을 찾지 못했습니다."
}

$speaker.SelectVoice($voice.Name)
$speaker.Rate = $Rate
$speaker.Volume = 100
$selected = @{}
if ($Only) {
  $Only.Split(",") | ForEach-Object { $selected[$_.Trim()] = $true }
}

for ($sceneIndex = 0; $sceneIndex -lt $scenes.Count; $sceneIndex++) {
  $scene = $scenes[$sceneIndex]
  for ($captionIndex = 0; $captionIndex -lt $scene.captions.Count; $captionIndex++) {
    $stem = "{0:d2}-{1:d2}" -f $sceneIndex, $captionIndex
    if ($selected.Count -gt 0 -and -not $selected.ContainsKey($stem)) { continue }
    $path = Join-Path $OutputDir ("{0:d2}-{1:d2}.wav" -f $sceneIndex, $captionIndex)
    $speaker.SetOutputToWaveFile($path)
    $speaker.Speak([string]$scene.captions[$captionIndex])
    $speaker.SetOutputToNull()
  }
}

$speaker.Dispose()
Write-Host "TTS 완료: $($scenes.Count)개 장면 / $voice"
