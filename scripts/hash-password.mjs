// ใช้: node scripts/hash-password.mjs '<รหัสผ่าน>'
// พิมพ์ hash สำหรับ `npx wrangler secret put TEACHER_PASSWORD_HASH`
// อัลกอริทึมต้องตรงกับ src/server/auth/crypto.ts
const password = process.argv[2]
if (!password) {
  console.error("วิธีใช้: node scripts/hash-password.mjs '<รหัสผ่าน>'")
  process.exit(1)
}
const ITERATIONS = 100000
const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256)
const b64 = (u8) => Buffer.from(u8).toString('base64')
console.log(`pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`)
