// ============ 代理请求处理 ============

import { jsonResponse } from '../utils/helpers.js'
import { USER_API_KEY_PREFIX } from '../config.js'
import { getConfigFromDB, findBySkAlias, getRandomEnabledKey } from '../db/supabase.js'
import { findUserByApiKey, getUserEnabledKeysForUrl } from '../db/user-db.js'
import { extractTokens, extractModelFromRequest, performBilling, estimateStreamingCost, findPricing, calculateCost } from '../utils/billing.js'
import { recordRequest, isIpBlocked } from '../cache/stats.js'

/**
 * 生成友好的错误响应
 */
function errorResponse(code, message, hint) {
  return jsonResponse({
    error: {
      code,
      message,
      hint,
      contact: '如有疑问请联系管理员',
    }
  }, code === 'UNAUTHORIZED' ? 401 :
    code === 'BAD_REQUEST' ? 400 :
      code === 'NOT_FOUND' ? 404 :
        code === 'FORBIDDEN' ? 403 :
          code === 'PAYMENT_REQUIRED' ? 402 :
            code === 'SERVICE_ERROR' ? 503 : 500)
}

/**
 * 处理代理请求
 * 支持格式:
 * 1. Authorization: Bearer sk-ar-user-xxx (用户 API Key，新增)
 * 2. Authorization: Bearer sk-ar-xxx (SK 别名)
 * 3. Authorization: Bearer https://api.example.com:123 (按 ID 查找 token)
 * 4. Authorization: Bearer https://api.example.com:sk-xxx (直接使用 token)
 */
export async function handleProxyRequest(request, env, url, ctx) {
  // 获取客户端 IP
  const clientIp = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                   'unknown'

  // 检查 IP 黑名单
  const blockCheck = await isIpBlocked(env, clientIp)
  if (blockCheck.blocked) {
    return jsonResponse({
      error: {
        code: 'IP_BLOCKED',
        message: 'IP 已被封禁',
        reason: blockCheck.reason,
        ip: clientIp,
        contact: '如有疑问请联系管理员',
      }
    }, 403)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(
      'UNAUTHORIZED',
      '缺少授权信息',
      '请在 Authorization header 中提供 Bearer token，格式: Bearer <API_URL>:<Key ID> 或 Bearer sk-ar-xxx'
    )
  }

  const authValue = authHeader.substring(7).trim()

  // 检测用户 API Key 模式 (sk-ar-user-xxx)
  if (authValue.startsWith(USER_API_KEY_PREFIX)) {
    return handleUserProxyRequest(request, env, url, ctx, authValue, clientIp)
  }

  // 获取配置
  const config = await getConfigFromDB(env)

  let tokenToUse
  let targetApiUrl
  let usedKeyId = null

  // 检查是否是 SK 别名模式 (sk-ar-xxx)
  if (authValue.startsWith('sk-ar-')) {
    const found = findBySkAlias(config, authValue)
    if (!found) {
      return errorResponse(
        'NOT_FOUND',
        'SK 别名不存在',
        `找不到 SK 别名 "${authValue}"，请检查是否输入正确或联系管理员获取有效的 SK`
      )
    }

    if (!found.key.enabled) {
      return errorResponse(
        'FORBIDDEN',
        'SK 已被禁用',
        '此 SK 别名当前处于禁用状态，请联系管理员启用'
      )
    }

    // 检查是否过期
    if (found.key.expires_at && new Date(found.key.expires_at) < new Date()) {
      return errorResponse(
        'FORBIDDEN',
        'SK 已过期',
        `此 SK 别名已于 ${found.key.expires_at} 过期，请联系管理员续期或获取新的 SK`
      )
    }

    tokenToUse = found.key.token
    targetApiUrl = found.apiUrl
    usedKeyId = found.key.key_id
  } else {
    // 原有格式: <api_url>:<key>
    const lastColonIndex = authValue.lastIndexOf(':')
    if (lastColonIndex === -1 || lastColonIndex < 8) {
      return errorResponse(
        'BAD_REQUEST',
        '授权格式错误',
        '正确格式: <API_URL>:<Key ID> 或 sk-ar-xxx，例如 https://api.openai.com:a3x9k2'
      )
    }

    targetApiUrl = authValue.substring(0, lastColonIndex)
    const keyPart = authValue.substring(lastColonIndex + 1)

    if (!targetApiUrl.startsWith('http://') && !targetApiUrl.startsWith('https://')) {
      return errorResponse(
        'BAD_REQUEST',
        'API URL 格式无效',
        'URL 必须以 http:// 或 https:// 开头'
      )
    }

    if (!keyPart) {
      return errorResponse(
        'BAD_REQUEST',
        '缺少 Key ID 或 Token',
        '请在 URL 后面加上冒号和 Key ID（6位）或完整 Token'
      )
    }

    const isKeyId = /^[a-z0-9]{6}$/.test(keyPart)

    if (isKeyId) {
      const keyId = keyPart
      usedKeyId = keyId

      if (!config[targetApiUrl]) {
        return errorResponse(
          'NOT_FOUND',
          'API 地址未配置',
          `目标 API "${targetApiUrl}" 尚未在系统中注册，请联系管理员添加配置`
        )
      }

      const keyConfig = config[targetApiUrl].keys.find(k => k.key_id === keyId)
      if (!keyConfig) {
        return errorResponse(
          'NOT_FOUND',
          'Key ID 不存在',
          `找不到 Key ID "${keyId}"，请检查是否输入正确或联系管理员获取有效的 Key ID`
        )
      }

      if (!keyConfig.enabled) {
        return errorResponse(
          'FORBIDDEN',
          'Key 已被禁用',
          `Key ID "${keyId}" 当前处于禁用状态，请联系管理员启用或获取新的 Key ID`
        )
      }

      if (keyConfig.expires_at && new Date(keyConfig.expires_at) < new Date()) {
        return errorResponse(
          'FORBIDDEN',
          'Key 已过期',
          `Key ID "${keyId}" 已于 ${keyConfig.expires_at} 过期，请联系管理员续期或获取新的 Key ID`
        )
      }

      tokenToUse = keyConfig.token
    } else {
      tokenToUse = keyPart
    }
  }

  // 设置目标主机和协议
  const targetUrl = new URL(targetApiUrl)

  // 检查是否在尝试反代自身（禁止循环代理）
  const selfHostname = url.hostname.toLowerCase()
  const targetHostname = targetUrl.hostname.toLowerCase()
  if (targetHostname === selfHostname ||
      targetHostname.endsWith('.' + selfHostname) ||
      selfHostname.endsWith('.' + targetHostname)) {
    return errorResponse(
      'FORBIDDEN',
      '禁止反代自身',
      '不允许将请求代理到代理服务自身的域名，这会造成循环请求'
    )
  }

  url.protocol = targetUrl.protocol
  url.hostname = targetUrl.hostname
  url.port = targetUrl.port || ''

  // 获取原始请求头
  const headers = new Headers(request.headers)

  // 设置 Authorization header
  headers.set('authorization', 'Bearer ' + tokenToUse)

  const modifiedRequest = new Request(url.toString(), {
    headers: headers,
    method: request.method,
    body: request.body,
    redirect: 'follow',
  })

  try {
    const response = await fetch(modifiedRequest)
    const modifiedResponse = new Response(response.body, response)

    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*')

    // SSE 流式响应优化
    const contentType = response.headers.get('content-type') || ''
    const isStreaming = contentType.includes('text/event-stream') ||
                        contentType.includes('stream') ||
                        request.headers.get('accept')?.includes('text/event-stream')
    if (isStreaming) {
      modifiedResponse.headers.set('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate')
      modifiedResponse.headers.set('X-Accel-Buffering', 'no')
      modifiedResponse.headers.set('Connection', 'keep-alive')
      modifiedResponse.headers.set('Content-Encoding', 'identity')
      modifiedResponse.headers.delete('Content-Length')
    }

    // 记录请求统计
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: response.ok,
        ip: clientIp,
      }))
    }

    return modifiedResponse
  } catch (error) {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: false,
        ip: clientIp,
      }))
    }

    console.error('Proxy request error:', error)
    return errorResponse(
      'SERVICE_ERROR',
      '代理请求失败',
      `无法连接到目标 API "${targetApiUrl}"，可能是网络问题或目标服务不可用，请稍后重试`
    )
  }
}

/**
 * 处理用户 API Key 模式的代理请求
 */
async function handleUserProxyRequest(request, env, url, ctx, apiKey, clientIp) {
  // 查找用户
  const user = await findUserByApiKey(env, apiKey)
  if (!user) {
    return errorResponse(
      'UNAUTHORIZED',
      '无效的用户 API Key',
      '请检查您的 API Key 是否正确，或重新登录获取'
    )
  }

  if (user.status !== 'active') {
    return errorResponse(
      'FORBIDDEN',
      '账户已被禁用',
      '您的账户已被暂停或封禁，请联系管理员'
    )
  }

  // 余额预检
  if (user.balance <= 0) {
    return errorResponse(
      'PAYMENT_REQUIRED',
      '余额不足',
      '您的账户余额不足，请前往用户面板充值后再使用'
    )
  }

  // 解析请求 body 获取目标 URL 和 model
  let requestBody = null
  let targetApiUrl = null
  let model = null

  try {
    // 克隆请求以便读取 body
    const clonedRequest = request.clone()
    requestBody = await clonedRequest.text()
    const bodyData = JSON.parse(requestBody)
    model = bodyData.model || null

    // 从请求路径推断目标 API URL
    // 用户请求格式: POST /v1/chat/completions 等标准路径
    // 需要确定目标是哪个 API
    targetApiUrl = bodyData._target_url || null
  } catch {
    // body 解析失败，继续
  }

  // 如果没有指定目标 URL，尝试从路径推断
  if (!targetApiUrl) {
    // 从请求头中获取目标 URL（兼容直接指定模式）
    const headerUrl = request.headers.get('X-Target-URL')
    if (headerUrl) {
      targetApiUrl = headerUrl
    }
  }

  // 如果仍未确定目标 URL，返回错误
  if (!targetApiUrl) {
    return errorResponse(
      'BAD_REQUEST',
      '缺少目标 API 地址',
      '请在请求 body 中添加 "_target_url" 字段，或在请求头中添加 "X-Target-URL" 指定目标 API 地址'
    )
  }

  // 解析 Key：优先使用用户自己的 Key
  let tokenToUse = null
  let keyType = 'shared'
  let usedKeyId = null

  const userKeys = await getUserEnabledKeysForUrl(env, user.id, targetApiUrl)
  if (userKeys && userKeys.length > 0) {
    // 使用用户的 Key
    const selectedKey = userKeys[Math.floor(Math.random() * userKeys.length)]
    tokenToUse = selectedKey.token
    usedKeyId = selectedKey.key_id
    keyType = 'user'

    // 检查过期
    if (selectedKey.expires_at && new Date(selectedKey.expires_at) < new Date()) {
      tokenToUse = null
    }
  }

  // 如果用户没有自己的 Key，使用管理员共享 Key
  if (!tokenToUse) {
    const sharedConfig = await getConfigFromDB(env)
    const sharedKey = getRandomEnabledKey(sharedConfig, targetApiUrl)
    if (!sharedKey) {
      return errorResponse(
        'NOT_FOUND',
        '没有可用的 API Key',
        `目标 API "${targetApiUrl}" 没有可用的共享 Key，请确认地址正确或添加自己的 Key`
      )
    }
    tokenToUse = sharedKey
    keyType = 'shared'
  }

  // 构建转发请求
  const targetUrl = new URL(targetApiUrl)

  // 反代自身检查
  const selfHostname = url.hostname.toLowerCase()
  const targetHostname = targetUrl.hostname.toLowerCase()
  if (targetHostname === selfHostname ||
      targetHostname.endsWith('.' + selfHostname) ||
      selfHostname.endsWith('.' + targetHostname)) {
    return errorResponse('FORBIDDEN', '禁止反代自身', '不允许将请求代理到代理服务自身的域名')
  }

  url.protocol = targetUrl.protocol
  url.hostname = targetUrl.hostname
  url.port = targetUrl.port || ''

  const headers = new Headers(request.headers)
  headers.set('authorization', 'Bearer ' + tokenToUse)
  // 移除自定义头
  headers.delete('X-Target-URL')

  const modifiedRequest = new Request(url.toString(), {
    headers,
    method: request.method,
    body: request.body,
    redirect: 'follow',
  })

  try {
    const response = await fetch(modifiedRequest)

    // 检测是否流式
    const contentType = response.headers.get('content-type') || ''
    const isStreaming = contentType.includes('text/event-stream') ||
                        contentType.includes('stream')

    let billingInfo = { apiUrl: targetApiUrl, model, keyId: usedKeyId, keyType }

    if (!isStreaming && response.ok) {
      // 非流式：克隆响应提取 token
      const clonedResponse = response.clone()
      ctx.waitUntil((async () => {
        try {
          const body = await clonedResponse.text()
          const tokens = extractTokens(body, targetApiUrl)
          billingInfo.inputTokens = tokens.inputTokens
          billingInfo.outputTokens = tokens.outputTokens
          billingInfo.model = tokens.model || model
          await performBilling(env, user.id, billingInfo)
        } catch { /* ignore */ }
      })())
    } else if (isStreaming) {
      // 流式：估算扣费
      ctx.waitUntil((async () => {
        try {
          const pricing = await findPricing(env, targetApiUrl, model)
          const estimatedCost = 0.001 // 固定估算
          const cost = Math.max(calculateCost(0, 0, pricing), estimatedCost)
          const { deductBalance, createTransaction, createUsageRecord } = await import('../db/user-db.js')
          const result = await deductBalance(env, user.id, cost)
          if (result.success) {
            await createTransaction(env, {
              userId: user.id,
              type: 'usage',
              amount: -cost,
              balanceAfter: result.balance,
              description: `${model || 'streaming'} - estimated`,
            })
            await createUsageRecord(env, {
              userId: user.id,
              apiUrl: targetApiUrl,
              model,
              inputTokens: 0,
              outputTokens: 0,
              cost,
              keyId: usedKeyId,
              keyType,
            })
          }
        } catch { /* ignore */ }
      })())
    }

    const modifiedResponse = new Response(response.body, response)
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*')

    if (isStreaming) {
      modifiedResponse.headers.set('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate')
      modifiedResponse.headers.set('X-Accel-Buffering', 'no')
      modifiedResponse.headers.set('Connection', 'keep-alive')
      modifiedResponse.headers.set('Content-Encoding', 'identity')
      modifiedResponse.headers.delete('Content-Length')
    }

    // 统计
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: response.ok,
        ip: clientIp,
      }))
    }

    return modifiedResponse
  } catch (error) {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: false,
        ip: clientIp,
      }))
    }

    console.error('User proxy request error:', error)
    return errorResponse(
      'SERVICE_ERROR',
      '代理请求失败',
      `无法连接到目标 API "${targetApiUrl}"，可能是网络问题或目标服务不可用`
    )
  }
}
