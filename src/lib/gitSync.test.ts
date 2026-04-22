import { describe, expect, it } from 'vitest'
import { buildCommitMessage, getChangedPaths, getEmptyReport, mapGitError } from './gitSync'

describe('gitSync 纯函数回归测试', () => {
  it('应正确生成包含路径的提交信息并截断过长列表', () => {
    const message = buildCommitMessage(
      ['docs/a.md', 'notes/a.md', 'x.md', 'y.md', 'z.md', 'a.md', 'b.md', 'c.md', 'd.md'],
      '同步'
    )
    expect(message).toContain('同步：')
    expect(message).toContain('等 9 项')
    expect(message).toContain('docs/a.md')
    expect(message).toContain('notes/a.md')
  })

  it('应正确筛选有差异的路径', () => {
    const changed = getChangedPaths([
      ['a.md', 1, 1, 1],
      ['b.md', 1, 2, 2],
      ['c.md', 0, 2, 2],
      ['d.md', 1, 1, 0]
    ])
    expect(changed).toEqual(['b.md', 'c.md', 'd.md'])
  })

  it('应将常见 git 错误映射为结构化错误码', () => {
    const auth = mapGitError(new Error('Authentication failed: 401'))
    const ff = mapGitError(new Error('Not possible to fast-forward, aborting.'))
    const network = mapGitError(new Error('network timed out while fetching'))
    expect(auth.code).toBe('GIT_AUTH_FAILED')
    expect(ff.code).toBe('GIT_FAST_FORWARD_REQUIRED')
    expect(network.code).toBe('GIT_NETWORK_FAILED')
  })

  it('应正确初始化同步报告默认字段', () => {
    const report = getEmptyReport('startup', 'main')
    expect(report.mode).toBe('startup')
    expect(report.branch).toBe('main')
    expect(report.changedPaths).toEqual([])
    expect(report.remoteMissingTracked).toEqual([])
    expect(report.localMissingTracked).toEqual([])
    expect(report.decisionRequired).toBe(false)
    expect(report.decisionApplied).toBe(false)
    expect(report.skippedPushByNoChanges).toBe(false)
  })
})
