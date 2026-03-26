import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ClassData } from './types'

export interface CacheData {
  endpoint: string
  totalTriples: number | null
  classDataList: ClassData[]
  cachedAt: string
}

function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
  return join(base, 'shapetrospection')
}

function cacheKey(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex')
}

function cachePath(endpoint: string): string {
  return join(cacheDir(), `${cacheKey(endpoint)}.json`)
}

export function readCache(endpoint: string): CacheData | null {
  const path = cachePath(endpoint)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const data: CacheData = JSON.parse(raw)
    if (data.endpoint !== endpoint) return null
    return data
  } catch {
    return null
  }
}

export function writeCache(data: CacheData): void {
  const dir = cacheDir()
  mkdirSync(dir, { recursive: true })
  const path = cachePath(data.endpoint)
  writeFileSync(path, JSON.stringify(data), 'utf-8')
}
