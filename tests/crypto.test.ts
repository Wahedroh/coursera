import { describe, expect, it } from 'vitest'
import { hashSecret, randomToken, sha256Hex, verifySecret } from '../src/server/auth/crypto'

// สร้างด้วย: node scripts/hash-password.mjs teacher-pass
const NODE_HASH = 'pbkdf2-sha256$100000$/knLWP0ZF61fbkV9ukJ9OA==$0fPm3yZWNV/s2l++wE67w57aYKw5wIAwoB4tLbmLdDk='

describe('crypto', () => {
  it('hash แล้ว verify ได้', async () => {
    const h = await hashSecret('1234')
    expect(await verifySecret('1234', h)).toBe(true)
    expect(await verifySecret('1235', h)).toBe(false)
  })

  it('hash ขึ้นต้นด้วย pbkdf2-sha256$100000$ และ salt ต่างกันทุกครั้ง', async () => {
    const a = await hashSecret('1234')
    const b = await hashSecret('1234')
    expect(a.startsWith('pbkdf2-sha256$100000$')).toBe(true)
    expect(a.split('$')[2]).not.toBe(b.split('$')[2])
  })

  it('stored ผิดรูปแบบคืน false', async () => {
    expect(await verifySecret('x', 'garbage')).toBe(false)
    expect(await verifySecret('x', 'pbkdf2-sha256$abc$$')).toBe(false)
  })

  it('hash จากสคริปต์ Node ใช้กับ verifySecret ได้', async () => {
    expect(await verifySecret('teacher-pass', NODE_HASH)).toBe(true)
  })

  it('randomToken ไม่ซ้ำและยาว 43 ตัว', () => {
    const a = randomToken()
    expect(a).toHaveLength(43)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(randomToken()).not.toBe(a)
  })

  it('sha256Hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
