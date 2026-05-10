// ============ AnyRouter 主入口 ============

import { handleCORS } from './utils/helpers.js'
import { handleApiRequest } from './handlers/api.js'
import { handleProxyRequest } from './handlers/proxy.js'
import { handleAuthApi, handleUserApi } from './handlers/user-api.js'
import { handleAdminUserApi, handleAdminPricingApi } from './handlers/admin-user-api.js'
import { verifyWebhookSignature, handleWebhookEvent } from './utils/stripe.js'
import { getStatusHtml } from './pages/status.js'
import { getAdminHtml } from './pages/admin.js'
import { getDocsHtml } from './pages/docs.js'
import { getDashboardHtml } from './pages/dashboard.js'

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx)
  },
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url)

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return handleCORS()
  }

  // 管理页面路由
  if (url.pathname === '/admin') {
    return new Response(getAdminHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 用户面板
  if (url.pathname === '/dashboard') {
    return new Response(getDashboardHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 公开文档页面（无需鉴权）
  if (url.pathname === '/docs') {
    return new Response(getDocsHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Stripe Webhook（需要原始 body 做签名验证）
  if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') {
    return handleStripeWebhook(request, env)
  }

  // 认证 API（无需鉴权）
  if (url.pathname.startsWith('/api/auth/')) {
    return handleAuthApi(request, env, url)
  }

  // 用户 API（JWT 鉴权）
  if (url.pathname.startsWith('/api/user/')) {
    return handleUserApi(request, env, url)
  }

  // 管理员用户/定价 API（管理员鉴权）
  if (url.pathname.startsWith('/api/admin/users') || url.pathname.startsWith('/api/admin/pricing') || url.pathname.startsWith('/api/admin/usage') || url.pathname.startsWith('/api/admin/transactions')) {
    return handleAdminPricingApi(request, env, url)
  }

  // API 路由
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(request, env, url)
  }

  // 根路径返回状态页面
  if (request.method === 'GET' && url.pathname === '/') {
    return new Response(getStatusHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 代理请求处理（传递 ctx 用于 waitUntil）
  return handleProxyRequest(request, env, url, ctx)
}

/**
 * 处理 Stripe Webhook
 */
async function handleStripeWebhook(request, env) {
  try {
    const payload = await request.text()
    const sigHeader = request.headers.get('stripe-signature')

    if (!sigHeader || !env.STRIPE_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 })
    }

    const valid = await verifyWebhookSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET)
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
    }

    const event = JSON.parse(payload)
    await handleWebhookEvent(env, event)

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 500 })
  }
}
