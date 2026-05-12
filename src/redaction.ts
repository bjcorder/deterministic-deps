import { Finding } from './types'

const REDACTED = '[REDACTED]'
const SENSITIVE_QUERY_KEYS = [
  'token',
  'access_token',
  'password',
  'passwd',
  'pwd',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'key',
  'auth',
  'authorization',
  'signature',
  'sig'
]

const SENSITIVE_QUERY_PATTERN = new RegExp(
  `([?&;])(${SENSITIVE_QUERY_KEYS.map(escapeRegExp).join('|')})(=)([^&#\\s'"<>)]*)`,
  'gi'
)

export function sanitizeDisplayValue(value: string): string {
  return value
    .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/\s'"<>@]+@)/g, `$1${REDACTED}@`)
    .replace(/\b([^/\s'"<>:@]+:[^/\s'"<>@]+@)([A-Za-z0-9.-]+(?::\d+)?\/)/g, `${REDACTED}@$2`)
    .replace(SENSITIVE_QUERY_PATTERN, `$1$2$3${REDACTED}`)
    .replace(
      /\b(Authorization\s*[:=]\s*)(Bearer|Basic)?\s*[^,\s'"<>)}\]]+/gi,
      (_match, prefix: string, scheme?: string) =>
        `${prefix}${scheme ? `${scheme} ` : ''}${REDACTED}`
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
}

export function sanitizeFinding(finding: Finding): Finding {
  return {
    ...finding,
    message: sanitizeDisplayValue(finding.message),
    remediation: sanitizeDisplayValue(finding.remediation),
    suggestion: finding.suggestion
      ? {
          ...finding.suggestion,
          title: sanitizeDisplayValue(finding.suggestion.title)
        }
      : undefined
  }
}

export function containsCredentialMaterial(value: string): boolean {
  return sanitizeDisplayValue(value) !== value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
