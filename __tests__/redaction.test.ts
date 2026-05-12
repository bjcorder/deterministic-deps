import { containsCredentialMaterial, sanitizeDisplayValue } from '../src/redaction'

describe('credential redaction', () => {
  it('redacts URL userinfo and sensitive query parameters', () => {
    expect(
      sanitizeDisplayValue(
        'git+https://user:secret@example.com/acme/demo.git?token=abc123&ref=main'
      )
    ).toBe('git+https://[REDACTED]@example.com/acme/demo.git?token=[REDACTED]&ref=main')

    expect(
      sanitizeDisplayValue(
        'https://registry.example.com/image:latest?access_token=secret&sig=signature'
      )
    ).toBe('https://registry.example.com/image:latest?access_token=[REDACTED]&sig=[REDACTED]')
  })

  it('redacts bearer, basic, and authorization-style values', () => {
    expect(sanitizeDisplayValue('Authorization: Bearer abc.def.ghi')).toBe(
      'Authorization: Bearer [REDACTED]'
    )
    expect(sanitizeDisplayValue('auth=Basic abc123')).toBe('auth=Basic [REDACTED]')
    expect(sanitizeDisplayValue('Bearer abc123')).toBe('Bearer [REDACTED]')
  })

  it('redacts credential query parameter variants deterministically', () => {
    expect(
      sanitizeDisplayValue(
        'https://example.com/repo.git?private_token=one&private-token=two&githubToken=three'
      )
    ).toBe(
      'https://example.com/repo.git?private_token=[REDACTED]&private-token=[REDACTED]&githubToken=[REDACTED]'
    )

    expect(
      sanitizeDisplayValue(
        'https://example.com/repo.git?clientSecret=four&X-Amz-Credential=five&X-Amz-Signature=six'
      )
    ).toBe(
      'https://example.com/repo.git?clientSecret=[REDACTED]&X-Amz-Credential=[REDACTED]&X-Amz-Signature=[REDACTED]'
    )
  })

  it('leaves ordinary query parameters unchanged', () => {
    expect(
      sanitizeDisplayValue(
        'https://example.com/repo.git?ref=main&rev=abc123&branch=release&version=1.2.3&checksum=abc'
      )
    ).toBe(
      'https://example.com/repo.git?ref=main&rev=abc123&branch=release&version=1.2.3&checksum=abc'
    )
  })

  it('detects credential material without flagging ordinary refs', () => {
    expect(containsCredentialMaterial('https://user:secret@example.com/repo.git')).toBe(true)
    expect(containsCredentialMaterial('https://example.com/repo.git?private_token=secret')).toBe(
      true
    )
    expect(containsCredentialMaterial('https://example.com/repo.git?ref=main')).toBe(false)
    expect(containsCredentialMaterial('actions/checkout@v4')).toBe(false)
  })
})
