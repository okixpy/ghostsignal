/**
 * GhostSignal AI — Backend Node.js
 * Stack: Express + Supabase + Stripe + OpenAI
 *
 * Installation:
 * npm install express cors dotenv @supabase/supabase-js stripe openai apify-client
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// ============================================================
// IMPORTS
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const OpenAI = require('openai');

// ============================================================
// INIT
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service role key (server-side only!)
);

// Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Raw body for Stripe webhooks (MUST be before express.json)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// JSON parser
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../pages')));

// ============================================================
// STRIPE PLANS CONFIG
// ============================================================
const PLANS = {
  starter: {
    name: 'Starter',
    price: 9,
    priceId: process.env.STRIPE_PRICE_STARTER,   // From Stripe dashboard
    features: ['5 trends/week', '1 niche', 'Viral score', 'Hashtags'],
  },
  creator: {
    name: 'Creator',
    price: 19,
    priceId: process.env.STRIPE_PRICE_CREATOR,
    features: ['Unlimited trends', 'AI scripts', '3 niches', 'Email alerts', 'Discord access'],
  },
  pro: {
    name: 'Pro',
    price: 49,
    priceId: process.env.STRIPE_PRICE_PRO,
    features: ['Everything in Creator', 'Real-time alerts', 'Unlimited niches', 'API access', 'Weekly reports'],
  },
};

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new Error('Token invalide');
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Non autorisé' });
  }
}

// ============================================================
// ROUTES — AUTH
// ============================================================

/**
 * POST /api/auth/signup
 * Crée un compte et redirige vers Stripe si plan payant
 */
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, plan = 'creator' } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, plan },
    });

    if (authError) throw new Error(authError.message);

    const userId = authData.user.id;

    // 2. Create user profile in DB
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email,
        name,
        plan,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

    if (profileError) throw new Error(profileError.message);

    // 3. Create Stripe customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { supabase_id: userId, plan },
    });

    // 4. Save Stripe customer ID
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', userId);

    // 5. Create Stripe Checkout session
    const planConfig = PLANS[plan];
    if (!planConfig || !planConfig.priceId) {
      throw new Error('Plan invalide');
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard.html?signup=success`,
      cancel_url: `${process.env.FRONTEND_URL}/signup.html?cancelled=true`,
      metadata: { userId, plan },
    });

    res.json({ checkoutUrl: session.url });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/auth/signin
 */
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Identifiants incorrects');

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name || email,
        plan: profile?.plan || 'starter',
        token: data.session.access_token,
      },
    });

  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  res.json({ user: { ...req.user, ...profile } });
});

// ============================================================
// ROUTES — TRENDS
// ============================================================

/**
 * GET /api/trends
 * Retourne les tendances selon le plan de l'utilisateur
 */
app.get('/api/trends', requireAuth, async (req, res) => {
  const { platform, niche, limit = 20 } = req.query;

  // Get user plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, status')
    .eq('id', req.user.id)
    .single();

  // Restrict for starter plan
  const maxResults = profile?.plan === 'starter' ? 5 : parseInt(limit);
  const isRealtime = profile?.plan === 'pro';

  try {
    let query = supabase
      .from('trends')
      .select('*')
      .order('viral_score', { ascending: false })
      .limit(maxResults);

    if (platform) query = query.eq('platform', platform);
    if (niche) query = query.eq('niche', niche);

    // Only real-time for Pro users
    if (!isRealtime) {
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6h ago
      query = query.gte('created_at', cutoff.toISOString());
    }

    const { data: trends, error } = await query;
    if (error) throw error;

    res.json({
      trends,
      meta: {
        plan: profile?.plan,
        total: trends.length,
        maxAllowed: maxResults,
      },
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/trends/:id/script
 * Génère un script IA pour une tendance
 */
app.get('/api/trends/:id/script', requireAuth, async (req, res) => {
  // Check plan — only Creator+ can generate scripts
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, status')
    .eq('id', req.user.id)
    .single();

  if (profile?.plan === 'starter') {
    return res.status(403).json({ error: 'Plan Creator requis pour générer des scripts' });
  }

  const { data: trend } = await supabase
    .from('trends')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!trend) return res.status(404).json({ error: 'Tendance introuvable' });

  const { niche = '' } = req.query;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un expert en création de contenu viral pour TikTok, Instagram et YouTube.
Génère des scripts courts, accrocheurs, avec un hook puissant et un CTA clair.
Réponds UNIQUEMENT avec le script formaté, sans explication.`,
        },
        {
          role: 'user',
          content: `Génère un script viral pour cette tendance :
Tendance : "${trend.name}"
Plateforme : ${trend.platform}
Niche : ${niche || trend.niche}
Description : ${trend.description}
Hashtags : ${(trend.hashtags || []).join(', ')}

Format attendu :
HOOK (0-3 sec) : [accroche choc]
INTRO (3-8 sec) : [contexte rapide]
CORPS (8-35 sec) : [3 points de valeur]
CTA (35-45 sec) : [appel à l'action]`,
        },
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    const script = completion.choices[0].message.content;

    // Save script to DB
    await supabase.from('generated_scripts').insert({
      user_id: req.user.id,
      trend_id: trend.id,
      content: script,
      niche: niche || trend.niche,
    });

    res.json({ script, trend });

  } catch (err) {
    res.status(500).json({ error: 'Erreur génération IA: ' + err.message });
  }
});

// ============================================================
// ROUTES — SAVED TRENDS
// ============================================================

app.post('/api/trends/:id/save', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('saved_trends')
    .upsert({ user_id: req.user.id, trend_id: req.params.id });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/saved', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('saved_trends')
    .select('*, trends(*)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ saved: data });
});

// ============================================================
// ROUTES — SUBSCRIPTION
// ============================================================

/**
 * POST /api/subscription/portal
 * Stripe Customer Portal — manage subscription
 */
app.post('/api/subscription/portal', requireAuth, async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', req.user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'Aucun abonnement actif' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/dashboard/subscription`,
  });

  res.json({ url: session.url });
});

/**
 * POST /api/subscription/upgrade
 * Upgrade/downgrade plan
 */
app.post('/api/subscription/upgrade', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const planConfig = PLANS[plan];
  if (!planConfig) return res.status(400).json({ error: 'Plan invalide' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', req.user.id)
    .single();

  const session = await stripe.checkout.sessions.create({
    customer: profile.stripe_customer_id,
    payment_method_types: ['card'],
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.FRONTEND_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.FRONTEND_URL}/dashboard/subscription`,
    metadata: { userId: req.user.id, plan },
  });

  res.json({ checkoutUrl: session.url });
});

// ============================================================
// STRIPE WEBHOOK
// ============================================================

app.post('/api/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, plan } = session.metadata;

      if (userId) {
        await supabase
          .from('profiles')
          .update({
            plan,
            status: 'active',
            stripe_subscription_id: session.subscription,
          })
          .eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;

      await supabase
        .from('profiles')
        .update({ plan: 'free', status: 'cancelled' })
        .eq('stripe_subscription_id', sub.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;

      await supabase
        .from('profiles')
        .update({ status: 'payment_failed' })
        .eq('stripe_customer_id', invoice.customer);
      break;
    }
  }

  res.json({ received: true });
});

// ============================================================
// ROUTES — WAITLIST
// ============================================================

app.post('/api/waitlist', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const { error } = await supabase
    .from('waitlist')
    .upsert({ email, created_at: new Date().toISOString() });

  if (error) return res.status(400).json({ error: 'Déjà inscrit ou erreur' });
  res.json({ success: true, message: 'Bienvenue dans la liste !' });
});

// ============================================================
// ROUTES — ADMIN (protected)
// ============================================================

app.get('/api/admin/stats', async (req, res) => {
  // Basic admin auth via secret header
  if (req.headers['x-admin-key'] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [users, trends, waitlist] = await Promise.all([
    supabase.from('profiles').select('count', { count: 'exact', head: true }),
    supabase.from('trends').select('count', { count: 'exact', head: true }),
    supabase.from('waitlist').select('count', { count: 'exact', head: true }),
  ]);

  res.json({
    users: users.count,
    trends: trends.count,
    waitlist: waitlist.count,
  });
});

// ============================================================
// CATCH-ALL → Serve index.html (SPA)
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/index.html'));
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 GhostSignal server running on http://localhost:${PORT}`);
});

module.exports = app;

// ============================================================
// SCRAPER AUTOMATIQUE — toutes les 2h
// ============================================================
const { runScraper } = require('../jobs/scraper');

// Lancer au démarrage
setTimeout(() => {
  runScraper().catch(console.error);
}, 5000); // 5 secondes après le démarrage

// Puis toutes les 2h
setInterval(() => {
  runScraper().catch(console.error);
}, 2 * 60 * 60 * 1000);

console.log('⏰ Scraper automatique activé (toutes les 2h)');
