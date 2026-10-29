import { describe, expect, it } from 'vitest'
import { moneyMinorUnits, multiplyMoney, sumMoney } from './money'

describe('exact money arithmetic', () => {
  it('converts decimal amounts to integer minor units', () => {
    expect(moneyMinorUnits('12000')).toBe(1200000n)
    expect(moneyMinorUnits('0.09')).toBe(9n)
  })

  it('multiplies without floating-point rounding', () => {
    expect(multiplyMoney('19.99', 3)).toBe('59.97')
    expect(multiplyMoney('12000', 2)).toBe('24000.00')
  })

  it('sums decimal values exactly', () => {
    expect(sumMoney(['0.10', '0.20', '19.99'])).toBe('20.29')
    expect(sumMoney([])).toBe('0.00')
  })

  it('rejects invalid monetary values and quantities', () => {
    expect(() => moneyMinorUnits('1.234')).toThrow('Invalid monetary amount.')
    expect(() => moneyMinorUnits('NaN')).toThrow('Invalid monetary amount.')
    expect(() => multiplyMoney('2.00', 1.5)).toThrow('Quantity must be a non-negative whole number.')
  })
})
