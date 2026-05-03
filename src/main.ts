import * as core from '@actions/core'
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from './constants'
import {
  loadConfigWithDiagnostics,
  normalizeBooleanInput,
  normalizeModeInput,
  normalizePositiveIntegerInput,
  normalizeSeverityInput,
  splitPatterns
} from './config'
import { countBySeverity, writeReports } from './report'
import { scan, resolveScanRoot } from './scanner'
import { shouldReportFailure } from './rules'

async function run(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const scanRoot = resolveScanRoot(workspace, core.getInput('path') || '.')
  const configPath = core.getInput('config') || '.deterministic-deps.yml'
  const { config, diagnostics } = loadConfigWithDiagnostics(scanRoot, configPath)
  for (const diagnostic of diagnostics) {
    core.warning(diagnostic.message)
  }

  const modeInput = normalizeModeInput(core.getInput('mode'), config.mode ?? 'advisory')
  const severityThresholdInput = normalizeSeverityInput(
    core.getInput('severity-threshold'),
    config.severityThreshold ?? 'low'
  )
  const sarifInput = normalizeBooleanInput(core.getInput('sarif'), 'sarif', true)
  const patchInput = normalizeBooleanInput(core.getInput('patch'), 'patch', config.patch ?? false)
  const remoteValidationInput = normalizeBooleanInput(
    core.getInput('remote-validation'),
    'remote-validation',
    config.remoteValidation ?? false
  )
  const remoteValidationTimeoutMsInput = normalizePositiveIntegerInput(
    core.getInput('remote-timeout-ms'),
    'remote-timeout-ms',
    config.remoteValidationTimeoutMs ?? 5000
  )
  const remoteValidationRetriesInput = normalizePositiveIntegerInput(
    core.getInput('remote-retries'),
    'remote-retries',
    config.remoteValidationRetries ?? 1
  )

  for (const diagnostic of [
    ...modeInput.diagnostics,
    ...severityThresholdInput.diagnostics,
    ...sarifInput.diagnostics,
    ...patchInput.diagnostics,
    ...remoteValidationInput.diagnostics,
    ...remoteValidationTimeoutMsInput.diagnostics,
    ...remoteValidationRetriesInput.diagnostics
  ]) {
    core.warning(diagnostic.message)
  }

  const mode = modeInput.value
  const severityThreshold = severityThresholdInput.value
  const include = splitPatterns(core.getInput('include'))
  const exclude = splitPatterns(core.getInput('exclude'))
  const sarif = sarifInput.value
  const patch = patchInput.value
  const remoteValidation = remoteValidationInput.value
  const remoteValidationTimeoutMs = remoteValidationTimeoutMsInput.value
  const remoteValidationRetries = remoteValidationRetriesInput.value

  const result = await scan({
    root: scanRoot,
    include: include.length > 0 ? include : (config.include ?? DEFAULT_INCLUDE),
    exclude: exclude.length > 0 ? exclude : (config.exclude ?? DEFAULT_EXCLUDE),
    config: {
      ...config,
      remoteValidation,
      remoteValidationTimeoutMs,
      remoteValidationRetries
    }
  })

  for (const finding of result.findings) {
    core.warning(`${finding.message} ${finding.remediation}`, {
      file: finding.file,
      startLine: finding.line,
      title: finding.ruleId
    })
  }

  const reports = writeReports(scanRoot, result.findings, sarif, patch)
  const counts = countBySeverity(result.findings)

  core.setOutput('finding-count', result.findings.length.toString())
  core.setOutput('high-count', counts.high.toString())
  core.setOutput('medium-count', counts.medium.toString())
  core.setOutput('low-count', counts.low.toString())
  core.setOutput('report-path', reports.markdownPath)
  core.setOutput('sarif-path', reports.sarifPath ?? '')
  core.setOutput('patch-path', reports.patchPath ?? '')

  await writeSummary(
    result.scannedFiles.length,
    result.findings.length,
    counts,
    reports.markdownPath
  )

  if (mode === 'enforce' && shouldReportFailure(result.findings, severityThreshold)) {
    core.setFailed(
      `deterministic-deps found ${result.findings.length} finding(s) at or above ${severityThreshold} severity.`
    )
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})

async function writeSummary(
  scannedFiles: number,
  findingCount: number,
  counts: { high: number; medium: number; low: number },
  markdownPath: string
): Promise<void> {
  try {
    await core.summary
      .addHeading('deterministic-deps')
      .addRaw(`Scanned ${scannedFiles} files.\n\n`)
      .addRaw(
        `Findings: ${findingCount} (${counts.high} high, ${counts.medium} medium, ${counts.low} low)\n\n`
      )
      .addRaw(`Report: ${markdownPath}\n`)
      .write()
  } catch (error) {
    core.warning(
      `Unable to write job summary: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
