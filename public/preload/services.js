const fs = require('fs')
const fse = require('fs-extra')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')

const APP_LOG_PATH = path.join(os.tmpdir(), 'lz-note.log')
const EXPORT_WORKER_TIMEOUT_MS = 60_000
const DEFAULT_GIT_BRANCH = 'main'
const DEFAULT_GITIGNORE_CONTENT = ['.DS_Store', 'Thumbs.db', '.idea/', '.vscode/', '*.tmp'].join('\n') + '\n'

function appendAppLog(scope, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    fs.appendFileSync(APP_LOG_PATH, `[${scope}] ${line}`, { encoding: 'utf-8' })
  } catch {
    // 日志写入失败不影响主流程
  }
}

function appendExportLog(message) {
  appendAppLog('export', message)
}

function appendGitSyncLog(message) {
  appendAppLog('git-sync', message)
}

function getWorkerErrorMessage(rawText) {
  const raw = (rawText || '').trim()
  if (!raw) {
    return '导出失败'
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }
  } catch {
    // 非 JSON 输出时直接返回原始文本
  }
  return raw
}

function normalizeGitBranch(branch) {
  return (branch || '').trim() || DEFAULT_GIT_BRANCH
}

function buildGitAuth(token, username) {
  const safeToken = (token || '').trim()
  const safeUsername = (username || '').trim() || 'oauth2'
  return {
    username: safeUsername,
    password: safeToken
  }
}

function ensureDefaultGitIgnore(dir) {
  const gitIgnorePath = path.join(dir, '.gitignore')
  if (!fs.existsSync(gitIgnorePath)) {
    fs.writeFileSync(gitIgnorePath, DEFAULT_GITIGNORE_CONTENT, { encoding: 'utf-8' })
    return
  }
  const content = fs.readFileSync(gitIgnorePath, { encoding: 'utf-8' })
  const next = new Set(content.split(/\r?\n/).filter(Boolean))
  let changed = false
  DEFAULT_GITIGNORE_CONTENT.split('\n').filter(Boolean).forEach(item => {
    if (!next.has(item)) {
      next.add(item)
      changed = true
    }
  })
  if (changed) {
    fs.writeFileSync(gitIgnorePath, Array.from(next).join('\n') + '\n', { encoding: 'utf-8' })
  }
}

async function runExportWorker(task, payload) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const workerPath = path.join(__dirname, 'export-worker.cjs')
    const tempInputPath = path.join(os.tmpdir(), `ztools-export-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
    const outputPath = payload && payload.outputPath
    let isSettled = false

    if (!outputPath) {
      reject(new Error('导出失败：缺少输出路径'))
      return
    }

    const cleanupInput = () => {
      try {
        if (fs.existsSync(tempInputPath)) {
          fs.unlinkSync(tempInputPath)
        }
      } catch {
        // 清理失败不影响主流程
      }
    }

    try {
      fs.writeFileSync(tempInputPath, JSON.stringify({ task, payload }), { encoding: 'utf-8' })
    } catch (err) {
      reject(err)
      return
    }
    appendExportLog(`开始导出任务: type=${task}, output=${outputPath}`)

    const child = spawn(process.execPath, [workerPath, tempInputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      }
    })

    let stdout = ''
    let stderr = ''
    const timeoutId = setTimeout(() => {
      if (isSettled) {
        return
      }
      const timeoutMessage = `导出超时（>${EXPORT_WORKER_TIMEOUT_MS / 1000}s），请重试或检查系统浏览器状态`
      appendExportLog(`导出任务失败: ${timeoutMessage}`)
      child.kill()
      isSettled = true
      cleanupInput()
      reject(new Error(timeoutMessage))
    }, EXPORT_WORKER_TIMEOUT_MS)

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', err => {
      if (isSettled) {
        return
      }
      clearTimeout(timeoutId)
      isSettled = true
      cleanupInput()
      reject(err)
    })
    child.on('close', code => {
      if (isSettled) {
        return
      }
      clearTimeout(timeoutId)
      isSettled = true
      cleanupInput()
      if (code !== 0) {
        const message = getWorkerErrorMessage((stderr || stdout || '').trim())
        appendExportLog(`导出任务失败: ${message}`)
        reject(new Error(message || `导出进程异常退出，退出码: ${code}`))
        return
      }
      try {
        const result = JSON.parse(stdout || '{}')
        if (!result.ok) {
          reject(new Error(result.error || '导出失败'))
          return
        }
        if (!fs.existsSync(result.outputPath)) {
          appendExportLog(`导出任务失败: 文件未生成，path=${result.outputPath}`)
          reject(new Error(`导出失败：文件未生成（${result.outputPath}）`))
          return
        }
        const stat = fs.statSync(result.outputPath)
        if (!stat.isFile() || stat.size <= 0) {
          appendExportLog(`导出任务失败: 文件为空，path=${result.outputPath}, size=${stat.size}`)
          reject(new Error(`导出失败：文件为空（${result.outputPath}）`))
          return
        }
        appendExportLog(`导出任务成功: output=${result.outputPath}, size=${stat.size}, cost=${Date.now() - startTime}ms`)
        resolve(result.outputPath)
      } catch (err) {
        appendExportLog(`导出任务失败: 解析结果异常: ${(err && err.message) || String(err)}`)
        reject(new Error(`解析导出结果失败: ${(err && err.message) || String(err)}`))
      }
    })
  })
}

// Helper function to build a file tree
function buildTree(dirPath) {
  const stats = fs.statSync(dirPath)
  if (!stats.isDirectory()) {
    return null
  }
  const children = fs.readdirSync(dirPath)
    .filter(name => !name.startsWith('.git'))
    .map(name => {
      const fullPath = path.join(dirPath, name)
      const childStats = fs.statSync(fullPath)
      return { name, fullPath, childStats }
    })
    .sort((a, b) => {
      if (a.childStats.isDirectory() !== b.childStats.isDirectory()) {
        return a.childStats.isDirectory() ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    })

  return children.map(({ name, fullPath, childStats }) => {
    return {
      name,
      path: fullPath,
      isDirectory: childStats.isDirectory(),
      children: childStats.isDirectory() ? buildTree(fullPath) : []
    }
  })
}

function toUnixPath(relPath) {
  return relPath.split(path.sep).join('/')
}

function collectPathEntries(dirPath, basePath = dirPath, entries = new Map()) {
  if (!fs.existsSync(dirPath)) {
    return entries
  }
  const names = fs.readdirSync(dirPath)
  for (const name of names) {
    if (name === '.git') {
      continue
    }
    const fullPath = path.join(dirPath, name)
    const stats = fs.statSync(fullPath)
    const relPath = toUnixPath(path.relative(basePath, fullPath))
    if (stats.isDirectory()) {
      entries.set(relPath, { type: 'dir', fullPath })
      collectPathEntries(fullPath, basePath, entries)
    } else {
      entries.set(relPath, { type: 'file', fullPath, size: stats.size })
    }
  }
  return entries
}

function isSameFileContent(sourcePath, targetPath, sourceSize, targetSize) {
  if (sourceSize !== targetSize) {
    return false
  }
  const sourceBuffer = fs.readFileSync(sourcePath)
  const targetBuffer = fs.readFileSync(targetPath)
  return sourceBuffer.equals(targetBuffer)
}

function copyRemoteSnapshotToWorkspace(remoteDir, workspaceDir, remoteEntries) {
  const sortedEntries = Array.from(remoteEntries.entries()).sort((a, b) => a[0].length - b[0].length)
  for (const [relPath, entry] of sortedEntries) {
    const destinationPath = path.join(workspaceDir, ...relPath.split('/'))
    if (entry.type === 'dir') {
      if (!fs.existsSync(destinationPath)) {
        fse.ensureDirSync(destinationPath)
      }
      continue
    }
    if (!fs.existsSync(destinationPath)) {
      fse.ensureDirSync(path.dirname(destinationPath))
      fs.copyFileSync(entry.fullPath, destinationPath)
    }
  }
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return
  }
  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    fse.removeSync(targetPath)
    return
  }
  fs.unlinkSync(targetPath)
}

function hasFileConflictInParentChain(destinationPath, workspaceRoot) {
  const normalizedRoot = path.resolve(workspaceRoot)
  let current = path.resolve(path.dirname(destinationPath))
  while (current.length >= normalizedRoot.length) {
    if (fs.existsSync(current) && !fs.statSync(current).isDirectory()) {
      return true
    }
    if (current === normalizedRoot) {
      break
    }
    const next = path.dirname(current)
    if (next === current) {
      break
    }
    current = next
  }
  return false
}

async function getTrackedFileSet(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    return new Set()
  }
  const files = await git.listFiles({ fs, dir })
  return new Set(files.map(item => toUnixPath(item)))
}

window.services = {
  // --- File System APIs ---
  getWorkspace() {
    const workspace = path.join(window.ztools.getPath('documents'), 'ZToolsNotes')
    if (!fs.existsSync(workspace)) {
      fs.mkdirSync(workspace, { recursive: true })
    }
    return workspace
  },
  readDir(dirPath) {
    return buildTree(dirPath)
  },
  readFile(filePath) {
    return fs.readFileSync(filePath, { encoding: 'utf-8' })
  },
  writeFile(filePath, content) {
    fse.outputFileSync(filePath, content, { encoding: 'utf-8' })
    return filePath
  },
  writeFileBase64(filePath, base64Data) {
    fs.writeFileSync(filePath, base64Data, 'base64')
    return filePath
  },
  copy(src, dest) {
    fse.copySync(src, dest)
    return true
  },
  mkdir(dirPath) {
    fse.ensureDirSync(dirPath)
    return dirPath
  },
  rename(oldPath, newPath) {
    fs.renameSync(oldPath, newPath)
    return newPath
  },
  unlink(filePath) {
    fs.unlinkSync(filePath)
    return true
  },
  rmdir(dirPath) {
    fse.removeSync(dirPath)
    return true
  },
  exists(filePath) {
    return fs.existsSync(filePath)
  },
  joinPath(...paths) {
    return path.join(...paths)
  },
  basename(filePath) {
    return path.basename(filePath)
  },
  dirname(filePath) {
    return path.dirname(filePath)
  },
  extname(filePath) {
    return path.extname(filePath)
  },
  getLogFilePath() {
    return APP_LOG_PATH
  },
  readLogFile() {
    if (!fs.existsSync(APP_LOG_PATH)) {
      return ''
    }
    return fs.readFileSync(APP_LOG_PATH, { encoding: 'utf-8' })
  },

  // --- Export APIs ---
  async exportHtmlToPdf(html, outputPath, options = {}) {
    return await runExportWorker('pdf', { html, outputPath, options })
  },
  async exportHtmlToImage(html, outputPath, options = {}) {
    return await runExportWorker('image', { html, outputPath, options })
  },

  // --- Git APIs ---
  async gitClone(url, dir, token, username, branch) {
    const ref = normalizeGitBranch(branch)
    appendGitSyncLog(`开始克隆仓库: dir=${dir}, branch=${ref}`)
    await git.clone({
      fs,
      http,
      dir,
      url,
      ref,
      singleBranch: true,
      onAuth: () => buildGitAuth(token, username)
    })
    ensureDefaultGitIgnore(dir)
    appendGitSyncLog(`克隆仓库成功: dir=${dir}, branch=${ref}`)
    return true
  },
  async gitPrepareWorkspaceForSync(dir, url, token, branch) {
    const ref = normalizeGitBranch(branch)
    const hasGitRepo = fs.existsSync(path.join(dir, '.git'))
    appendGitSyncLog(`开始预检查同步状态: dir=${dir}, branch=${ref}, hasGitRepo=${hasGitRepo}`)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztools-git-prepare-'))
    try {
      await git.clone({
        fs,
        http,
        dir: tempDir,
        url,
        ref,
        singleBranch: true,
        depth: 1,
        onAuth: () => buildGitAuth(token)
      })

      const localEntries = collectPathEntries(dir)
      const localTrackedSet = await getTrackedFileSet(dir)
      const remoteTrackedSet = await getTrackedFileSet(tempDir)
      const remoteMissingTracked = []
      const localMissingTracked = []

      for (const relPath of localTrackedSet) {
        if (!remoteTrackedSet.has(relPath) && localEntries.has(relPath)) {
          remoteMissingTracked.push(relPath)
        }
        if (!localEntries.has(relPath) && remoteTrackedSet.has(relPath)) {
          localMissingTracked.push(relPath)
        }
      }

      appendGitSyncLog(
        `预检查完成: remoteMissingTracked=${remoteMissingTracked.length}, localMissingTracked=${localMissingTracked.length}`
      )
      return {
        remoteMissingTracked: remoteMissingTracked.sort(),
        localMissingTracked: localMissingTracked.sort(),
        bootstrapped: !hasGitRepo
      }
    } finally {
      fse.removeSync(tempDir)
    }
  },
  async gitPull(dir, url, token, branch, decisions) {
    const ref = normalizeGitBranch(branch)
    appendGitSyncLog(`开始按快照同步远程: dir=${dir}, branch=${ref}`)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztools-git-pull-'))
    const resolvedDecisions = {
      remoteMissingTrackedAction: decisions && decisions.remoteMissingTrackedAction === 'apply_remote_delete'
        ? 'apply_remote_delete'
        : 'keep_local',
      localMissingTrackedAction: decisions && decisions.localMissingTrackedAction === 'apply_local_delete'
        ? 'apply_local_delete'
        : 'restore_local'
    }
    try {
      await git.clone({
        fs,
        http,
        dir: tempDir,
        url,
        ref,
        singleBranch: true,
        depth: 1,
        onAuth: () => buildGitAuth(token)
      })

      const localEntries = collectPathEntries(dir)
      const remoteEntries = collectPathEntries(tempDir)
      const localTrackedSet = await getTrackedFileSet(dir)
      const remoteTrackedSet = await getTrackedFileSet(tempDir)
      const remoteMissingTracked = []
      const localMissingTracked = []

      for (const relPath of localTrackedSet) {
        if (!remoteTrackedSet.has(relPath) && localEntries.has(relPath)) {
          remoteMissingTracked.push(relPath)
        }
        if (!localEntries.has(relPath) && remoteTrackedSet.has(relPath)) {
          localMissingTracked.push(relPath)
        }
      }

      if (resolvedDecisions.remoteMissingTrackedAction === 'apply_remote_delete') {
        remoteMissingTracked.forEach(relPath => {
          const targetPath = path.join(dir, ...relPath.split('/'))
          removePathIfExists(targetPath)
        })
      }

      const localDeleteSet = new Set(
        resolvedDecisions.localMissingTrackedAction === 'apply_local_delete' ? localMissingTracked : []
      )
      const blockedRemoteDirPrefixes = new Set()
      const sortedRemoteEntries = Array.from(remoteEntries.entries()).sort((a, b) => a[0].length - b[0].length)
      sortedRemoteEntries.forEach(([relPath, entry]) => {
        for (const blockedPrefix of blockedRemoteDirPrefixes) {
          if (relPath === blockedPrefix || relPath.startsWith(`${blockedPrefix}/`)) {
            return
          }
        }
        const destinationPath = path.join(dir, ...relPath.split('/'))
        if (entry.type === 'dir') {
          if (fs.existsSync(destinationPath) && !fs.statSync(destinationPath).isDirectory()) {
            blockedRemoteDirPrefixes.add(relPath)
            return
          }
          if (!fs.existsSync(destinationPath)) {
            try {
              fse.ensureDirSync(destinationPath)
            } catch (error) {
              appendGitSyncLog(`跳过目录同步: path=${relPath}, reason=${(error && error.message) || String(error)}`)
              blockedRemoteDirPrefixes.add(relPath)
            }
          }
          return
        }
        if (localDeleteSet.has(relPath)) {
          return
        }
        if (!fs.existsSync(destinationPath)) {
          if (hasFileConflictInParentChain(destinationPath, dir)) {
            return
          }
          try {
            fse.ensureDirSync(path.dirname(destinationPath))
            fs.copyFileSync(entry.fullPath, destinationPath)
          } catch (error) {
            appendGitSyncLog(`跳过文件同步: path=${relPath}, reason=${(error && error.message) || String(error)}`)
          }
          return
        }
        const destinationStat = fs.statSync(destinationPath)
        if (destinationStat.isDirectory()) {
          return
        }
        const isSameFile = isSameFileContent(destinationPath, entry.fullPath, destinationStat.size, entry.size)
        if (isSameFile) {
          return
        }
        // 本地优先策略：同路径文件内容不一致时保留本地文件
      })

      fse.copySync(path.join(tempDir, '.git'), path.join(dir, '.git'), { overwrite: true })
      ensureDefaultGitIgnore(dir)
      appendGitSyncLog(
        `按快照同步远程成功: dir=${dir}, branch=${ref}, remoteMissingTracked=${remoteMissingTracked.length}, localMissingTracked=${localMissingTracked.length}`
      )
    } finally {
      fse.removeSync(tempDir)
    }
    return true
  },
  async gitAdd(dir, filepath) {
    await git.add({ fs, dir, filepath })
    return true
  },
  async gitAddAll(dir) {
    ensureDefaultGitIgnore(dir)
    const statusMatrix = await git.statusMatrix({ fs, dir })
    await Promise.all(
      statusMatrix.map(([filepath, , worktreeStatus]) =>
        worktreeStatus ? git.add({ fs, dir, filepath }) : git.remove({ fs, dir, filepath })
      )
    )
    appendGitSyncLog(`暂存区更新完成: dir=${dir}, total=${statusMatrix.length}`)
    return true
  },
  async gitCommit(dir, message, name, email) {
    appendGitSyncLog(`开始提交: dir=${dir}, message=${message}`)
    await git.commit({
      fs,
      dir,
      message,
      author: {
        name: name || 'ZTools Note',
        email: email || 'note@ztools.com'
      }
    })
    appendGitSyncLog(`提交成功: dir=${dir}`)
    return true
  },
  async gitPush(dir, token, branch) {
    const remoteRef = normalizeGitBranch(branch)
    appendGitSyncLog(`开始推送远程: dir=${dir}, branch=${remoteRef}`)
    await git.push({
      fs,
      http,
      dir,
      remoteRef,
      onAuth: () => buildGitAuth(token)
    })
    appendGitSyncLog(`推送远程成功: dir=${dir}, branch=${remoteRef}`)
    return true
  },
  async gitStatus(dir) {
    return await git.statusMatrix({ fs, dir })
  }
}
