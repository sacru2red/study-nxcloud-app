const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ffmpegPath = require('ffmpeg-static')

if (!ffmpegPath) {
  throw new Error('ffmpeg-static binary path not found')
}

const workspaceRoot = process.cwd()
const testResultsPath = path.join(workspaceRoot, 'test-results')
const screenshotDirPattern = /^demo-capture-Screenshot-(\d+).*-demo-capture$/
const videoFiles = fs
  .readdirSync(testResultsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const match = entry.name.match(screenshotDirPattern)
    if (!match) {
      return null
    }
    const order = Number.parseInt(match[1], 10)
    const videoPath = path.join(testResultsPath, entry.name, 'video.webm')
    if (!fs.existsSync(videoPath)) {
      return null
    }
    return { order, videoPath }
  })
  .filter((item) => item !== null)
  .sort((left, right) => left.order - right.order)
  .map((item) => item.videoPath)

if (videoFiles.length === 0) {
  throw new Error('No matching demo capture videos found in test-results')
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concat-demo-videos-'))
const concatListPath = path.join(tempDir, 'concat-list.txt')
const outputPath = path.join(workspaceRoot, 'docs', 'demo-capture.webm')
const concatList = videoFiles.map((file) => `file '${file.replaceAll('\\', '/')}'`).join('\n')

fs.writeFileSync(concatListPath, concatList + '\n', 'utf8')

try {
  const result = spawnSync(
    ffmpegPath,
    ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', outputPath],
    { stdio: 'inherit', cwd: workspaceRoot },
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log(`Merged video created: ${outputPath}`)
