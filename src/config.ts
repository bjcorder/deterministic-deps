import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { Config, Mode, Severity } from './types'

export function splitPatterns(value?: string): string[] {
  if (!value) {
    return []
  }

  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function normalizeMode(value: string | undefined, fallback: Mode = 'advisory'): Mode {
  if (value === 'advisory' || value === 'enforce') {
    return value
  }

  return fallback
}

export function normalizeSeverity(value: string | undefined, fallback: Severity = 'low'): Severity {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }

  return fallback
}

export function loadConfig(root: string, configPath: string): Config {
  const resolved = path.resolve(root, configPath)
  if (!fs.existsSync(resolved)) {
    return {}
  }

  const parsed = yaml.load(fs.readFileSync(resolved, 'utf8'))
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }

  const raw = parsed as Record<string, unknown>
  return {
    mode: normalizeMode(raw.mode as string | undefined, undefined),
    severityThreshold: normalizeSeverity(
      raw['severity-threshold'] as string | undefined,
      undefined
    ),
    include: Array.isArray(raw.include) ? raw.include.map(String) : undefined,
    exclude: Array.isArray(raw.exclude) ? raw.exclude.map(String) : undefined,
    rules: isRecord(raw.rules) ? booleanRecord(raw.rules) : undefined,
    severityOverrides: isRecord(raw.severity) ? severityRecord(raw.severity) : undefined,
    allowlist: Array.isArray(raw.allowlist)
      ? raw.allowlist.map((entry) => ({ ...(entry as object) }))
      : undefined,
    ecosystems: isRecord(raw.ecosystems) ? (raw.ecosystems as Config['ecosystems']) : undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function booleanRecord(value: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(value).map(([key, enabled]) => [key, enabled !== false]))
}

function severityRecord(value: Record<string, unknown>): Record<string, Severity> {
  return Object.fromEntries(
    Object.entries(value).map(([key, severity]) => [
      key,
      normalizeSeverity(String(severity), 'low')
    ])
  )
}
