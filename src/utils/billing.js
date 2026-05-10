// ============ 计费工具 ============

import { DEFAULT_INPUT_RATE, DEFAULT_OUTPUT_RATE } from '../config.js'
import { getPricingForApi } from '../db/pricing-db.js'
import { deductBalance, createTransaction, createUsageRecord } from '../db/user-db.js'

/**
 * 从响应中提取 Token 用量
 * 兼容 OpenAI 和 Anthropic 格式
 */
export function extractTokens(responseBody, apiUrl) {
  try {
    const data = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody
    let inputTokens = 0
    let outputTokens = 0

    if (data.usage) {
      // OpenAI 格式
      inputTokens = data.usage.prompt_tokens || data.usage.input_tokens || 0
      outputTokens = data.usage.completion_tokens || data.usage.output_tokens || 0
    }

    return {
      inputTokens,
      outputTokens,
      model: data.model || null,
    }
  } catch {
    return { inputTokens: 0, outputTokens: 0, model: null }
  }
}

/**
 * 从请求 body 中提取 model 名称
 */
export function extractModelFromRequest(requestBody) {
  try {
    const data = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody
    return data.model || null
  } catch {
    return null
  }
}

/**
 * Glob 模式匹配模型名称
 */
function matchModel(model, pattern) {
  if (pattern === '*') return true
  const regex = new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$',
    'i'
  )
  return regex.test(model)
}

/**
 * 查找匹配的定价规则
 */
export async function findPricing(env, apiUrl, model) {
  const rules = await getPricingForApi(env, apiUrl)
  if (!rules || rules.length === 0) {
    return {
      input_rate: DEFAULT_INPUT_RATE,
      output_rate: DEFAULT_OUTPUT_RATE,
    }
  }

  // 精确匹配优先，然后通配符，最后默认
  for (const rule of rules) {
    if (!rule.is_default && matchModel(model || '', rule.model_pattern)) {
      return rule
    }
  }

  const defaultRule = rules.find(r => r.is_default)
  if (defaultRule) return defaultRule

  return {
    input_rate: DEFAULT_INPUT_RATE,
    output_rate: DEFAULT_OUTPUT_RATE,
  }
}

/**
 * 计算费用
 */
export function calculateCost(inputTokens, outputTokens, pricing) {
  const inputCost = (inputTokens / 1000) * (pricing.input_rate || 0)
  const outputCost = (outputTokens / 1000) * (pricing.output_rate || 0)
  return Math.round((inputCost + outputCost) * 1000000) / 1000000
}

/**
 * 流式请求的估算费用
 */
export function estimateStreamingCost(model) {
  // 流式请求无法精确统计 token，按固定估算
  return {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0.001, // 默认估算费用，实际由定价规则决定
  }
}

/**
 * 执行扣费（在 waitUntil 中调用）
 */
export async function performBilling(env, userId, { apiUrl, model, inputTokens, outputTokens, keyId, keyType }) {
  try {
    const pricing = await findPricing(env, apiUrl, model)
    const cost = calculateCost(inputTokens, outputTokens, pricing)

    if (cost <= 0) return

    const result = await deductBalance(env, userId, cost)
    if (!result.success) return

    await createTransaction(env, {
      userId,
      type: 'usage',
      amount: -cost,
      balanceAfter: result.balance,
      description: `${model || 'unknown'} - ${inputTokens}in/${outputTokens}out tokens`,
    })

    await createUsageRecord(env, {
      userId,
      apiUrl,
      model,
      inputTokens,
      outputTokens,
      cost,
      keyId,
      keyType,
    })
  } catch {
    // 计费失败不影响用户
  }
}
