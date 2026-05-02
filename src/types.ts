export type Mode = 'advisory' | 'enforce'
export type Severity = 'low' | 'medium' | 'high'

export interface Finding {
  ruleId: string
  ecosystem: string
  file: string
  line: number
  severity: Severity
  message: string
  remediation: string
}

export interface Config {
  mode?: Mode
  severityThreshold?: Severity
  include?: string[]
  exclude?: string[]
  rules?: Record<string, boolean>
  severityOverrides?: Record<string, Severity>
  allowlist?: AllowlistEntry[]
  ecosystems?: Record<string, Record<string, unknown>>
}

export interface AllowlistEntry {
  file?: string
  ruleId?: string
  ecosystem?: string
  line?: number
}

export interface ScanOptions {
  root: string
  include: string[]
  exclude: string[]
  config: Config
}

export interface ScanResult {
  findings: Finding[]
  scannedFiles: string[]
}

export interface ReportResult {
  markdownPath: string
  sarifPath?: string
}
