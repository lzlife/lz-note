const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

function getSystemBrowserExecutablePath() {
  const candidates = []
  const isWindows = process.platform === 'win32'

  if (isWindows) {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
    const localAppData = process.env.LOCALAPPDATA || ''
    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    )
    if (localAppData) {
      candidates.push(
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      )
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    )
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/microsoft-edge',
      '/snap/bin/chromium'
    )
  }

  for (const browserPath of candidates) {
    if (fs.existsSync(browserPath)) {
      return browserPath
    }
  }
  return ''
}

async function launchWithSystemBrowser() {
  const executablePath = getSystemBrowserExecutablePath()
  if (!executablePath) {
    throw new Error(`未检测到可用系统浏览器，请先安装 Chrome 或 Edge 后重试（当前系统：${os.platform()}）`)
  }
  return await chromium.launch({
    headless: true,
    executablePath
  })
}

async function exportPdf(payload) {
  const { html, outputPath, options = {} } = payload
  const browser = await launchWithSystemBrowser()
  try {
    const page = await browser.newPage({
      viewport: {
        width: options.width || 1280,
        height: options.height || 1800
      }
    })
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.pdf({
      path: outputPath,
      format: options.format || 'A4',
      printBackground: options.printBackground !== false,
      margin: {
        top: options.marginTop || '20mm',
        right: options.marginRight || '14mm',
        bottom: options.marginBottom || '20mm',
        left: options.marginLeft || '14mm'
      }
    })
    return outputPath
  } finally {
    await browser.close()
  }
}

async function exportImage(payload) {
  const { html, outputPath, options = {} } = payload
  const browser = await launchWithSystemBrowser()
  try {
    const page = await browser.newPage({
      viewport: {
        width: options.width || 1280,
        height: options.height || 1800
      },
      deviceScaleFactor: options.deviceScaleFactor || 2
    })
    await page.setContent(html, { waitUntil: 'networkidle' })
    const ext = path.extname(outputPath).toLowerCase()
    const imageType = ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 'png'
    await page.screenshot({
      path: outputPath,
      type: imageType,
      quality: imageType === 'jpeg' ? (options.quality || 90) : undefined,
      fullPage: options.fullPage !== false
    })
    return outputPath
  } finally {
    await browser.close()
  }
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    throw new Error('缺少导出任务输入文件路径')
  }
  const raw = fs.readFileSync(inputPath, { encoding: 'utf-8' })
  const { task, payload } = JSON.parse(raw)

  if (!task || !payload) {
    throw new Error('导出任务参数无效')
  }

  let outputPath = ''
  if (task === 'pdf') {
    outputPath = await exportPdf(payload)
  } else if (task === 'image') {
    outputPath = await exportImage(payload)
  } else {
    throw new Error(`不支持的导出任务: ${task}`)
  }

  process.stdout.write(JSON.stringify({ ok: true, outputPath }))
}

main().catch(err => {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: (err && err.message) || String(err)
  }))
  process.exit(1)
})
