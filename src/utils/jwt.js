// ============ JWT 与密码工具 ============

import { JWT_EXPIRES_IN } from '../config.js'

/**
 * 生成随机盐值
 */
export function generateSalt(length = 32) {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * SHA-256 哈希（密码 + 盐）
 */
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 验证密码
 */
export async function verifyPassword(password, salt, storedHash) {
  const hash = await hashPassword(password, salt)
  return hash === storedHash
}

/**
 * Base64URL 编码
 */
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 签名 JWT（HMAC-SHA256）
 */
export async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()

  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  const signatureB64 = base64UrlEncode(signature)

  return `${signingInput}.${signatureB64}`
}

/**
 * 验证并解码 JWT
 * @returns {object|null} payload 或 null（无效/过期）
 */
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const encoder = new TextEncoder()
    const [headerB64, payloadB64, signatureB64] = parts
    const signingInput = `${headerB64}.${payloadB64}`

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const signature = base64UrlDecode(signatureB64)
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(signingInput))
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

/**
 * 创建用户 JWT Token
 */
export async function createUserToken(userId, email, role, secret) {
  const payload = {
    sub: userId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN,
  }
  return signJWT(payload, secret)
}

/**
 * 生成用户 API Key（sk-ar-user-xxx 格式）
 */
export function generateUserApiKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'sk-ar-user-'
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
