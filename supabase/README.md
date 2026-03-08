# 🚀 GhostSignal AI — Guide Complet MVP

> Radar de viralité IA pour TikTok, Instagram, YouTube Shorts et Reddit

---

## 📁 Architecture du projet

```
ghostsignal/
├── src/
│   ├── pages/
│   │   ├── index.html        ← Landing page
│   │   ├── signup.html       ← Inscription / Connexion
│   │   └── dashboard.html    ← Dashboard utilisateur
│   └── api/
│       └── server.js         ← Backend Express
├── supabase/
│   └── schema.sql            ← Structure base de données
├── .env.example              ← Template variables d'environnement
├── package.json
└── README.md
```

---

## ⚡ Installation en 10 minutes

### Étape 1 — Cloner et installer

```bash
git clone https://github.com/ton-repo/ghostsignal
cd ghostsignal
npm install
cp .env.example .env
```

### Étape 2 — Configurer Supabase (gratuit)

1. Va sur [supabase.com](https://supabase.com) → New Project
2. **Settings → API** → copie `URL` et les deux clés
3. **SQL Editor** → colle le contenu de `supabase/schema.sql` → Run
4. Remplis `.env` avec tes clés Supabase

### Étape 3 — Configurer Stripe (gratuit pour commencer)

1. Va sur [stripe.com](https://stripe.com) → Compte test
2. **Products** → Crée 3 produits :
   - Starter : 9€/mois récurrent → copie le `price_id`
   - Creator : 19€/mois récurrent → copie le `price_id`
   - Pro : 49€/mois récurrent → copie le `price_id`
3. **Developers → API Keys** → copie tes clés
4. Remplis `.env` avec tes clés Stripe

### Étape 4 — Configurer OpenAI

1. [platform.openai.com](https://platform.openai.com) → API Keys → Create
2. Ajoute dans `.env`

### Étape 5 — Lancer en local

```bash
npm run dev
# → http://localhost:3000
```

### Étape 6 — Tester Stripe webhooks en local

```bash
# Installer Stripe CLI : https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copie le webhook secret dans .env STRIPE_WEBHOOK_SECRET
```

---

## 🌐 Déploiement Production

### Option A — Railway (recommandé, simple)

```bash
# 1. Installer Railway CLI
npm install -g @railway/cli

# 2. Login et déploiement
railway login
railway init
railway up

# 3. Configurer les variables d'environnement
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL=...
# (répéter pour toutes les variables du .env)

# 4. Domaine custom
# Dashboard Railway → Settings → Custom Domain
```

**Prix Railway :** ~5$/mois pour un MVP → très correct.

---

### Option B — Vercel + Railway séparés

**Frontend (Vercel) :**
```bash
# Vercel déploie automatiquement les fichiers statiques
npm install -g vercel
vercel --prod
```

**Backend (Railway) :**
```bash
railway up
```

> Mets à jour `FRONTEND_URL` dans `.env` avec ton domaine Vercel.

---

## 🗄️ Structure Base de Données Supabase

| Table | Description |
|-------|-------------|
| `profiles` | Utilisateurs + plan + Stripe IDs |
| `trends` | Tendances virales détectées |
| `generated_scripts` | Scripts IA générés par user |
| `saved_trends` | Tendances sauvegardées |
| `waitlist` | Emails liste d'attente |
| `usage_logs` | Tracking usage par user |

---

## 💳 Plans Stripe

| Plan | Prix | Limites |
|------|------|---------|
| Starter | 9€/mois | 5 trends/semaine, 1 niche |
| Creator | 19€/mois | Illimité + scripts IA + 3 niches |
| Pro | 49€/mois | Tout + temps réel + API + support |

---

## 🔌 APIs Disponibles

```
POST /api/auth/signup          ← Créer compte + Stripe checkout
POST /api/auth/signin          ← Connexion
GET  /api/auth/me              ← Profil utilisateur (auth requis)

GET  /api/trends               ← Liste tendances (auth requis)
GET  /api/trends/:id/script    ← Générer script IA (Creator+ requis)
POST /api/trends/:id/save      ← Sauvegarder tendance
GET  /api/saved                ← Tendances sauvegardées

POST /api/subscription/portal   ← Portail Stripe billing
POST /api/subscription/upgrade  ← Upgrade plan

POST /api/webhooks/stripe       ← Webhook Stripe (interne)
POST /api/waitlist              ← Rejoindre waitlist
GET  /api/admin/stats           ← Stats admin (x-admin-key requis)
```

---

## 🤖 Automatisation avec l'IA (Stack gratuit)

### Scraping TikTok Trends — Apify (freemium)
```javascript
// Dans server.js, ajouter cette fonction
const { ApifyClient } = require('apify-client');

async function scrapeTikTokTrends() {
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

  const run = await client.actor('clockworks/tiktok-scraper').call({
    hashtags: ['trending', 'viral', 'fyp'],
    maxItems: 100,
    sortBy: 'mostViewed',
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  // Analyse et insère dans Supabase trends table
  return items;
}
```

### Automatisation complète (gratuit)

| Outil | Usage | Coût |
|-------|-------|------|
| **Apify** | Scraper TikTok/Instagram | Gratuit 5$/mois |
| **n8n** (self-hosted) | Automatiser analyse + envoi email | Gratuit |
| **Make.com** | Workflow: scrape → analyse → alerte | Gratuit 1000 ops/mois |
| **Resend** | Emails transactionnels | Gratuit 3000/mois |
| **Loops.so** | Newsletter automatisée | Gratuit jusqu'à 1000 contacts |

### Workflow automatisé (Make.com)
```
1. Apify scrape TikTok (toutes les 2h)
   ↓
2. OpenAI analyse chaque vidéo → viral score
   ↓
3. Si score > 70 → insérer dans Supabase trends
   ↓
4. Supabase → déclencher edge function
   ↓
5. Resend → email alerte aux users Pro/Creator
```

---

## 🎯 Stratégie pour obtenir les 100 premiers clients

### Semaine 1 — Construire l'audience organique

**TikTok / Instagram Reels :**
Poste 2x/jour avec ces formats ultra-performants :

```
Video 1 : "Cette trend TikTok va exploser dans 48h [preuve d'écran]"
Video 2 : "J'ai analysé 1000 TikTok. Voici le pattern caché"
Video 3 : "Les 3 trends Instagram qui vont péter la semaine prochaine"
```

**Twitter/X :**
```
Thread quotidien : "🚨 Top 5 trends virales du jour [avec scores]"
→ Mentionne @créateurs populaires quand leurs niches sont concernées
```

### Semaine 2 — Newsletter gratuite

Lance une newsletter Beehiiv (gratuit) ou Substack :
**"GhostSignal Weekly : 3 trends avant qu'elles explosent"**

→ Lien dans bio TikTok/Instagram/Twitter
→ Chaque email se termine par : "Recevez 20 tendances/semaine → GhostSignal.io"

**Taux de conversion newsletter → paid : 2-5%**
100 inscrits = 2-5 payants dès la semaine 2.

### Semaine 3 — Communautés existantes

Poste dans ces endroits (gratuit) :
- Reddit : r/Entrepreneur, r/SideProject, r/TikTokCreators
- Facebook Groups : "Créateurs TikTok FR", "Social Media Marketing FR"
- Discord : serveurs de créateurs avec 1000+ membres
- Product Hunt : lance ton MVP le mardi matin (heure US)

**Message type Reddit :**
```
"J'ai construit un outil qui détecte les trends TikTok/Instagram
AVANT qu'elles deviennent virales. 94% de précision sur les 30
derniers jours. Version bêta gratuite pour 50 personnes."
```

### Semaine 4 — Partenariats créateurs

1. Identifie 20 créateurs FR avec 5k-50k abonnés (taille idéale)
2. DM personnalisé :
```
"Salut [prénom], j'ai un outil qui détecte les trends avant
qu'elles explosent — ça collerait parfaitement à ta niche [X].
Je t'offre 3 mois gratuits en échange d'un honest review ?"
```
3. 5-10% de conversion = 1-2 partenaires → chaque partenaire ramène 10-50 users

### Tableau de bord 100 premiers clients

| Source | Effort | Clients estimés |
|--------|--------|-----------------|
| TikTok organique | 2 vidéos/jour × 4 semaines | 20-40 |
| Newsletter | 1 email/semaine | 5-15 |
| Reddit/communautés | 10 posts ciblés | 10-20 |
| Product Hunt | 1 launch | 10-30 |
| Partenaires créateurs | 5 DMs/jour | 15-30 |
| **Total** | | **60-135 clients** |

### Objectif revenu

```
100 clients × 19€ moyen = 1 900€/mois dès le mois 1
500 clients × 20€ moyen = 10 000€/mois (3-6 mois)
```

---

## 📊 Métriques à tracker dès le jour 1

- **Waitlist emails** : objectif 500 avant launch
- **Conversion waitlist → payant** : objectif 10%+
- **Churn mensuel** : objectif < 5%
- **MRR (Monthly Recurring Revenue)** : +20% par mois
- **NPS** : sondage après 30 jours d'utilisation

---

## 🔒 Checklist avant lancement

- [ ] Domaine acheté (Namecheap ~12€/an)
- [ ] SSL configuré (gratuit avec Railway/Vercel)
- [ ] Schema Supabase déployé
- [ ] Plans Stripe créés et testés
- [ ] Variables d'environnement configurées
- [ ] Webhook Stripe configuré et testé
- [ ] Email transactionnel configuré (Resend)
- [ ] Page CGU et Confidentialité créées
- [ ] Test complet : signup → paiement → dashboard
- [ ] Analytics configuré (Plausible ou GA4)
- [ ] Monitoring erreurs (Sentry gratuit)

---

## 💡 Prochaines features (après les 100 premiers clients)

1. **Alertes email automatiques** (tendance > score 85 dans ta niche)
2. **Extension Chrome** : badge viral score sur TikTok
3. **API publique** pour agences marketing
4. **Rapport hebdo IA** : PDF automatique avec top trends
5. **White label** : revendre la plateforme à des agences
6. **Niches verticales** : GhostSignal Fitness, GhostSignal Crypto, etc.

---

*GhostSignal AI — Détecte les trends avant qu'elles explosent* 👻⚡
