-- ============================================================
-- GhostSignal AI — Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. PROFILES (utilisateurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'creator', 'pro', 'free')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'payment_failed')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  niches TEXT[] DEFAULT '{}',           -- ex: ['fitness', 'crypto', 'fashion']
  alert_email BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. TRENDS (tendances virales)
-- ============================================================
CREATE TABLE IF NOT EXISTS trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('TikTok', 'Instagram', 'YouTube', 'Reddit', 'X')),
  niche TEXT,
  viral_score INTEGER CHECK (viral_score BETWEEN 0 AND 100),
  velocity_percent INTEGER CHECK (velocity_percent BETWEEN 0 AND 100),
  hashtags TEXT[] DEFAULT '{}',
  view_count_sample BIGINT,           -- Vues de la vidéo de référence
  growth_rate_24h FLOAT,              -- % croissance sur 24h
  is_real_time BOOLEAN DEFAULT false, -- True = Pro only
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexes
CREATE INDEX idx_trends_platform ON trends(platform);
CREATE INDEX idx_trends_niche ON trends(niche);
CREATE INDEX idx_trends_viral_score ON trends(viral_score DESC);
CREATE INDEX idx_trends_created_at ON trends(created_at DESC);

-- ============================================================
-- 3. GENERATED SCRIPTS (scripts générés par l'IA)
-- ============================================================
CREATE TABLE IF NOT EXISTS generated_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trend_id UUID REFERENCES trends(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  niche TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scripts_user ON generated_scripts(user_id);

-- ============================================================
-- 4. SAVED TRENDS (tendances sauvegardées)
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trend_id UUID NOT NULL REFERENCES trends(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, trend_id)
);

CREATE INDEX idx_saved_user ON saved_trends(user_id);

-- ============================================================
-- 5. WAITLIST (liste d'attente)
-- ============================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT 'landing',     -- landing, tiktok, instagram...
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. USAGE TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,              -- 'trend_view', 'script_generate', 'trend_save'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_user ON usage_logs(user_id);
CREATE INDEX idx_usage_action ON usage_logs(action);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Scripts: users can read/create their own
CREATE POLICY "Users can view own scripts"
  ON generated_scripts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scripts"
  ON generated_scripts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Saved trends
CREATE POLICY "Users can manage own saved trends"
  ON saved_trends FOR ALL
  USING (auth.uid() = user_id);

-- Trends: public read (anyone can see trends if authenticated)
ALTER TABLE trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view trends"
  ON trends FOR SELECT
  TO authenticated
  USING (true);

-- Waitlist: public insert
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- SEED DATA (sample trends for testing)
-- ============================================================
INSERT INTO trends (name, description, platform, niche, viral_score, velocity_percent, hashtags, growth_rate_24h)
VALUES
  (
    'POV: 30 Day Glow Up Challenge',
    'Format transformation before/after avec overlay texte. Niche fitness/beauté.',
    'TikTok', 'Fitness', 96, 96,
    ARRAY['#glowup', '#transformation', '#30daychallenge', '#fitness', '#beforeafter'],
    340.0
  ),
  (
    'Silent CEO Morning Vlog',
    'Vlog silencieux routine matinale business. Audio lo-fi. Fort sur Reels.',
    'Instagram', 'Business', 89, 89,
    ARRAY['#ceolife', '#morningroutine', '#silentmotivation', '#entrepreneur'],
    280.0
  ),
  (
    'Hidden Gem #[n] — Crypto/Invest',
    'Format secret révélé avec compteur. Tension narrative. Forte rétention.',
    'YouTube', 'Finance', 82, 82,
    ARRAY['#crypto', '#invest', '#passiveincome', '#hiddenGem'],
    190.0
  ),
  (
    '60-second Recipe Hack',
    'Recette ultra-rapide en accéléré. Format satisfying.',
    'TikTok', 'Food', 78, 78,
    ARRAY['#recette', '#foodhack', '#recipe', '#cooking'],
    170.0
  ),
  (
    'Outfit Formula Reveal',
    'Formula outfit qui fonctionne toujours. Éducatif + esthétique.',
    'Instagram', 'Fashion', 74, 74,
    ARRAY['#outfitformula', '#stylecheck', '#fashion', '#ootd'],
    155.0
  );
