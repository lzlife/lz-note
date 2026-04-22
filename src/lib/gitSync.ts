export type GitSyncPhase =
  | 'idle'
  | 'precheck'
  | 'confirm'
  | 'conflict'
  | 'pull'
  | 'diff'
  | 'dry_run'
  | 'commit'
  | 'push'
  | 'success'
  | 'error'

export type GitSyncMode = 'manual' | 'startup'
export type GitStartupStrategy = 'manual_only' | 'pull_only' | 'full_sync'

export type GitSyncErrorCode =
  | 'GIT_CONFIG_MISSING'
  | 'GIT_CONFIRM_REQUIRED'
  | 'GIT_CONFLICT'
  | 'GIT_AUTH_FAILED'
  | 'GIT_NETWORK_FAILED'
  | 'GIT_FAST_FORWARD_REQUIRED'
  | 'GIT_UNKNOWN'

export interface GitSyncError {
  code: GitSyncErrorCode
  message: string
}

export interface GitSyncReport {
  mode: GitSyncMode
  branch: string
  bootstrapped: boolean
  changedPaths: string[]
  remoteMissingTracked: string[]
  localMissingTracked: string[]
  decisionRequired: boolean
  decisionApplied: boolean
  commitMessage: string
  pulled: boolean
  committed: boolean
  pushed: boolean
  skippedPushByStrategy: boolean
  skippedPushByNoChanges: boolean
  durationMs: number
}

export interface GitSyncConfig {
  gitUrl: string
  token: string
  branch: string
  strategy: GitStartupStrategy
}

export interface GitSyncResult {
  ok: boolean
  phase: GitSyncPhase
  report: GitSyncReport
  conflicts: string[]
  requiresDecision: boolean
  dryRun: boolean
  error?: GitSyncError
}

export type RemoteMissingTrackedAction = 'keep_local' | 'apply_remote_delete'
export type LocalMissingTrackedAction = 'restore_local' | 'apply_local_delete'

export interface GitSyncDecisions {
  remoteMissingTrackedAction: RemoteMissingTrackedAction
  localMissingTrackedAction: LocalMissingTrackedAction
}

interface RunGitSyncParams {
  workspace: string
  mode: GitSyncMode
  config: GitSyncConfig
  refreshFileTree: () => void
  setPhase: (phase: GitSyncPhase) => void
  dryRun?: boolean
  precheckOnly?: boolean
  decisions?: GitSyncDecisions
}

function normalizeBranch(branch: string) {
  return (branch || '').trim() || 'main'
}

export function buildCommitMessage(changedPaths: string[], prefix = '同步') {
  const uniquePaths = Array.from(new Set(changedPaths.map(item => item.replace(/\\/g, '/')).filter(Boolean)))
  if (uniquePaths.length === 0) {
    return ''
  }
  const preview = uniquePaths.slice(0, 8).join('、')
  if (uniquePaths.length > 8) {
    return `${prefix}：${preview} 等 ${uniquePaths.length} 项`
  }
  return `${prefix}：${preview}`
}

export function getChangedPaths(statusMatrix: Array<[string, number, number, number]>) {
  return statusMatrix
    .filter(([, headStatus, worktreeStatus, stageStatus]) => headStatus !== worktreeStatus || worktreeStatus !== stageStatus)
    .map(([filepath]) => filepath)
}

export function mapGitError(error: unknown): GitSyncError {
  const rawMessage = (error as Error)?.message || ''
  if (!rawMessage) {
    return { code: 'GIT_UNKNOWN', message: '未知错误' }
  }
  if (/fast-forward/i.test(rawMessage)) {
    return {
      code: 'GIT_FAST_FORWARD_REQUIRED',
      message: '远程分支与本地分支存在非快进差异，请先处理分支分叉后再同步'
    }
  }
  if (/401|403|authentication|auth/i.test(rawMessage)) {
    return { code: 'GIT_AUTH_FAILED', message: 'Git 认证失败，请检查仓库地址、分支与 Token 是否有效' }
  }
  if (/timed out|network|ENOTFOUND|ECONN|fetch failed/i.test(rawMessage)) {
    return { code: 'GIT_NETWORK_FAILED', message: '网络异常导致同步失败，请检查网络后重试' }
  }
  return { code: 'GIT_UNKNOWN', message: rawMessage }
}

export function getEmptyReport(mode: GitSyncMode, branch: string): GitSyncReport {
  return {
    mode,
    branch,
    bootstrapped: false,
    changedPaths: [],
    remoteMissingTracked: [],
    localMissingTracked: [],
    decisionRequired: false,
    decisionApplied: false,
    commitMessage: '',
    pulled: false,
    committed: false,
    pushed: false,
    skippedPushByStrategy: false,
    skippedPushByNoChanges: false,
    durationMs: 0
  }
}

export async function runGitSync(params: RunGitSyncParams): Promise<GitSyncResult> {
  const { workspace, mode, config, refreshFileTree, setPhase, dryRun = false, precheckOnly = false, decisions } = params
  const startAt = Date.now()
  const branch = normalizeBranch(config.branch)
  const report = getEmptyReport(mode, branch)

  if (!config.gitUrl || !config.token) {
    return {
      ok: false,
      phase: 'error',
      report,
      conflicts: [],
      requiresDecision: false,
      dryRun: false,
      error: { code: 'GIT_CONFIG_MISSING', message: '请先在仓库设置中绑定 Git 仓库' }
    }
  }

  try {
    const { gitPrepareWorkspaceForSync, gitPull, gitStatus, gitAddAll, gitCommit, gitPush } = window.services

    setPhase('precheck')
    const prepareResult = await gitPrepareWorkspaceForSync(workspace, config.gitUrl, config.token, branch)
    report.bootstrapped = prepareResult.bootstrapped
    report.remoteMissingTracked = prepareResult.remoteMissingTracked || []
    report.localMissingTracked = prepareResult.localMissingTracked || []
    report.decisionRequired = report.remoteMissingTracked.length > 0 || report.localMissingTracked.length > 0
    if (report.decisionRequired) {
      report.decisionApplied = Boolean(decisions)
    }

    if (precheckOnly) {
      const phase: GitSyncPhase = report.decisionRequired ? 'confirm' : 'precheck'
      setPhase(phase)
      report.durationMs = Date.now() - startAt
      return {
        ok: true,
        phase,
        report,
        conflicts: [],
        requiresDecision: report.decisionRequired,
        dryRun: false
      }
    }

    if (report.decisionRequired && dryRun) {
      setPhase('confirm')
      report.durationMs = Date.now() - startAt
      return {
        ok: true,
        phase: 'confirm',
        report,
        conflicts: [],
        requiresDecision: true,
        dryRun: true
      }
    }

    if (report.decisionRequired && !decisions) {
      setPhase('confirm')
      report.durationMs = Date.now() - startAt
      return {
        ok: false,
        phase: 'confirm',
        report,
        conflicts: [],
        requiresDecision: true,
        dryRun: false,
        error: {
          code: 'GIT_CONFIRM_REQUIRED',
          message: '检测到已追踪文件的删除风险，请先确认同步策略后再继续'
        }
      }
    }

    setPhase('pull')
    await gitPull(workspace, config.gitUrl, config.token, branch, decisions)
    report.pulled = true
    refreshFileTree()

    setPhase('diff')
    const statusMatrix = await gitStatus(workspace)
    report.changedPaths = getChangedPaths(statusMatrix)

    if (report.changedPaths.length === 0) {
      report.skippedPushByNoChanges = true
      setPhase('success')
      report.durationMs = Date.now() - startAt
      return { ok: true, phase: 'success', report, conflicts: [], requiresDecision: false, dryRun: false }
    }

    report.commitMessage = buildCommitMessage(report.changedPaths, mode === 'startup' ? '自动同步' : '同步')

    const shouldSkipPush = mode === 'startup' && config.strategy === 'pull_only'
    if (shouldSkipPush) {
      report.skippedPushByStrategy = true
      setPhase('success')
      report.durationMs = Date.now() - startAt
      return { ok: true, phase: 'success', report, conflicts: [], requiresDecision: false, dryRun: false }
    }

    if (dryRun) {
      setPhase('dry_run')
      report.durationMs = Date.now() - startAt
      return { ok: true, phase: 'dry_run', report, conflicts: [], requiresDecision: false, dryRun: true }
    }

    setPhase('commit')
    await gitAddAll(workspace)
    await gitCommit(workspace, report.commitMessage)
    report.committed = true

    setPhase('push')
    await gitPush(workspace, config.token, branch)
    report.pushed = true

    setPhase('success')
    report.durationMs = Date.now() - startAt
    return { ok: true, phase: 'success', report, conflicts: [], requiresDecision: false, dryRun: false }
  } catch (error) {
    const mappedError = mapGitError(error)
    setPhase('error')
    report.durationMs = Date.now() - startAt
    return {
      ok: false,
      phase: 'error',
      report,
      conflicts: [],
      requiresDecision: false,
      dryRun: false,
      error: mappedError
    }
  }
}
