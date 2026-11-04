import { describe, expect, it } from 'vitest'
import { isNewer } from './ota'

describe('isNewer', () => {
  it('compares dotted versions numerically', () => {
    expect(isNewer('0.3.0', '0.1.1')).toBe(true)
    expect(isNewer('0.1.1', '0.3.0')).toBe(false)
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('1.0', '1.0.0')).toBe(false)
  })
})
