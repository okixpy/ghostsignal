/**
 * GhostSignal AI — Scraper automatique
 * Scrape TikTok toutes les 2h et détecte les tendances virales
 *
 * Pour lancer manuellement : node src/jobs/scraper.js
 * Pour automatiser : ce script est appelé par server.js toutes les 2h
 */

require('dotenv').config();
const { ApifyClient } = require('apify-client');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// ============================================================
// INIT
// ============================================================
const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// NICHES À SCRAPER
// ============================================================
const NICHES = [
  {
    name: 'Fitness',
    hashtags: ['fitness', 'workout', 'transformation', 'gym', 'glowup'],
    platform: 'TikTok',
  },
  {
    name: 'Business',
    hashtags: ['entrepreneur', 'ceolife', 'morningroutine', 'sidehustle', 'business'],
    platform: 'TikTok',
  },
  {
    name: 'Fashion',
    hashtags: ['outfit', 'ootd', 'fashion', 'stylecheck', 'outfitformula'],
    platform: 'TikTok',
  },
  {
    name: 'Football',
    hashtags: ['football', 'foot', 'ligue1', 'champions league', 'goals'],
    platform: 'TikTok',
  },
];

// ============================================================
// SCRAPER TIKTOK avec Apify
// ============================================================
async function scrapeTikTok(hashtags) {
  console.log(`📡 Scraping TikTok: ${hashtags.join(', ')}`);

  try {
    const run = await apify.actor('clockworks/free-tiktok-scraper').call({
      hashtags: hashtags,
      resultsPerPage: 20,
      maxItems: 20,
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`✅ ${items.length} vidéos récupérées`);
    return items;

  } catch (err) {
    console.error('Erreur Apify:', err.message);
    return [];
  }
}

// ============================================================
// ANALYSER UNE VIDÉO avec OpenAI
// ============================================================
async function analyzeVideo(video, niche) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un expert en viralité des réseaux sociaux.
Analyse une vidéo TikTok et donne un score viral de 0 à 100.
Réponds UNIQUEMENT en JSON valide, sans texte avant ou après.`,
        },
        {
          role: 'user',
          content: `Analyse cette vidéo TikTok :
Description: ${video.text || video.desc || 'N/A'}
Vues: ${video.playCount || video.stats?.playCount || 0}
Likes: ${video.diggCount || video.stats?.diggCount || 0}
Commentaires: ${video.commentCount || video.stats?.commentCount || 0}
Partages: ${video.shareCount || video.stats?.shareCount || 0}
Hashtags: ${(video.hashtags || []).map(h => h.name || h).join(', ')}
Niche: ${niche}

Réponds en JSON :
{
  "viral_score": (0-100),
  "trend_name": "(nom court accrocheur du format/trend)",
  "description": "(description en 1 phrase de pourquoi c'est viral)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "velocity_percent": (0-100),
  "is_emerging": (true/false)
}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const text = completion.choices[0].message.content;
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);

  } catch (err) {
    console.error('Erreur analyse IA:', err.message);
    return null;
  }
}

// ============================================================
// SAUVEGARDER DANS SUPABASE
// ============================================================
async function saveTrend(analysis, niche, platform) {
  if (!analysis || analysis.viral_score < 60) return; // Seuil minimum

  try {
    // Vérifier si la trend existe déjà
    const { data: existing } = await supabase
      .from('trends')
      .select('id')
      .eq('name', analysis.trend_name)
      .single();

    if (existing) {
      // Mettre à jour le score
      await supabase
        .from('trends')
        .update({
          viral_score: analysis.viral_score,
          velocity_percent: analysis.velocity_percent,
        })
        .eq('id', existing.id);
      console.log(`🔄 Trend mise à jour: ${analysis.trend_name}`);
    } else {
      // Insérer nouvelle trend
      await supabase.from('trends').insert({
        name: analysis.trend_name,
        description: analysis.description,
        platform: platform,
        niche: niche,
        viral_score: analysis.viral_score,
        velocity_percent: analysis.velocity_percent,
        hashtags: analysis.hashtags,
        is_real_time: analysis.is_emerging,
        detected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      console.log(`✨ Nouvelle trend: ${analysis.trend_name} (score: ${analysis.viral_score})`);
    }

  } catch (err) {
    console.error('Erreur sauvegarde:', err.message);
  }
}

// ============================================================
// NETTOYER LES VIEILLES TRENDS
// ============================================================
async function cleanOldTrends() {
  const { error } = await supabase
    .from('trends')
    .delete()
    .lt('expires_at', new Date().toISOString());

  if (!error) console.log('🧹 Anciennes trends supprimées');
}

// ============================================================
// JOB PRINCIPAL
// ============================================================
async function runScraper() {
  console.log('\n🚀 GhostSignal Scraper démarré:', new Date().toLocaleString('fr-FR'));
  console.log('================================================');

  for (const niche of NICHES) {
    console.log(`\n📌 Niche: ${niche.name}`);

    // 1. Scraper TikTok
    const videos = await scrapeTikTok(niche.hashtags);

    if (videos.length === 0) {
      console.log('Aucune vidéo trouvée, passage à la niche suivante');
      continue;
    }

    // 2. Prendre les 5 meilleures vidéos (plus de vues)
    const topVideos = videos
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 5);

    // 3. Analyser chaque vidéo avec l'IA
    for (const video of topVideos) {
      const analysis = await analyzeVideo(video, niche.name);
      if (analysis) {
        await saveTrend(analysis, niche.name, niche.platform);
      }
      // Pause pour ne pas surcharger l'API OpenAI
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 4. Nettoyer les vieilles trends
  await cleanOldTrends();

  console.log('\n✅ Scraping terminé:', new Date().toLocaleString('fr-FR'));
  console.log('================================================\n');
}

// ============================================================
// LANCER LE SCRAPER
// ============================================================
runScraper().catch(console.error);

// ============================================================
// EXPORT pour server.js (automatisation toutes les 2h)
// ============================================================
module.exports = { runScraper };
