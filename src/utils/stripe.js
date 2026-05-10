// ============ Stripe 支付工具 ============

/**
 * Stripe API 请求封装
 */
async function stripeFetch(env, path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  }
  if (body) {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    options.body = new URLSearchParams(body).toString()
  }
  const response = await fetch(`https://api.stripe.com/v1${path}`, options)
  return response.json()
}

/**
 * 创建 Stripe Checkout Session
 */
export async function createCheckoutSession(env, { userId, userEmail, amount }) {
  try {
    const session = await stripeFetch(env, '/checkout/sessions', 'POST', {
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'customer_email': userEmail,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `AnyRouter 余额充值 $${amount}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][quantity]': '1',
      'success_url': `${env.SITE_URL || 'https://anyrouter.dickwin2003.workers.dev'}/dashboard?topup=success`,
      'cancel_url': `${env.SITE_URL || 'https://anyrouter.dickwin2003.workers.dev'}/dashboard?topup=cancel`,
      'metadata[user_id]': String(userId),
      'metadata[amount]': String(amount),
    })
    return { success: true, url: session.url, sessionId: session.id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 验证 Stripe Webhook 签名
 */
export async function verifyWebhookSignature(payload, sigHeader, secret) {
  try {
    // 解析 Stripe 签名头
    const elements = sigHeader.split(',')
    const sigMap = {}
    for (const element of elements) {
      const [key, value] = element.split('=')
      sigMap[key.trim()] = value.trim()
    }

    const timestamp = sigMap['t']
    const signature = sigMap['v1']
    if (!timestamp || !signature) return false

    // 构造签名内容：timestamp.payload
    const signedPayload = `${timestamp}.${payload}`

    // 计算 HMAC-SHA256
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const computedSig = Array.from(new Uint8Array(sigBytes), b => b.toString(16).padStart(2, '0')).join('')

    return computedSig === signature
  } catch {
    return false
  }
}

/**
 * 处理 Webhook 事件
 */
export async function handleWebhookEvent(env, event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = parseInt(session.metadata?.user_id, 10)
    const amount = parseFloat(session.metadata?.amount || '0')
    const sessionId = session.id

    if (!userId || !amount) return

    // 检查是否已处理（幂等性）
    const { findStripeSession, completeStripeSession, addBalance, createTransaction } = await import('../db/user-db.js')
    const existing = await findStripeSession(env, sessionId)
    if (existing && existing.status === 'completed') return

    // 加余额
    const result = await addBalance(env, userId, amount)
    if (result.success) {
      await createTransaction(env, {
        userId,
        type: 'topup',
        amount,
        balanceAfter: result.balance,
        stripeSessionId: sessionId,
        description: `Stripe 充值 $${amount}`,
      })
      await completeStripeSession(env, sessionId)
    }
  }
}
