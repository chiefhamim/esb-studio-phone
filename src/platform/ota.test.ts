// @vitest-environment jsdom
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

describe('OTA floor (no downgrade after a rollback)', () => {
  it('starts at 0.0.0 and is what checkForUpdate compares with', async () => {
    const { otaFloor, isNewer } = await import('./ota')
    localStorage.removeItem('esb-phone/ota-floor')
    expect(otaFloor()).toBe('0.0.0')
    localStorage.setItem('esb-phone/ota-floor', '1.4.2')
    expect(isNewer('1.4.1', otaFloor())).toBe(false)
    expect(isNewer('1.4.3', otaFloor())).toBe(true)
  })
})
