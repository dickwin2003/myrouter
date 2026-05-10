// ============ 管理员用户/定价 API ============

import { jsonResponse, verifyAdmin } from '../utils/helpers.js'
import { getAllUsers, updateUser, addBalance, createTransaction, getAllTransactions, getAllUsageRecords } from '../db/user-db.js'
import { getAllPricingRules, createPricingRule, updatePricingRule, deletePricingRule } from '../db/pricing-db.js'

/**
 * 处理管理员用户管理 API（/api/admin/users*）
 */
export async function handleAdminUserApi(request, env, url) {
  if (!verifyAdmin(request, env)) {
    return jsonResponse({ error: '未授权' }, 401)
  }

  const path = url.pathname

  // 用户列表
  if (path === '/api/admin/users' && request.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const users = await getAllUsers(env, limit, offset)
    // 不返回密码信息
    const safeUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      balance: u.balance,
      role: u.role,
      status: u.status,
      api_key: u.api_key,
      stripe_customer_id: u.stripe_customer_id,
      created_at: u.created_at,
    }))
    return jsonResponse({ users: safeUsers })
  }

  // 更新用户
  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === 'PATCH') {
    const userId = parseInt(path.split('/').pop(), 10)
    return handleAdminUpdateUser(request, env, userId)
  }

  // 调整余额
  if (path.match(/^\/api\/admin\/users\/\d+\/balance$/) && request.method === 'POST') {
    const userId = parseInt(path.split('/')[4], 10)
    return handleAdminAdjustBalance(request, env, userId)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

/**
 * 处理管理员定价 API（/api/admin/pricing*）
 */
export async function handleAdminPricingApi(request, env, url) {
  if (!verifyAdmin(request, env)) {
    return jsonResponse({ error: '未授权' }, 401)
  }

  const path = url.pathname

  // 定价规则列表
  if (path === '/api/admin/pricing' && request.method === 'GET') {
    const rules = await getAllPricingRules(env)
    return jsonResponse({ rules })
  }

  // 创建定价规则
  if (path === '/api/admin/pricing' && request.method === 'POST') {
    return handleCreatePricing(request, env)
  }

  // 更新定价规则
  if (path.match(/^\/api\/admin\/pricing\/\d+$/) && request.method === 'PATCH') {
    const ruleId = parseInt(path.split('/').pop(), 10)
    return handleUpdatePricing(request, env, ruleId)
  }

  // 删除定价规则
  if (path.match(/^\/api\/admin\/pricing\/\d+$/) && request.method === 'DELETE') {
    const ruleId = parseInt(path.split('/').pop(), 10)
    const result = await deletePricingRule(env, ruleId)
    if (!result.success) return jsonResponse({ error: result.error }, 500)
    return jsonResponse({ success: true })
  }

  // 所有用量记录
  if (path === '/api/admin/usage' && request.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const records = await getAllUsageRecords(env, limit, offset)
    return jsonResponse({ records })
  }

  // 所有交易记录
  if (path === '/api/admin/transactions' && request.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const transactions = await getAllTransactions(env, limit, offset)
    return jsonResponse({ transactions })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

async function handleAdminUpdateUser(request, env, userId) {
  try {
    const body = await request.json()
    const updates = {}

    if ('status' in body) updates.status = body.status
    if ('role' in body) updates.role = body.role
    if ('display_name' in body) updates.display_name = body.display_name

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: '没有需要更新的字段' }, 400)
    }

    const result = await updateUser(env, userId, updates)
    if (!result.success) return jsonResponse({ error: result.error }, 500)
    return jsonResponse({ success: true })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

async function handleAdminAdjustBalance(request, env, userId) {
  try {
    const body = await request.json()
    const amount = parseFloat(body.amount)

    if (!amount || amount === 0) {
      return jsonResponse({ error: '金额不能为零' }, 400)
    }

    const result = await addBalance(env, userId, amount)
    if (!result.success) return jsonResponse({ error: result.error }, 500)

    await createTransaction(env, {
      userId,
      type: 'admin_adjust',
      amount,
      balanceAfter: result.balance,
      description: body.description || `管理员调整余额 ${amount > 0 ? '+' : ''}${amount}`,
    })

    return jsonResponse({ success: true, balance: result.balance })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

async function handleCreatePricing(request, env) {
  try {
    const body = await request.json()
    const { api_url, model_pattern, input_rate, output_rate, is_default } = body

    if (!api_url) {
      return jsonResponse({ error: 'API URL 不能为空' }, 400)
    }

    const result = await createPricingRule(env, {
      apiUrl: api_url,
      modelPattern: model_pattern || '*',
      inputRate: parseFloat(input_rate) || 0,
      outputRate: parseFloat(output_rate) || 0,
      isDefault: is_default || false,
    })

    if (!result.success) return jsonResponse({ error: result.error }, 500)
    return jsonResponse({ success: true, data: result.data })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}

async function handleUpdatePricing(request, env, ruleId) {
  try {
    const body = await request.json()
    const updates = {}

    if ('api_url' in body) updates.api_url = body.api_url
    if ('model_pattern' in body) updates.model_pattern = body.model_pattern
    if ('input_rate' in body) updates.input_rate = parseFloat(body.input_rate)
    if ('output_rate' in body) updates.output_rate = parseFloat(body.output_rate)
    if ('is_default' in body) updates.is_default = body.is_default

    const result = await updatePricingRule(env, ruleId, updates)
    if (!result.success) return jsonResponse({ error: result.error }, 500)
    return jsonResponse({ success: true })
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400)
  }
}
