import { useEffect, useState } from 'react'

export const buildId = __DAYMARK_BUILD_ID__

export function updateUrl(version: string, current = window.location.href): string {
  const url = new URL(current)
  for (const key of ['v', 'code', 'error', 'error_description']) url.searchParams.delete(key)
  url.hash = ''
  url.searchParams.set('daymark_release', version)
  return url.href
}

export function useAppUpdate(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let active = true
    let checking = false
    let lastCheck = 0
    let controller: AbortController | undefined
    const check = async () => {
      if (document.hidden || checking || Date.now() - lastCheck < 5000) return
      checking = true; lastCheck = Date.now()
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 5000)
      try {
        const url = new URL(`${import.meta.env.BASE_URL}version.json`, window.location.origin)
        url.searchParams.set('_', String(Date.now()))
        const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal })
        if (!response.ok) return
        const data: unknown = await response.json()
        if (active && data && typeof data === 'object' && 'version' in data && typeof data.version === 'string'
          && /^[a-zA-Z0-9_.-]{1,120}$/.test(data.version)) {
          setVersion(data.version !== buildId ? data.version : null)
        }
      } catch { /* Offline, timeout or a deployment in progress: keep using this app. */ }
      finally { window.clearTimeout(timeout); checking = false }
    }
    const onReturn = () => { void check() }
    window.addEventListener('focus', onReturn)
    window.addEventListener('pageshow', onReturn)
    window.addEventListener('online', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    const interval = window.setInterval(onReturn, 60000)
    void check()
    return () => {
      active = false; controller?.abort(); window.clearInterval(interval)
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      window.removeEventListener('online', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [])
  return version
}
