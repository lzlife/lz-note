import { readStorageValue } from '@/lib/storage'
import type { GitStartupStrategy, GitSyncConfig } from '@/lib/gitSync'

export interface LoadedGitSyncConfig {
  config: GitSyncConfig
  isConfigured: boolean
}

export async function loadGitSyncConfigFromStorage(): Promise<LoadedGitSyncConfig> {
  const [gitUrl, token, gitBranch, gitSyncStrategy] = await Promise.all([
    readStorageValue('gitUrl'),
    readStorageValue('gitToken'),
    readStorageValue('gitBranch'),
    readStorageValue('gitSyncStrategy')
  ])

  const branch = (gitBranch || '').trim() || 'main'
  const strategy = ((gitSyncStrategy || '').trim() || 'full_sync') as GitStartupStrategy
  const config: GitSyncConfig = {
    gitUrl: (gitUrl || '').trim(),
    token: (token || '').trim(),
    branch,
    strategy
  }

  return {
    config,
    isConfigured: Boolean(config.gitUrl && config.token)
  }
}
