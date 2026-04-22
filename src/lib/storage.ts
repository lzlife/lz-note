export async function readStorageValue(key: string): Promise<string> {
  if (window.ztools?.dbStorage) {
    const value = window.ztools.dbStorage.getItem(key)
    if (value && typeof value.then === 'function') {
      return (await value) || ''
    }
    return value || ''
  }
  return localStorage.getItem(key) || ''
}

export async function writeStorageValue(key: string, value: string): Promise<void> {
  if (window.ztools?.dbStorage) {
    const result = window.ztools.dbStorage.setItem(key, value)
    if (result && typeof result.then === 'function') {
      await result
    }
    return
  }
  localStorage.setItem(key, value)
}
