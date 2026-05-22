import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import {
  existingAncestorRealpathStaysInsideRoot,
  normalizeWorkspaceRelativePath,
  isSafeWorkspaceRelativePath
} from './paths'
import { containsCredentialMaterial, sanitizeDisplayValue } from './redaction'
import { Finding, LineReplacement, ReportResult, Severity } from './types'
import { Rule, rules as ruleRegistry } from './rules'

const RULES_HELP_URI = 'https://github.com/bjcorder/deterministic-deps/blob/main/docs/rules.md'

// Stable component of the SARIF fingerprint hash. Changing this value
// invalidates every previously stored fingerprint, so do not bump it casually.
export const SARIF_FINGERPRINT_VERSION = 'v1'

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length
  }
}

export function writeReports(
  root: string,
  findings: Finding[],
  writeSarif: boolean,
  writePatch = false
): ReportResult {
  const outputDir = path.join(root, 'deterministic-deps-report')
  if (!existingAncestorRealpathStaysInsideRoot(root, outputDir)) {
    throw new Error('Report output directory must resolve inside the scan root.')
  }
  fs.mkdirSync(outputDir, { recursive: true })

  const markdownPath = path.join(outputDir, 'report.md')
  fs.writeFileSync(markdownPath, renderMarkdown(findings), 'utf8')

  const patchPath = writePatch ? path.join(outputDir, 'suggestions.patch') : undefined
  if (patchPath) {
    fs.writeFileSync(patchPath, renderPatch(root, findings), 'utf8')
  }

  if (!writeSarif) {
    return { markdownPath, patchPath }
  }

  const sarifPath = path.join(outputDir, 'deterministic-deps.sarif')
  fs.writeFileSync(sarifPath, JSON.stringify(renderSarif(findings), null, 2), 'utf8')

  return { markdownPath, sarifPath, patchPath }
}

export function renderMarkdown(findings: Finding[]): string {
  const counts = countBySeverity(findings)
  const lines = [
    '# deterministic-deps report',
    '',
    `Total findings: ${findings.length}`,
    '',
    `High: ${counts.high}`,
    `Medium: ${counts.medium}`,
    `Low: ${counts.low}`,
    ''
  ]

  if (findings.length === 0) {
    lines.push('No non-deterministic dependency declarations were found.', '')
    return lines.join('\n')
  }

  lines.push('| Severity | Rule | Ecosystem | Location | Message | Remediation |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const finding of findings) {
    lines.push(
      `| ${finding.severity} | ${finding.ruleId} | ${finding.ecosystem} | ${escapeMarkdown(sanitizeDisplayValue(finding.file))}:${finding.line} | ${escapeMarkdown(sanitizeDisplayValue(finding.message))} | ${escapeMarkdown(sanitizeDisplayValue(finding.remediation))} |`
    )
  }

  const suggestions = findings.filter((finding) => finding.suggestion)
  if (suggestions.length > 0) {
    lines.push('', '## Suggestions', '')
    for (const finding of suggestions) {
      const suggestion = finding.suggestion
      if (!suggestion) {
        continue
      }
      const replacement = safeReplacement(finding)
      lines.push(
        `- ${escapeMarkdown(sanitizeDisplayValue(finding.file))}:${finding.line} ${escapeMarkdown(sanitizeDisplayValue(suggestion.title))} (confidence: ${suggestion.confidence}; safe patch: ${replacement ? 'yes' : 'no'})`
      )
      if (replacement) {
        lines.push(
          `  - Replace line ${replacement.line} with: \`${escapeMarkdown(sanitizeDisplayValue(replacement.newText))}\``
        )
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}

export function renderSarif(findings: Finding[]): object {
  const rules = Array.from(new Set(findings.map((finding) => finding.ruleId))).map(
    sarifRuleMetadata
  )

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'deterministic-deps',
            informationUri: 'https://github.com/bjcorder/deterministic-deps',
            rules
          }
        },
        results: findings.map((finding) => {
          const result: Record<string, unknown> = {
            ruleId: finding.ruleId,
            level: sarifLevel(finding.severity),
            message: {
              text: sanitizeDisplayValue(`${finding.message} ${finding.remediation}`)
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: finding.file
                  },
                  region: {
                    startLine: finding.line
                  }
                }
              }
            ],
            partialFingerprints: sarifFingerprints(finding),
            properties: {
              ecosystem: finding.ecosystem,
              severity: finding.severity
            }
          }

          const replacement = safeReplacement(finding)
          if (
            replacement &&
            finding.file === replacement.file &&
            finding.line === replacement.line &&
            replacement.oldText.length > 0
          ) {
            result.fixes = [
              {
                description: {
                  text: sanitizeDisplayValue(finding.suggestion?.title ?? finding.remediation)
                },
                artifactChanges: [
                  {
                    artifactLocation: {
                      uri: replacement.file
                    },
                    replacements: [
                      {
                        deletedRegion: {
                          startLine: replacement.line,
                          endLine: replacement.line
                        },
                        insertedContent: {
                          text: `${sanitizeDisplayValue(replacement.newText)}\n`
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }

          return result
        })
      }
    ]
  }
}

function sarifRuleMetadata(ruleId: string): object {
  const rule = ruleRegistry.find((candidate) => candidate.id === ruleId)
  const description = rule?.description ?? ruleId

  return {
    id: ruleId,
    name: ruleId,
    shortDescription: {
      text: description
    },
    fullDescription: {
      text: description
    },
    helpUri: rule ? ruleHelpUri(rule) : RULES_HELP_URI,
    properties: {
      ecosystem: rule?.ecosystem,
      defaultSeverity: rule?.defaultSeverity
    }
  }
}

function ruleHelpUri(rule: Rule): string {
  return `${RULES_HELP_URI}#${ruleDocsAnchor(rule.ecosystem)}`
}

function ruleDocsAnchor(ecosystem: string): string {
  const anchors: Record<string, string> = {
    'github-actions': 'github-actions',
    containers: 'containers',
    terraform: 'terraform-and-opentofu',
    node: 'nodejs',
    python: 'python',
    go: 'go',
    rust: 'rust',
    jvm: 'jvm',
    ruby: 'ruby',
    remote: 'remote-validation'
  }

  return anchors[ecosystem] ?? ecosystem.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function sarifFingerprints(finding: Finding): Record<string, string> {
  return {
    primaryLocationLineHash: stableHash(
      [
        'deterministic-deps',
        SARIF_FINGERPRINT_VERSION,
        finding.ruleId,
        finding.file,
        finding.line.toString(),
        sanitizeDisplayValue(finding.message)
      ].join('\0')
    )
  }
}

function stableHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function renderPatch(root: string, findings: Finding[]): string {
  const replacements = findings
    .map((finding) => safeReplacement(finding))
    .filter((replacement): replacement is LineReplacement => Boolean(replacement))
    .map((replacement) => {
      const safeFile = normalizeWorkspaceRelativePath(root, replacement.file)
      if (!safeFile) {
        return undefined
      }

      return { replacement, safeFile }
    })
    .filter((value): value is { replacement: LineReplacement; safeFile: string } => Boolean(value))
    .filter(({ replacement, safeFile }) => replacementMatchesFile(root, safeFile, replacement))

  if (replacements.length === 0) {
    return ''
  }

  const lines: string[] = []
  for (const { replacement, safeFile } of replacements) {
    lines.push(
      `diff --git a/${safeFile} b/${safeFile}`,
      `--- a/${safeFile}`,
      `+++ b/${safeFile}`,
      `@@ -${replacement.line},1 +${replacement.line},1 @@`,
      `-${replacement.oldText}`,
      `+${replacement.newText}`
    )
  }

  lines.push('')
  return lines.join('\n')
}

function safeReplacement(finding: Finding): LineReplacement | undefined {
  const suggestion = finding.suggestion
  if (!suggestion?.safeToApply || !suggestion.replacement) {
    return undefined
  }

  if (
    !isSafeWorkspaceRelativePath(suggestion.replacement.file) ||
    replacementContainsUnsafeLineText(suggestion.replacement) ||
    replacementContainsCredentialMaterial(suggestion.replacement)
  ) {
    return undefined
  }

  return suggestion.replacement
}

function replacementContainsCredentialMaterial(replacement: LineReplacement): boolean {
  return (
    containsCredentialMaterial(replacement.oldText) ||
    containsCredentialMaterial(replacement.newText)
  )
}

function replacementContainsUnsafeLineText(replacement: LineReplacement): boolean {
  return /[\r\n]/.test(replacement.oldText) || /[\r\n]/.test(replacement.newText)
}

function replacementMatchesFile(
  root: string,
  safeFile: string,
  replacement: LineReplacement
): boolean {
  const filePath = path.join(root, safeFile)
  if (!fs.existsSync(filePath)) {
    return false
  }

  const line = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[replacement.line - 1]
  return line === replacement.oldText
}

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'high') {
    return 'error'
  }
  if (severity === 'medium') {
    return 'warning'
  }
  return 'note'
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('`', '\\`').replaceAll('\n', ' ')
}
