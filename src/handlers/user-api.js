// ============ 用户 API 处理器 ============

import { jsonResponse, verifyUser } from '../utils/helpers.js'
import { hashPassword, verifyPassword, generateSalt, createUserToken, generateUserApiKey } from '../utils/jwt.js'
import { generateSkAlias } from '../db/supabase.js'
import {
  findUserByEmail, createUser, getUserById, updateUser,
  getUserKeys, createUserKey, updateUserKey, deleteUserKey, updateUserKeySkAlias,
  getUserTransactions, getUserUsageRecords,
  createStripeSession,
} from '../db/user-db.js'
import { createCheckoutSession } from '../utils/stripe.js'
import { getAllPricingRules } from '../db/pricing-db.js'

/**
 * 处理认证 API（/api/auth/*）
 */
export async function handleAuthApi(request, env, url) {
  const path = url.pathname

  if (path === '/api/auth/register' && request.method === 'POST') {
    return handleRegister(request, env)
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    return handleLogin(request, env)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

/**
 * 处理用户 API（/api/user/*）
 */
export async function handleUserApi(request, env, url) {
  const user = await verifyUser(request, env)
  if (!user) {
    return jsonResponse({ error: '未授权，请先登录' }, 401)
  }

  const path = url.pathname

  // 用户资料
  if (path === '/api/user/profile' && request.method === 'GET') {
    return handleGetProfile(env, user)
  }
  if (path === '/api/user/profile' && request.method === 'PATCH') {
    return handleUpdateProfile(request, env, user)
  }

  // 用户密钥
  if (path === '/api/user/keys' && request.method === 'GET') {
    return handleGetKeys(env, user)
  }
  if (path === '/api/user/keys' && request.method === 'POST') {
    return handleCreateKey(request, env, user)
  }
  if (path.startsWith('/api/user/keys/') && request.method === 'PATCH') {
    const keyId = path.split('/').pop()
    return handleUpdateKey(request, env, user, keyId)
  }
  if (path.startsWith('/api/user/keys/') && request.method === 'DELETE') {
    const keyId = path.split('/').pop()
    return handleDeleteKey(env, user, keyId)
  }

  // SK 别名
  if (path.endsWith('/sk-alias') && request.method === 'POST') {
    const parts = path.split('/')
    const keyId = parts[parts.length - 2]
    return handleGenerateSkAlias(env, user, keyId)
  }

  // 用量记录
  if (path === '/api/user/usage' && request.method === 'GET') {
    return handleGetUsage(env, url, user)
  }

  // 交易记录
  if (path === '/api/user/transactions' && request.method === 'GET') {
    return handleGetTransactions(env, url, user)
  }

  // 充值
  if (path === '/api/user/topup' && request.method === 'POST') {
    return handleTopup(request, env, user)
  }

  // 定价查询
  if (path === '/api/user/pricing' && request.method === 'GET') {
    return handleGetPricing(env)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

// ============ 认证处理 ============

async function handleRegister(request, env) {
  try {
    const body = await request.json()
    const { email, password, display_name } = body

    if (!email || !password) {
      return jsonResponse({ error: '邮箱和密码不能为空' }, 400)
    }
    if (password.length < 8) {
      return jsonResponse({ error: '密码至少 8 位' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: '邮箱格式无效' }, 400)
    }

    // 检查邮箱是否已注册
    const existing = await findUserByEmail(env, email)
    if (existing) {
      return jsonResponse({ error: '该邮箱已被注册' }, 409)
    }

    // 哈希密码
    const salt = generateSalt()
    const passwordHash = await hashPassword(password, salt)
    const apiKey = generateUserApiKey()

    const result = await createUser(env, {
      email,
      passwordHash,
      passwordSalt: salt,
      displayName: display_name || null,
      apiKey,
    })

    if (!result.success) {
      return jsonResponse({ error: result.error }, 500)
    }

    // 生成 JWT
    const token = await createUserToken(result.data.id, email, 'user', env.JWT_SECRET)

    return jsonResponse({
      success: true,
      token,
      user: {
        id: result.data.id,
        email,
        display_name: display_name || null,
        api_key: apiKey,
        balance: 0,
      },
    })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

async function handleLogin(request, env) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return jsonResponse({ error: '邮箱和密码不能为空' }, 400)
    }

    const user = await findUserByEmail(env, email)
    if (!user) {
      return jsonResponse({ error: '邮箱或密码错误' }, 401)
    }

    if (user.status !== 'active') {
      return jsonResponse({ error: '账户已被禁用，请联系管理员' }, 403)
    }

    const valid = await verifyPassword(password, user.password_salt, user.password_hash)
    if (!valid) {
      return jsonResponse({ error: '邮箱或密码错误' }, 401)
    }

    const token = await createUserToken(user.id, user.email, user.role, env.JWT_SECRET)

    return jsonResponse({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        api_key: user.api_key,
        balance: user.balance,
        role: user.role,
      },
    })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

// ============ 用户资料 ============

async function handleGetProfile(env, user) {
  const dbUser = await getUserById(env, user.userId)
  if (!dbUser) {
    return jsonResponse({ error: '用户不存在' }, 404)
  }
  return jsonResponse({
    id: dbUser.id,
    email: dbUser.email,
    display_name: dbUser.display_name,
    api_key: dbUser.api_key,
    balance: dbUser.balance,
    role: dbUser.role,
    created_at: dbUser.created_at,
  })
}

async function handleUpdateProfile(request, env, user) {
  try {
    const body = await request.json()
    const updates = {}

    if ('display_name' in body) {
      updates.display_name = body.display_name
    }

    if ('password' in body) {
      if (body.password.length < 8) {
        return jsonResponse({ error: '密码至少 8 位' }, 400)
      }
      const salt = generateSalt()
      updates.password_hash = await hashPassword(body.password, salt)
      updates.password_salt = salt
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: '没有需要更新的字段' }, 400)
    }

    const result = await updateUser(env, user.userId, updates)
    if (!result.success) {
      return jsonResponse({ error: result.error }, 500)
    }

    return jsonResponse({ success: true })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

// ============ 用户密钥 ============

async function handleGetKeys(env, user) {
  const keys = await getUserKeys(env, user.userId)
  // 不返回完整 token，只显示前后几位
  const safeKeys = keys.map(k => ({
    ...k,
    token: k.token ? k.token.substring(0, 6) + '***' + k.token.substring(k.token.length - 4) : '',
  }))
  return jsonResponse({ keys: safeKeys })
}

async function handleCreateKey(request, env, user) {
  try {
    const body = await request.json()
    const { api_url, token, enabled, remark, expires_at } = body

    if (!api_url || !token) {
      return jsonResponse({ error: 'API URL 和 Token 不能为空' }, 400)
    }

    const result = await createUserKey(env, user.userId, {
      apiUrl: api_url,
      token,
      enabled: enabled !== false,
      remark: remark || null,
      expiresAt: expires_at || null,
    })

    if (!result.success) {
      return jsonResponse({ error: result.error }, 500)
    }

    return jsonResponse({ success: true, data: result.data })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

async function handleUpdateKey(request, env, user, keyId) {
  try {
    const body = await request.json()
    const updates = {}

    if ('api_url' in body) updates.api_url = body.api_url
    if ('token' in body) updates.token = body.token
    if ('enabled' in body) updates.enabled = body.enabled
    if ('remark' in body) updates.remark = body.remark
    if ('expires_at' in body) updates.expires_at = body.expires_at

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: '没有需要更新的字段' }, 400)
    }

    const result = await updateUserKey(env, parseInt(keyId), user.userId, updates)
    if (!result.success) {
      return jsonResponse({ error: result.error }, 500)
    }

    return jsonResponse({ success: true })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

async function handleDeleteKey(env, user, keyId) {
  const result = await deleteUserKey(env, parseInt(keyId), user.userId)
  if (!result.success) {
    return jsonResponse({ error: result.error }, 500)
  }
  return jsonResponse({ success: true })
}

async function handleGenerateSkAlias(env, user, keyId) {
  const skAlias = generateSkAlias()
  const result = await updateUserKeySkAlias(env, parseInt(keyId), user.userId, skAlias)
  if (!result.success) {
    return jsonResponse({ error: result.error }, 500)
  }
  return jsonResponse({ success: true, sk_alias: skAlias })
}

// ============ 用量 & 交易 ============

async function handleGetUsage(env, url, user) {
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const records = await getUserUsageRecords(env, user.userId, limit, offset)
  return jsonResponse({ records })
}

async function handleGetTransactions(env, url, user) {
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const transactions = await getUserTransactions(env, user.userId, limit, offset)
  return jsonResponse({ transactions })
}

// ============ 充值 ============

async function handleTopup(request, env, user) {
  try {
    const body = await request.json()
    const amount = parseFloat(body.amount)

    if (!amount || amount < 1) {
      return jsonResponse({ error: '充值金额至少 $1' }, 400)
    }

    const dbUser = await getUserById(env, user.userId)
    const result = await createCheckoutSession(env, {
      userId: user.userId,
      userEmail: dbUser.email,
      amount,
    })

    if (!result.success) {
      return jsonResponse({ error: result.error }, 500)
    }

    // 记录会话
    await createStripeSession(env, {
      userId: user.userId,
      sessionId: result.sessionId,
      amount,
    })

    return jsonResponse({ success: true, url: result.url })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

// ============ 定价查询 ============

async function handleGetPricing(env) {
  const rules = await getAllPricingRules(env)
  return jsonResponse({ rules })
}
