import Vditor from 'vditor'

const VDITOR_CDN = 'https://unpkg.com/vditor@3.11.2'

async function markdownToHtml(content: string) {
  try {
    return await Vditor.md2html(content)
  } catch {
    return await Vditor.md2html(content, { cdn: VDITOR_CDN, mode: 'light' })
  }
}

export async function buildRenderableHtmlFromFile(filePath: string, fileName: string) {
  const content = window.services.readFile(filePath)
  const title = fileName.replace(/\.md$/i, '')
  const html = await markdownToHtml(content)
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`
  return { html, fullHtml, title, content }
}

function uint8ArrayToBase64(uint8: Uint8Array): string {
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let i = 0; i < uint8.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSize))))
  }
  return btoa(chunks.join(''))
}

function pathToFileUrl(filePath: string): string {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

async function createExportWindow(htmlFilePath: string) {
  const bw = window.ztools.createBrowserWindow(
    pathToFileUrl(htmlFilePath),
    { show: false, width: 1280, height: 1800, webPreferences: { zoomFactor: 1 } }
  )
  if (!bw) throw new Error('创建导出窗口失败')

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('导出页面加载超时')), 15000)
    const check = () => {
      if (bw.webContents.isLoading()) {
        setTimeout(check, 100)
      } else {
        clearTimeout(timeout)
        resolve()
      }
    }
    check()
  })

  return bw
}

function writeTempHtml(fullHtml: string): string {
  const tempDir = window.ztools.getPath('temp')
  const tempPath = window.services.joinPath(tempDir, `lz-note-export-${Date.now()}.html`)
  window.services.writeFile(tempPath, fullHtml)
  return tempPath
}

function cleanupTempFile(filePath: string) {
  try {
    window.services.unlink(filePath)
  } catch {
    // 清理失败不影响主流程
  }
}

export async function exportMarkdownFile(sourcePath: string, fileName: string) {
  const mdName = /\.md$/i.test(fileName) ? fileName : `${fileName}.md`
  const savePath = window.ztools?.showSaveDialog({
    title: '导出为Markdown',
    defaultPath: mdName,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (!savePath) {
    return null
  }
  const content = window.services.readFile(sourcePath)
  window.services.writeFile(savePath, content)
  return savePath
}

export async function exportHtmlFile(sourcePath: string, fileName: string) {
  const htmlName = fileName.replace(/\.md$/i, '.html')
  const savePath = window.ztools?.showSaveDialog({
    title: '导出为HTML',
    defaultPath: htmlName,
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (!savePath) {
    return null
  }
  const { fullHtml } = await buildRenderableHtmlFromFile(sourcePath, fileName)
  window.services.writeFile(savePath, fullHtml)
  return savePath
}

export async function exportPdfFile(sourcePath: string, fileName: string) {
  const pdfName = fileName.replace(/\.md$/i, '.pdf')
  const savePath = window.ztools?.showSaveDialog({
    title: '导出为PDF',
    defaultPath: pdfName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!savePath) return null

  const { fullHtml } = await buildRenderableHtmlFromFile(sourcePath, fileName)
  const tempPath = writeTempHtml(fullHtml)

  try {
    const bw = await createExportWindow(tempPath)
    try {
      const pdfBuffer = await bw.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true
      })
      window.services.writeFileBase64(savePath, uint8ArrayToBase64(pdfBuffer))
      return savePath
    } finally {
      bw.close()
    }
  } finally {
    cleanupTempFile(tempPath)
  }
}

export async function exportImageFile(sourcePath: string, fileName: string) {
  const imageName = fileName.replace(/\.md$/i, '.png')
  const savePath = window.ztools?.showSaveDialog({
    title: '导出为图片',
    defaultPath: imageName,
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPG', extensions: ['jpg', 'jpeg'] }
    ]
  })
  if (!savePath) return null

  const { fullHtml } = await buildRenderableHtmlFromFile(sourcePath, fileName)
  const tempPath = writeTempHtml(fullHtml)

  try {
    const bw = await createExportWindow(tempPath)
    try {
      const contentHeight: number = await bw.webContents.executeJavaScript(
        'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 100)'
      )
      bw.setContentSize(1280, Math.max(contentHeight, 100))
      await new Promise(r => setTimeout(r, 300))

      const image = await bw.capturePage(
        { x: 0, y: 0, width: 1280, height: contentHeight },
        { stayHidden: true, stayAwake: true }
      )

      const ext = window.services.extname(savePath).toLowerCase()
      const img: Record<string, any> = image as unknown as Record<string, any>

      let base64: string
      if (typeof img.toPNG === 'function' && typeof img.toJPEG === 'function') {
        const useJpeg = ext === '.jpg' || ext === '.jpeg'
        const buffer: Uint8Array = useJpeg ? img.toJPEG(90) : img.toPNG()
        base64 = uint8ArrayToBase64(buffer)
      } else if (typeof img.toDataURL === 'function') {
        const dataUrl: string = img.toDataURL()
        base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      } else {
        throw new Error('无法读取图片数据：capturePage 返回的对象不支持的导出方法')
      }

      window.services.writeFileBase64(savePath, base64)
      return savePath
    } finally {
      bw.close()
    }
  } finally {
    cleanupTempFile(tempPath)
  }
}
