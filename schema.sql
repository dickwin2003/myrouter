-- AnyRouter 数据库初始化脚本
-- 在 Supabase SQL Editor 中一次性执行此脚本
--
-- 使用说明：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 复制粘贴此脚本并执行

-- ============================================
-- 1. 创建随机 ID 生成函数
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_key_id(length INTEGER DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. 创建表
-- ============================================
CREATE TABLE IF NOT EXISTS public.api_configs (
  id BIGSERIAL PRIMARY KEY,
  key_id VARCHAR(6) UNIQUE NOT NULL DEFAULT public.generate_key_id(6),
  sk_alias VARCHAR(50) UNIQUE DEFAULT NULL,
  api_url TEXT NOT NULL,
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  remark VARCHAR(255) DEFAULT NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 如果表已存在但没有 remark 列，添加它
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_configs'
    AND column_name = 'remark'
  ) THEN
    ALTER TABLE public.api_configs
    ADD COLUMN remark VARCHAR(255) DEFAULT NULL;
  END IF;
END $$;

-- 如果表已存在但没有 deleted_at 列，添加它（软删除支持）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_configs'
    AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.api_configs
    ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
  END IF;
END $$;

-- 如果表已存在但没有 key_id 列，添加它
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_configs'
    AND column_name = 'key_id'
  ) THEN
    ALTER TABLE public.api_configs
    ADD COLUMN key_id VARCHAR(6) UNIQUE;

    -- 为已有记录生成 key_id
    UPDATE public.api_configs
    SET key_id = public.generate_key_id(6)
    WHERE key_id IS NULL;

    -- 设置 NOT NULL 约束
    ALTER TABLE public.api_configs
    ALTER COLUMN key_id SET NOT NULL;

    -- 设置默认值
    ALTER TABLE public.api_configs
    ALTER COLUMN key_id SET DEFAULT public.generate_key_id(6);
  END IF;
END $$;

-- 如果表已存在但没有 sk_alias 列，添加它（SK 别名支持）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_configs'
    AND column_name = 'sk_alias'
  ) THEN
    ALTER TABLE public.api_configs
    ADD COLUMN sk_alias VARCHAR(50) UNIQUE DEFAULT NULL;
  END IF;
END $$;

-- 如果表已存在但没有 expires_at 列，添加它（有效期支持）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_configs'
    AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.api_configs
    ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
  END IF;
END $$;

-- ============================================
-- 3. 创建索引（加速查询）
-- ============================================
CREATE INDEX IF NOT EXISTS idx_api_configs_key_id ON public.api_configs(key_id);
CREATE INDEX IF NOT EXISTS idx_api_configs_sk_alias ON public.api_configs(sk_alias) WHERE sk_alias IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_configs_api_url ON public.api_configs(api_url);
CREATE INDEX IF NOT EXISTS idx_api_configs_enabled ON public.api_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_api_configs_created_at ON public.api_configs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_configs_deleted_at ON public.api_configs(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- 4. 启用行级安全 (RLS)
-- ============================================
ALTER TABLE public.api_configs ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（避免重复执行报错）
DROP POLICY IF EXISTS "Allow all access with service role" ON public.api_configs;

-- 创建策略：允许所有已认证的请求访问
CREATE POLICY "Allow all access with service role"
  ON public.api_configs
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 5. 创建更新时间触发器
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_api_configs_updated_at ON public.api_configs;

CREATE TRIGGER update_api_configs_updated_at
  BEFORE UPDATE ON public.api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 6. 添加注释
-- ============================================
COMMENT ON TABLE public.api_configs IS 'API 代理配置表';
COMMENT ON COLUMN public.api_configs.id IS '自增主键（内部使用）';
COMMENT ON COLUMN public.api_configs.key_id IS '6位随机 ID（用于 API 调用）';
COMMENT ON COLUMN public.api_configs.sk_alias IS 'SK 别名（格式：sk-ar-xxx，用于简化认证）';
COMMENT ON COLUMN public.api_configs.api_url IS '目标 API 地址';
COMMENT ON COLUMN public.api_configs.token IS 'API Token';
COMMENT ON COLUMN public.api_configs.enabled IS '是否启用';
COMMENT ON COLUMN public.api_configs.remark IS '备注说明';
COMMENT ON COLUMN public.api_configs.expires_at IS '过期时间（NULL表示永不过期）';
COMMENT ON COLUMN public.api_configs.deleted_at IS '软删除时间（NULL表示未删除）';
COMMENT ON COLUMN public.api_configs.created_at IS '创建时间';
COMMENT ON COLUMN public.api_configs.updated_at IS '更新时间';

-- ============================================
-- 7. 授权
-- ============================================
GRANT ALL ON public.api_configs TO anon;
GRANT ALL ON public.api_configs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.api_configs_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.api_configs_id_seq TO authenticated;

-- ============================================
-- 完成！
-- ============================================
-- key_id 格式：6位小写字母+数字，如 "a3x9k2"
-- sk_alias 格式：sk-ar-[32位随机字符]，如 "sk-ar-abcDEF123..."
--
-- 使用方式：
-- 1. SK 别名模式：Authorization: Bearer sk-ar-xxxxxxxx...
-- 2. Key ID 模式：Authorization: Bearer https://api.openai.com:a3x9k2
-- 3. 直传模式：  Authorization: Bearer https://api.openai.com:sk-xxx...

-- ============================================
-- 8. 用户系统相关表
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name VARCHAR(100) DEFAULT NULL,
  balance DECIMAL(12, 6) NOT NULL DEFAULT 0,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  stripe_customer_id VARCHAR(255) DEFAULT NULL,
  api_key VARCHAR(60) UNIQUE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON public.users(api_key) WHERE api_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access users" ON public.users;
CREATE POLICY "Allow all access users" ON public.users FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 用户密钥表
CREATE TABLE IF NOT EXISTS public.user_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_id VARCHAR(6) UNIQUE NOT NULL DEFAULT public.generate_key_id(6),
  sk_alias VARCHAR(60) UNIQUE DEFAULT NULL,
  api_url TEXT NOT NULL,
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  remark VARCHAR(255) DEFAULT NULL,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_keys_user_id ON public.user_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_keys_api_url ON public.user_keys(api_url);
CREATE INDEX IF NOT EXISTS idx_user_keys_enabled ON public.user_keys(enabled);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access user_keys" ON public.user_keys;
CREATE POLICY "Allow all access user_keys" ON public.user_keys FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_keys_updated_at ON public.user_keys;
CREATE TRIGGER update_user_keys_updated_at BEFORE UPDATE ON public.user_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 定价规则表
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id BIGSERIAL PRIMARY KEY,
  api_url TEXT NOT NULL,
  model_pattern TEXT NOT NULL DEFAULT '*',
  input_rate DECIMAL(10, 6) NOT NULL DEFAULT 0,
  output_rate DECIMAL(10, 6) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_api_url ON public.pricing_rules(api_url);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access pricing_rules" ON public.pricing_rules;
CREATE POLICY "Allow all access pricing_rules" ON public.pricing_rules FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 用量记录表
CREATE TABLE IF NOT EXISTS public.usage_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  api_url TEXT NOT NULL,
  model VARCHAR(100) DEFAULT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost DECIMAL(12, 6) NOT NULL DEFAULT 0,
  key_id VARCHAR(10) DEFAULT NULL,
  key_type VARCHAR(10) NOT NULL DEFAULT 'shared',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON public.usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON public.usage_records(created_at DESC);

ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access usage_records" ON public.usage_records;
CREATE POLICY "Allow all access usage_records" ON public.usage_records FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 交易记录表
CREATE TABLE IF NOT EXISTS public.transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(12, 6) NOT NULL,
  balance_after DECIMAL(12, 6) NOT NULL,
  stripe_session_id VARCHAR(255) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access transactions" ON public.transactions;
CREATE POLICY "Allow all access transactions" ON public.transactions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Stripe 会话表
CREATE TABLE IF NOT EXISTS public.stripe_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE public.stripe_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access stripe_sessions" ON public.stripe_sessions;
CREATE POLICY "Allow all access stripe_sessions" ON public.stripe_sessions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 授权
GRANT ALL ON public.users TO anon;
GRANT ALL ON public.users TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.users_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.users_id_seq TO authenticated;

GRANT ALL ON public.user_keys TO anon;
GRANT ALL ON public.user_keys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.user_keys_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.user_keys_id_seq TO authenticated;

GRANT ALL ON public.pricing_rules TO anon;
GRANT ALL ON public.pricing_rules TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pricing_rules_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.pricing_rules_id_seq TO authenticated;

GRANT ALL ON public.usage_records TO anon;
GRANT ALL ON public.usage_records TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.usage_records_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.usage_records_id_seq TO authenticated;

GRANT ALL ON public.transactions TO anon;
GRANT ALL ON public.transactions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.transactions_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.transactions_id_seq TO authenticated;

GRANT ALL ON public.stripe_sessions TO anon;
GRANT ALL ON public.stripe_sessions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.stripe_sessions_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.stripe_sessions_id_seq TO authenticated;
