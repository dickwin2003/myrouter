// ============ 用户面板 HTML ============

export function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AnyRouter - 用户中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    .glass { background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); }
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,0.15); }
    .toast { position: fixed; top: 20px; right: 20px; z-index: 9999; padding: 12px 20px; border-radius: 8px; color: white; font-size: 14px; animation: slideIn 0.3s ease; }
    @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .toast-success { background: #10b981; }
    .toast-error { background: #ef4444; }
    .tab-btn.active { background: rgba(102,126,234,0.15); color: #667eea; border-bottom: 2px solid #667eea; }
  </style>
</head>
<body class="gradient-bg min-h-screen">
  <div id="app" class="max-w-5xl mx-auto px-4 py-8">
    <!-- 顶部导航 -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <i class="fas fa-route text-white text-lg"></i>
        </div>
        <h1 class="text-2xl font-bold text-white">AnyRouter 用户中心</h1>
      </div>
      <div class="flex items-center gap-3">
        <a href="/" class="text-white/80 hover:text-white text-sm"><i class="fas fa-home mr-1"></i>首页</a>
        <a href="/docs" class="text-white/80 hover:text-white text-sm"><i class="fas fa-book mr-1"></i>文档</a>
        <button onclick="logout()" class="px-4 py-2 rounded-lg bg-white/20 text-white text-sm hover:bg-white/30 transition">
          <i class="fas fa-sign-out-alt mr-1"></i>退出登录
        </button>
      </div>
    </div>

    <!-- 登录/注册表单 -->
    <div id="authForm" class="glass rounded-2xl p-8 max-w-md mx-auto">
      <div class="flex mb-6">
        <button onclick="showTab('login')" class="tab-btn flex-1 py-3 text-center font-medium rounded-lg transition" data-tab="login">登录</button>
        <button onclick="showTab('register')" class="tab-btn flex-1 py-3 text-center font-medium rounded-lg transition" data-tab="register">注册</button>
      </div>
      <!-- 登录 -->
      <div id="loginForm">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input type="email" id="loginEmail" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="your@email.com">
        </div>
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input type="password" id="loginPassword" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="输入密码">
        </div>
        <button onclick="login()" class="w-full py-3 gradient-bg text-white font-medium rounded-lg hover:opacity-90 transition">登录</button>
      </div>
      <!-- 注册 -->
      <div id="registerForm" class="hidden">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input type="email" id="regEmail" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="your@email.com">
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input type="password" id="regPassword" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="至少 8 位">
        </div>
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">昵称（可选）</label>
          <input type="text" id="regName" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" placeholder="你的昵称">
        </div>
        <button onclick="register()" class="w-full py-3 gradient-bg text-white font-medium rounded-lg hover:opacity-90 transition">注册</button>
      </div>
    </div>

    <!-- 主面板（登录后显示） -->
    <div id="mainPanel" class="hidden">
      <!-- 信息卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="glass rounded-xl p-6 card-hover transition-all duration-300">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <i class="fas fa-user text-indigo-600"></i>
            </div>
            <div>
              <div class="text-sm text-gray-500">用户信息</div>
              <div class="font-semibold" id="userEmail">-</div>
            </div>
          </div>
          <div class="text-xs text-gray-400 mt-2">
            API Key: <code id="userApiKey" class="bg-gray-100 px-1 rounded text-xs cursor-pointer" onclick="copyText(this.textContent)" title="点击复制">-</code>
          </div>
        </div>

        <div class="glass rounded-xl p-6 card-hover transition-all duration-300">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <i class="fas fa-wallet text-green-600"></i>
            </div>
            <div>
              <div class="text-sm text-gray-500">账户余额</div>
              <div class="text-2xl font-bold text-green-600">$<span id="userBalance">0.00</span></div>
            </div>
          </div>
          <button onclick="showTopupModal()" class="mt-2 px-4 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition">
            <i class="fas fa-plus mr-1"></i>充值
          </button>
        </div>

        <div class="glass rounded-xl p-6 card-hover transition-all duration-300">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <i class="fas fa-key text-purple-600"></i>
            </div>
            <div>
              <div class="text-sm text-gray-500">我的密钥</div>
              <div class="text-2xl font-bold" id="keyCount">0</div>
            </div>
          </div>
          <button onclick="showAddKeyModal()" class="mt-2 px-4 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition">
            <i class="fas fa-plus mr-1"></i>添加
          </button>
        </div>
      </div>

      <!-- Tab 切换 -->
      <div class="glass rounded-xl overflow-hidden">
        <div class="flex border-b">
          <button onclick="showPanel('keys')" class="panel-tab flex-1 py-3 text-center font-medium text-sm transition hover:bg-gray-50" data-panel="keys">
            <i class="fas fa-key mr-1"></i>我的密钥
          </button>
          <button onclick="showPanel('usage')" class="panel-tab flex-1 py-3 text-center font-medium text-sm transition hover:bg-gray-50" data-panel="usage">
            <i class="fas fa-chart-bar mr-1"></i>用量记录
          </button>
          <button onclick="showPanel('transactions')" class="panel-tab flex-1 py-3 text-center font-medium text-sm transition hover:bg-gray-50" data-panel="transactions">
            <i class="fas fa-exchange-alt mr-1"></i>交易记录
          </button>
          <button onclick="showPanel('pricing')" class="panel-tab flex-1 py-3 text-center font-medium text-sm transition hover:bg-gray-50" data-panel="pricing">
            <i class="fas fa-tags mr-1"></i>价格表
          </button>
        </div>

        <!-- 密钥管理 -->
        <div id="panelKeys" class="p-6">
          <div id="keysTable" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="border-b text-gray-500">
                <th class="text-left py-2">API URL</th>
                <th class="text-left py-2">Token</th>
                <th class="text-left py-2">SK 别名</th>
                <th class="text-left py-2">状态</th>
                <th class="text-left py-2">操作</th>
              </tr></thead>
              <tbody id="keysBody"></tbody>
            </table>
          </div>
          <div id="noKeys" class="text-center py-8 text-gray-400">
            <i class="fas fa-key text-3xl mb-3"></i>
            <p>还没有添加密钥，点击上方"添加"按钮开始</p>
          </div>
        </div>

        <!-- 用量记录 -->
        <div id="panelUsage" class="p-6 hidden">
          <table class="w-full text-sm">
            <thead><tr class="border-b text-gray-500">
              <th class="text-left py-2">时间</th>
              <th class="text-left py-2">模型</th>
              <th class="text-left py-2">输入</th>
              <th class="text-left py-2">输出</th>
              <th class="text-left py-2">费用</th>
            </tr></thead>
            <tbody id="usageBody"></tbody>
          </table>
        </div>

        <!-- 交易记录 -->
        <div id="panelTransactions" class="p-6 hidden">
          <table class="w-full text-sm">
            <thead><tr class="border-b text-gray-500">
              <th class="text-left py-2">时间</th>
              <th class="text-left py-2">类型</th>
              <th class="text-left py-2">金额</th>
              <th class="text-left py-2">余额</th>
              <th class="text-left py-2">说明</th>
            </tr></thead>
            <tbody id="transactionsBody"></tbody>
          </table>
        </div>

        <!-- 价格表 -->
        <div id="panelPricing" class="p-6 hidden">
          <table class="w-full text-sm">
            <thead><tr class="border-b text-gray-500">
              <th class="text-left py-2">API</th>
              <th class="text-left py-2">模型</th>
              <th class="text-left py-2">输入价格/1K</th>
              <th class="text-left py-2">输出价格/1K</th>
            </tr></thead>
            <tbody id="pricingBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- 充值弹窗 -->
  <div id="topupModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden">
    <div class="glass rounded-2xl p-8 w-full max-w-sm mx-4">
      <h3 class="text-lg font-bold mb-4">余额充值</h3>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <button onclick="selectAmount(5)" class="amount-btn py-3 border-2 border-gray-200 rounded-lg font-medium hover:border-indigo-500 transition">$5</button>
        <button onclick="selectAmount(10)" class="amount-btn py-3 border-2 border-gray-200 rounded-lg font-medium hover:border-indigo-500 transition">$10</button>
        <button onclick="selectAmount(50)" class="amount-btn py-3 border-2 border-gray-200 rounded-lg font-medium hover:border-indigo-500 transition">$50</button>
        <button onclick="selectAmount(100)" class="amount-btn py-3 border-2 border-gray-200 rounded-lg font-medium hover:border-indigo-500 transition">$100</button>
      </div>
      <div class="mb-4">
        <input type="number" id="customAmount" class="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="自定义金额" min="1">
      </div>
      <div class="flex gap-3">
        <button onclick="closeTopupModal()" class="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
        <button onclick="doTopup()" class="flex-1 py-2 gradient-bg text-white rounded-lg hover:opacity-90">去支付</button>
      </div>
    </div>
  </div>

  <!-- 添加密钥弹窗 -->
  <div id="addKeyModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden">
    <div class="glass rounded-2xl p-8 w-full max-w-md mx-4">
      <h3 class="text-lg font-bold mb-4">添加 API 密钥</h3>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">API URL</label>
        <input type="url" id="keyApiUrl" class="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="https://api.openai.com">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">Token</label>
        <input type="text" id="keyToken" class="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="sk-xxx...">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
        <input type="text" id="keyRemark" class="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="可选">
      </div>
      <div class="flex gap-3">
        <button onclick="closeAddKeyModal()" class="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
        <button onclick="doAddKey()" class="flex-1 py-2 gradient-bg text-white rounded-lg hover:opacity-90">添加</button>
      </div>
    </div>
  </div>

  <script>
    let authToken = localStorage.getItem('userToken')
    let currentUser = null
    let selectedAmount = 10

    // 初始化
    $(document).ready(function() {
      showTab('login')
      if (authToken) {
        loadProfile()
      }
    })

    function showTab(tab) {
      $('.tab-btn').removeClass('active')
      $('[data-tab="' + tab + '"]').addClass('active')
      if (tab === 'login') {
        $('#loginForm').removeClass('hidden')
        $('#registerForm').addClass('hidden')
      } else {
        $('#loginForm').addClass('hidden')
        $('#registerForm').removeClass('hidden')
      }
    }

    function showPanel(panel) {
      $('.panel-tab').removeClass('active')
      $('[data-panel="' + panel + '"]').addClass('active')
      $('#panelKeys, #panelUsage, #panelTransactions, #panelPricing').addClass('hidden')
      $('#panel' + panel.charAt(0).toUpperCase() + panel.slice(1)).removeClass('hidden')
    }

    function toast(msg, type) {
      const el = $('<div class="toast toast-' + type + '">' + msg + '</div>')
      $('body').append(el)
      setTimeout(() => el.remove(), 3000)
    }

    function copyText(text) {
      navigator.clipboard.writeText(text).then(() => toast('已复制', 'success'))
    }

    async function api(path, method, body) {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
      }
      if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken
      if (body) opts.body = JSON.stringify(body)
      const res = await fetch(path, opts)
      if (res.status === 401) { logout(); return null }
      return res.json()
    }

    // 认证
    async function login() {
      const email = $('#loginEmail').val().trim()
      const password = $('#loginPassword').val()
      if (!email || !password) { toast('请填写邮箱和密码', 'error'); return }

      const res = await api('/api/auth/login', 'POST', { email, password })
      if (!res) return
      if (res.success) {
        authToken = res.token
        currentUser = res.user
        localStorage.setItem('userToken', authToken)
        toast('登录成功', 'success')
        loadProfile()
      } else {
        toast(res.error || '登录失败', 'error')
      }
    }

    async function register() {
      const email = $('#regEmail').val().trim()
      const password = $('#regPassword').val()
      const display_name = $('#regName').val().trim()
      if (!email || !password) { toast('请填写邮箱和密码', 'error'); return }

      const res = await api('/api/auth/register', 'POST', { email, password, display_name })
      if (!res) return
      if (res.success) {
        authToken = res.token
        currentUser = res.user
        localStorage.setItem('userToken', authToken)
        toast('注册成功', 'success')
        loadProfile()
      } else {
        toast(res.error || '注册失败', 'error')
      }
    }

    function logout() {
      authToken = null
      currentUser = null
      localStorage.removeItem('userToken')
      $('#authForm').removeClass('hidden')
      $('#mainPanel').addClass('hidden')
    }

    async function loadProfile() {
      const res = await api('/api/user/profile', 'GET')
      if (!res || res.error) { logout(); return }

      currentUser = res
      $('#userEmail').text(res.email || '-')
      $('#userApiKey').text(res.api_key || '-')
      $('#userBalance').text(parseFloat(res.balance || 0).toFixed(2))

      $('#authForm').addClass('hidden')
      $('#mainPanel').removeClass('hidden')

      loadKeys()
      showPanel('keys')
    }

    // 密钥管理
    async function loadKeys() {
      const res = await api('/api/user/keys', 'GET')
      if (!res) return

      const keys = res.keys || []
      $('#keyCount').text(keys.length)
      if (keys.length === 0) {
        $('#keysTable').addClass('hidden')
        $('#noKeys').removeClass('hidden')
        return
      }

      $('#keysTable').removeClass('hidden')
      $('#noKeys').addClass('hidden')

      let html = ''
      keys.forEach(k => {
        html += '<tr class="border-b hover:bg-gray-50">'
          + '<td class="py-2 pr-2"><span class="text-xs text-gray-500">' + escHtml(k.api_url) + '</span></td>'
          + '<td class="py-2 pr-2"><code class="text-xs bg-gray-100 px-1 rounded cursor-pointer" onclick="copyText(\\'' + escHtml(k.token) + '\\')">' + escHtml(k.token) + '</code></td>'
          + '<td class="py-2 pr-2">' + (k.sk_alias ? '<code class="text-xs bg-purple-100 px-1 rounded cursor-pointer" onclick="copyText(\\'' + escHtml(k.sk_alias) + '\\')">' + escHtml(k.sk_alias) + '</code>' : '<span class="text-gray-400 text-xs">无</span>') + '</td>'
          + '<td class="py-2 pr-2">' + (k.enabled ? '<span class="text-green-500 text-xs">启用</span>' : '<span class="text-red-500 text-xs">禁用</span>') + '</td>'
          + '<td class="py-2">'
          + '<button onclick="genSkAlias(' + k.id + ')" class="text-xs text-indigo-600 hover:text-indigo-800 mr-2" title="生成 SK 别名"><i class="fas fa-magic"></i></button>'
          + '<button onclick="toggleKey(' + k.id + ',' + !k.enabled + ')" class="text-xs text-yellow-600 hover:text-yellow-800 mr-2" title="切换状态"><i class="fas fa-power-off"></i></button>'
          + '<button onclick="deleteKey(' + k.id + ')" class="text-xs text-red-600 hover:text-red-800" title="删除"><i class="fas fa-trash"></i></button>'
          + '</td></tr>'
      })
      $('#keysBody').html(html)
    }

    async function genSkAlias(keyId) {
      const res = await api('/api/user/keys/' + keyId + '/sk-alias', 'POST')
      if (res && res.success) {
        toast('SK 别名已生成: ' + res.sk_alias, 'success')
        loadKeys()
      } else {
        toast(res?.error || '生成失败', 'error')
      }
    }

    async function toggleKey(keyId, enabled) {
      const res = await api('/api/user/keys/' + keyId, 'PATCH', { enabled })
      if (res && res.success) {
        toast(enabled ? '已启用' : '已禁用', 'success')
        loadKeys()
      }
    }

    async function deleteKey(keyId) {
      if (!confirm('确定删除此密钥？')) return
      const res = await api('/api/user/keys/' + keyId, 'DELETE')
      if (res && res.success) {
        toast('已删除', 'success')
        loadKeys()
      }
    }

    function showAddKeyModal() { $('#addKeyModal').removeClass('hidden') }
    function closeAddKeyModal() { $('#addKeyModal').addClass('hidden') }

    async function doAddKey() {
      const api_url = $('#keyApiUrl').val().trim()
      const token = $('#keyToken').val().trim()
      const remark = $('#keyRemark').val().trim()
      if (!api_url || !token) { toast('请填写 API URL 和 Token', 'error'); return }

      const res = await api('/api/user/keys', 'POST', { api_url, token, remark })
      if (res && res.success) {
        toast('密钥添加成功', 'success')
        closeAddKeyModal()
        $('#keyApiUrl, #keyToken, #keyRemark').val('')
        loadKeys()
      } else {
        toast(res?.error || '添加失败', 'error')
      }
    }

    // 充值
    let selectedTopupAmount = 10

    function showTopupModal() { $('#topupModal').removeClass('hidden') }
    function closeTopupModal() { $('#topupModal').addClass('hidden') }

    function selectAmount(amt) {
      selectedTopupAmount = amt
      $('#customAmount').val('')
      $('.amount-btn').removeClass('border-indigo-500 bg-indigo-50')
      event.target.classList.add('border-indigo-500', 'bg-indigo-50')
    }

    async function doTopup() {
      const custom = parseFloat($('#customAmount').val())
      const amount = custom > 0 ? custom : selectedTopupAmount
      if (!amount || amount < 1) { toast('请选择或输入金额', 'error'); return }

      const res = await api('/api/user/topup', 'POST', { amount })
      if (res && res.success && res.url) {
        window.location.href = res.url
      } else {
        toast(res?.error || '创建支付失败', 'error')
      }
    }

    // 用量记录
    async function loadUsage() {
      const res = await api('/api/user/usage?limit=20', 'GET')
      if (!res) return
      let html = ''
      ;(res.records || []).forEach(r => {
        html += '<tr class="border-b hover:bg-gray-50">'
          + '<td class="py-2 text-xs text-gray-500">' + formatDate(r.created_at) + '</td>'
          + '<td class="py-2 text-xs">' + escHtml(r.model || '-') + '</td>'
          + '<td class="py-2 text-xs">' + (r.input_tokens || 0) + '</td>'
          + '<td class="py-2 text-xs">' + (r.output_tokens || 0) + '</td>'
          + '<td class="py-2 text-xs text-red-500">$' + parseFloat(r.cost || 0).toFixed(6) + '</td>'
          + '</tr>'
      })
      $('#usageBody').html(html || '<tr><td colspan="5" class="py-4 text-center text-gray-400">暂无记录</td></tr>')
    }

    // 交易记录
    async function loadTransactions() {
      const res = await api('/api/user/transactions?limit=20', 'GET')
      if (!res) return
      let html = ''
      ;(res.transactions || []).forEach(t => {
        const typeMap = { topup: '充值', usage: '消费', refund: '退款', admin_adjust: '管理员调整' }
        const color = t.amount > 0 ? 'text-green-500' : 'text-red-500'
        html += '<tr class="border-b hover:bg-gray-50">'
          + '<td class="py-2 text-xs text-gray-500">' + formatDate(t.created_at) + '</td>'
          + '<td class="py-2 text-xs">' + (typeMap[t.type] || t.type) + '</td>'
          + '<td class="py-2 text-xs ' + color + '">' + (t.amount > 0 ? '+' : '') + parseFloat(t.amount).toFixed(4) + '</td>'
          + '<td class="py-2 text-xs">$' + parseFloat(t.balance_after).toFixed(4) + '</td>'
          + '<td class="py-2 text-xs text-gray-500">' + escHtml(t.description || '') + '</td>'
          + '</tr>'
      })
      $('#transactionsBody').html(html || '<tr><td colspan="5" class="py-4 text-center text-gray-400">暂无记录</td></tr>')
    }

    // 定价表
    async function loadPricing() {
      const res = await api('/api/user/pricing', 'GET')
      if (!res) return
      let html = ''
      ;(res.rules || []).forEach(r => {
        html += '<tr class="border-b hover:bg-gray-50">'
          + '<td class="py-2 text-xs">' + escHtml(r.api_url) + '</td>'
          + '<td class="py-2 text-xs font-mono">' + escHtml(r.model_pattern) + '</td>'
          + '<td class="py-2 text-xs">$' + parseFloat(r.input_rate).toFixed(4) + '</td>'
          + '<td class="py-2 text-xs">$' + parseFloat(r.output_rate).toFixed(4) + '</td>'
          + '</tr>'
      })
      $('#pricingBody').html(html || '<tr><td colspan="4" class="py-4 text-center text-gray-400">暂无定价规则</td></tr>')
    }

    // 懒加载数据
    const origShowPanel = showPanel
    showPanel = function(panel) {
      origShowPanel(panel)
      if (panel === 'usage') loadUsage()
      if (panel === 'transactions') loadTransactions()
      if (panel === 'pricing') loadPricing()
    }

    // 工具函数
    function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
    function formatDate(d) { if (!d) return '-'; return new Date(d).toLocaleString('zh-CN') }

    // URL 参数检测
    const params = new URLSearchParams(window.location.search)
    if (params.get('topup') === 'success') {
      toast('充值成功！余额将在几秒内更新', 'success')
      window.history.replaceState({}, '', '/dashboard')
      if (authToken) setTimeout(loadProfile, 2000)
    }
    if (params.get('topup') === 'cancel') {
      toast('充值已取消', 'error')
      window.history.replaceState({}, '', '/dashboard')
    }
  </script>
</body>
</html>`
}
