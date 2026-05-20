const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ffmpegPath = require('ffmpeg-static')

if (!ffmpegPath) {
  throw new Error('ffmpeg-static binary path not found')
}

const workspaceRoot = process.cwd()
const docsDir = path.join(workspaceRoot, 'docs')
const webmOutputPath = path.join(docsDir, 'demo-capture.webm')
const mp4OutputPath = path.join(docsDir, 'demo-capture.mp4')
const testResultsPath = path.join(workspaceRoot, 'test-results')
const demoCaptureDirPattern = /^demo-capture-Screenshot-(.+)-demo-capture$/

/**
 * Playwright folder examples:
 * - demo-capture-Screenshot-01---Login-demo-capture
 * - demo-capture-Screenshot-05---1---Chat-Question-demo-capture
 * - demo-capture-Screenshot-05---2---Chat-Question-demo-capture
 */
function parseScreenshotSortKey(folderSuffix) {
  const segments = folderSuffix.split('---').map((part) => Number.parseInt(part, 10))
  const numbers = segments.filter((value) => !Number.isNaN(value))
  if (numbers.length === 0) {
    return [Number.MAX_SAFE_INTEGER]
  }
  return numbers
}

function compareSortKeys(left, right) {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue !== rightValue) {
      return leftValue - rightValue
    }
  }
  return 0
}

function resolveVideoPath(resultDir) {
  const primary = path.join(resultDir, 'video.webm')
  if (fs.existsSync(primary)) {
    return primary
  }

  const numbered = fs
    .readdirSync(resultDir)
    .filter((name) => /^video-\d+\.webm$/.test(name))
    .sort((left, right) => {
      const leftIndex = Number.parseInt(left.match(/\d+/)?.[0] ?? '0', 10)
      const rightIndex = Number.parseInt(right.match(/\d+/)?.[0] ?? '0', 10)
      return leftIndex - rightIndex
    })
    .map((name) => path.join(resultDir, name))

  if (numbered.length > 0) {
    return numbered[0]
  }

  return null
}

function discoverDemoCaptureVideos() {
  if (!fs.existsSync(testResultsPath)) {
    return []
  }

  return fs
    .readdirSync(testResultsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = entry.name.match(demoCaptureDirPattern)
      if (!match) {
        return null
      }
      const resultDir = path.join(testResultsPath, entry.name)
      const videoPath = resolveVideoPath(resultDir)
      if (!videoPath) {
        return null
      }
      return {
        sortKey: parseScreenshotSortKey(match[1]),
        label: match[1].replaceAll('---', ' '),
        videoPath,
      }
    })
    .filter((item) => item !== null)
    .sort((left, right) => compareSortKeys(left.sortKey, right.sortKey))
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { stdio: 'inherit', cwd: workspaceRoot })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function mergeWebm(videoPaths) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concat-demo-videos-'))
  const concatListPath = path.join(tempDir, 'concat-list.txt')
  const concatList = videoPaths.map((file) => `file '${file.replaceAll('\\', '/')}'`).join('\n')

  fs.writeFileSync(concatListPath, concatList + '\n', 'utf8')

  try {
    runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', webmOutputPath])
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log(`Merged WebM created: ${webmOutputPath}`)
}

function transcodeToMp4(inputPath) {
  runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    mp4OutputPath,
  ])
  console.log(`MP4 created: ${mp4OutputPath}`)
}

function printUsage() {
  console.log(`Usage:
  node tools/concat-demo-videos.js           Merge test-results videos → docs/demo-capture.webm + .mp4
  node tools/concat-demo-videos.js --mp4-only  Transcode existing docs/demo-capture.webm → .mp4`)
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage()
    return
  }

  if (process.argv.includes('--mp4-only')) {
    if (!fs.existsSync(webmOutputPath)) {
      throw new Error(`WebM not found: ${webmOutputPath}`)
    }
    transcodeToMp4(webmOutputPath)
    return
  }

  const clips = discoverDemoCaptureVideos()
  if (clips.length === 0) {
    throw new Error(
      `No demo-capture videos found under ${testResultsPath}. Run: npx nx run frontend-e2e:capture-demo`,
    )
  }

  console.log('Clips (in merge order):')
  for (const clip of clips) {
    console.log(`  - ${clip.label}: ${path.relative(workspaceRoot, clip.videoPath)}`)
  }

  mergeWebm(clips.map((clip) => clip.videoPath))
  transcodeToMp4(webmOutputPath)
}

main()
