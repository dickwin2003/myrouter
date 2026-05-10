// ============ 定价规则数据库操作 ============

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

// 内存缓存
let pricingCache = null
let pricingCacheTime = 0
const PRICING_CACHE_TTL = 5 * 60 * 1000 // 5 分钟

/**
 * 获取所有定价规则
 */
export async function getAllPricingRules(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return []
  try {
    const response = await fetch(
      supabaseUrl(env, 'pricing_rules', '?order=api_url,created_at.desc'),
      { headers: supabaseHeaders(env) }
    )
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

/**
 * 获取指定 API URL 的定价规则（带缓存）
 */
export async function getPricingForApi(env, apiUrl) {
  // 检查缓存
  const now = Date.now()
  if (pricingCache && (now - pricingCacheTime) < PRICING_CACHE_TTL) {
    return pricingCache.filter(r => r.api_url === apiUrl)
  }

  // 刷新缓存
  const allRules = await getAllPricingRules(env)
  pricingCache = allRules
  pricingCacheTime = now
  return allRules.filter(r => r.api_url === apiUrl)
}

/**
 * 创建定价规则
 */
export async function createPricingRule(env, { apiUrl, modelPattern, inputRate, outputRate, isDefault }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'pricing_rules'),
      {
        method: 'POST',
        headers: supabaseHeaders(env, 'return=representation'),
        body: JSON.stringify({
          api_url: apiUrl,
          model_pattern: modelPattern || '*',
          input_rate: inputRate || 0,
          output_rate: outputRate || 0,
          is_default: isDefault || false,
        }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    const data = await response.json()
    // 清除缓存
    pricingCache = null
    return { success: true, data: data[0] || data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 更新定价规则
 */
export async function updatePricingRule(env, ruleId, updates) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'pricing_rules', `?id=eq.${ruleId}`),
      {
        method: 'PATCH',
        headers: supabaseHeaders(env),
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    pricingCache = null
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 删除定价规则
 */
export async function deletePricingRule(env, ruleId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }
  try {
    const response = await fetch(
      supabaseUrl(env, 'pricing_rules', `?id=eq.${ruleId}`),
      {
        method: 'DELETE',
        headers: supabaseHeaders(env),
      }
    )
    if (!response.ok) return { success: false, error: await response.text() }
    pricingCache = null
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
