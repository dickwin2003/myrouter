// ============ 用户数据库操作 ============

// Supabase REST API 请求封装
function supabaseUrl(env, table, query = '') {
  return `${env.SUPABASE_URL}/rest/v1/${table}${query}`
}

function supabaseHeaders(env, prefer = '') {
  const headers = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers['Prefer'] = prefer
  return headers
}

// ============ 用户操作 ============

/**
 * 通过邮箱查找用户
 */
export async function findUserByEmail(env, email) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'users', `?email=eq.${encodeURIComponent(email)}&limit=1`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

/**
 * 通过 API Key 查找用户
 */
export async function findUserByApiKey(env, apiKey) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'users', `?api_key=eq.${encodeURIComponent(apiKey)}&status=eq.active&limit=1`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

/**
 * 通过 ID 查找用户
 */
export async function getUserById(env, userId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'users', `?id=eq.${userId}&limit=1`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

/**
 * 创建用户
 */
export async function createUser(env, { email, passwordHash, passwordSalt, displayName, apiKey }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'users'),
      {
        method: 'POST',
        headers: supabaseHeaders(env, 'return=representation'),
        body: JSON.stringify({
          email,
          password_hash: passwordHash,
          password_salt: passwordSalt,
          display_name: displayName || null,
          api_key: apiKey,
        }),
      }
    )
    if (!response.ok) {
      const errText = await response.text()
      if (errText.includes('duplicate') || errText.includes('unique')) {
        return { success: false, error: '该邮箱已被注册' }
      }
      return { success: false, error: errText }
    }
    const data = await response.json()
    return { success: true, data: data[0] || data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 更新用户信息
 */
export async function updateUser(env, userId, updates) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'users', `?id=eq.${userId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 扣减用户余额（原子操作，仅在余额充足时成功）
 */
export async function deductBalance(env, userId, cost) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    // 使用 RPC 或条件更新确保原子性
    // Supabase REST API 支持 PATCH 带 filter
    // 先查当前余额
    const user = await getUserById(env, userId)
    if (!user) return { success: false, error: 'User not found' }
    if (user.balance < cost) return { success: false, error: 'Insufficient balance' }

    const newBalance = Math.round((user.balance - cost) * 1000000) / 1000000
    const response = await fetch(
      supabaseUrl(env, 'users', `?id=eq.${userId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    return { success: true, balance: newBalance }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 增加用户余额
 */
export async function addBalance(env, userId, amount) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const user = await getUserById(env, userId)
    if (!user) return { success: false, error: 'User not found' }

    const newBalance = Math.round((user.balance + amount) * 1000000) / 1000000
    const response = await fetch(
      supabaseUrl(env, 'users', `?id=eq.${userId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    return { success: true, balance: newBalance }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 获取所有用户列表（管理员用）
 */
export async function getAllUsers(env, limit = 50, offset = 0) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'users', `?order=created_at.desc&limit=${limit}&offset=${offset}`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

// ============ 用户密钥操作 ============

/**
 * 获取用户的所有密钥
 */
export async function getUserKeys(env, userId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'user_keys', `?user_id=eq.${userId}&deleted_at=is.null&order=created_at.desc`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

/**
 * 获取用户指定 URL 的启用的密钥
 */
export async function getUserEnabledKeysForUrl(env, userId, apiUrl) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'user_keys', `?user_id=eq.${userId}&api_url=eq.${encodeURIComponent(apiUrl)}&enabled=eq.true&deleted_at=is.null`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

/**
 * 创建用户密钥
 */
export async function createUserKey(env, userId, { apiUrl, token, enabled, remark, expiresAt }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'user_keys'),
      {
        method: 'POST',
        headers: supabaseHeaders(env, 'return=representation'),
        body: JSON.stringify({
          user_id: userId,
          api_url: apiUrl,
          token,
          enabled: enabled !== false,
          remark: remark || null,
          expires_at: expiresAt || null,
        }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    const data = await response.json()
    return { success: true, data: data[0] || data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 更新用户密钥
 */
export async function updateUserKey(env, keyId, userId, updates) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'user_keys', `?id=eq.${keyId}&user_id=eq.${userId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 软删除用户密钥
 */
export async function deleteUserKey(env, keyId, userId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'user_keys', `?id=eq.${keyId}&user_id=eq.${userId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 更新用户密钥的 SK 别名
 */
export async function updateUserKeySkAlias(env, keyId, userId, skAlias) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'user_keys', `?id=eq.${keyId}&user_id=eq.${userId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env, 'return=representation'),
        body: JSON.stringify({ sk_alias: skAlias, updated_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    const data = await response.json()
    return { success: true, data: data[0] || data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ============ 交易记录 ============

/**
 * 创建交易记录
 */
export async function createTransaction(env, { userId, type, amount, balanceAfter, stripeSessionId, description }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'transactions'),
      {
        method: 'POST',
        headers: supabaseHeaders(env),
        body: JSON.stringify({
          user_id: userId,
          type,
          amount,
          balance_after: balanceAfter,
          stripe_session_id: stripeSessionId || null,
          description: description || null,
        }),
      }
    )
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * 获取用户交易记录
 */
export async function getUserTransactions(env, userId, limit = 20, offset = 0) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'transactions', `?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

/**
 * 获取所有交易记录（管理员用）
 */
export async function getAllTransactions(env, limit = 50, offset = 0) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'transactions', `?order=created_at.desc&limit=${limit}&offset=${offset}`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

// ============ 用量记录 ============

/**
 * 创建用量记录
 */
export async function createUsageRecord(env, { userId, apiUrl, model, inputTokens, outputTokens, cost, keyId, keyType }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'usage_records'),
      {
        method: 'POST',
        headers: supabaseHeaders(env),
        body: JSON.stringify({
          user_id: userId,
          api_url: apiUrl,
          model: model || null,
          input_tokens: inputTokens || 0,
          output_tokens: outputTokens || 0,
          cost,
          key_id: keyId || null,
          key_type: keyType || 'shared',
        }),
      }
    )
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * 获取用户用量记录
 */
export async function getUserUsageRecords(env, userId, limit = 20, offset = 0) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'usage_records', `?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

/**
 * 获取所有用量记录（管理员用）
 */
export async function getAllUsageRecords(env, limit = 50, offset = 0) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'usage_records', `?order=created_at.desc&limit=${limit}&offset=${offset}`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

// ============ Stripe 会话 ============

/**
 * 创建 Stripe 会话记录
 */
export async function createStripeSession(env, { userId, sessionId, amount }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'stripe_sessions'),
      {
        method: 'POST',
        headers: supabaseHeaders(env),
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          amount,
        }),
      }
    )
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * 通过 Session ID 查找 Stripe 会话
 */
export async function findStripeSession(env, sessionId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null
  try {
    const response = await fetch(
      supabaseUrl(env, 'stripe_sessions', `?session_id=eq.${encodeURIComponent(sessionId)}&limit=1`),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

/**
 * 标记 Stripe 会话完成
 */
export async function completeStripeSession(env, sessionId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return
  try {
    await fetch(
      supabaseUrl(env, 'stripe_sessions', `?session_id=eq.${encodeURIComponent(sessionId)}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }),
      }
    )
  } catch { /* ignore */ }
}
