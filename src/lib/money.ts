export function moneyMinorUnits(value: string | number): bigint {
  const [whole, fraction = ''] = String(value).trim().split('.')
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) {
    throw new Error('Invalid monetary amount.')
  }
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function multiplyMoney(value: string | number, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative whole number.')
  }
  const amount = moneyMinorUnits(value) * BigInt(quantity)
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`
}

export function sumMoney(values: (string | number)[]): string {
  const amount = values.reduce((sum, value) => sum + moneyMinorUnits(value), 0n)
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`
}
