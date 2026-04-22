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

export async function exportMarkdownFile(sourcePath: string, fileName: string) {
  const mdName = /\.md$/i.test(fileName) ? fileName : `${fileName}.md`
  const savePath = window.ztools?.showSaveDialog({
    title: '导出为 Markdown',
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
    title: '导出为 HTML',
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
    title: '导出为 PDF',
    defaultPath: pdfName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!savePath) {
    return null
  }
  const { fullHtml } = await buildRenderableHtmlFromFile(sourcePath, fileName)
  return await window.services.exportHtmlToPdf(fullHtml, savePath, {
    format: 'A4',
    printBackground: true
  })
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
  if (!savePath) {
    return null
  }
  const { fullHtml } = await buildRenderableHtmlFromFile(sourcePath, fileName)
  return await window.services.exportHtmlToImage(fullHtml, savePath, {
    fullPage: true,
    deviceScaleFactor: 2
  })
}
