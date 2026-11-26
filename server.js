// Serveur unique pour les 4 simulateurs vocaux MyDidactik Stories :
//   /marc/      → « Le Face-à-Face | Entretien avec Marc » (management)
//   /langues/   → « Language Lab » (langues)
//   /histoire/  → « Témoin » (histoire)
//   /assurance/ → « Esprit Tranquille » (vente / assurance)
//
// But de ce regroupement : un seul service Render (donc un seul plan payant
// Starter à 7 $/mois) suffit pour que les 4 démos restent toujours actives,
// au lieu de payer un plan séparé pour chacune.
//
// La clé Gemini reste ici, côté serveur (variable d'environnement GEMINI_API_KEY).
// Les visiteurs n'ont rien à configurer. Chacune des 4 pages appelle les mêmes
// routes /api/token, /api/debrief, /api/verifier — exactement comme quand elles
// tournaient chacune sur leur propre serveur : aucun code des 4 apps n'a été modifié.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// --- Où trouver la clé, dans l'ordre ---------------------------------------
// 1. la variable d'environnement GEMINI_API_KEY (c'est ce qu'utilise Render) ;
// 2. le fichier .env (convention développeur, caché dans le Finder) ;
// 3. le fichier cle-api.txt (visible, à ouvrir en double-clic).
// Les fichiers 2 et 3 sont ignorés par git : la clé ne part jamais sur GitHub.

function lireFichierVisible() {
  try {
    const fichier = path.join(__dirname, 'cle-api.txt');
    if (!fs.existsSync(fichier)) return null;
    const texte = fs.readFileSync(fichier, 'utf8');
    const connu = texte.match(/(?:AQ\.[A-Za-z0-9._\-]{20,}|AIza[A-Za-z0-9_\-]{20,})/);
    if (connu) return connu[0];
    const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (let i = lignes.length - 1; i >= 0; i--) {
      if (/^[A-Za-z0-9._\-]{25,}$/.test(lignes[i])) return lignes[i];
    }
    return null;
  } catch (e) { return null; }
}

function lireEnvLocal() {
  try {
    const fichier = path.join(__dirname, '.env');
    if (!fs.existsSync(fichier)) return null;
    for (const ligne of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(ligne)) continue;
      const m = ligne.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const valeur = m[2].trim().replace(/^["']|["']$/g, '');
      if (!valeur) continue;
      if (m[1] === 'GEMINI_API_KEY') return valeur;
      if (!process.env[m[1]]) process.env[m[1]] = valeur;   // UMAMI_* etc.
    }
  } catch (e) {}
  return null;
}

function resoudreCle() {
  const env = (process.env.GEMINI_API_KEY || '').trim();
  if (env) return { cle: env, source: "la variable d'environnement" };
  const dotenv = lireEnvLocal();
  if (dotenv) return { cle: dotenv.trim(), source: 'le fichier .env' };
  const visible = lireFichierVisible();
  if (visible) return { cle: visible.trim(), source: 'le fichier cle-api.txt' };
  return { cle: '', source: null };
}

const { cle: API_KEY, source: SOURCE_CLE } = resoudreCle();
if (!API_KEY) {
  console.warn("\n⚠️  Aucune clé Gemini trouvée.");
  console.warn("   Ouvre le fichier « cle-api.txt » (à côté de server.js) et colle ta clé dedans.");
  console.warn("   Elle se récupère sur https://aistudio.google.com/apikey\n");
} else {
  const empreinte = API_KEY.slice(0, 3) + '…' + API_KEY.slice(-4) + ' (' + API_KEY.length + ' caractères)';
  console.log('🔑 Clé Gemini chargée depuis ' + SOURCE_CLE + ' — ' + empreinte);
  if (!/^(AQ\.|AIza)/.test(API_KEY)) {
    console.warn("   ⚠️  Format inhabituel : les clés Gemini commencent par « AQ. » ou « AIza ». On tente quand même.");
  }
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Modèles pour le débrief / la vérification (du plus récent au plus ancien, avec repli auto)
const DEBRIEF_MODELS = [
  'gemini-3.1-flash',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash',
];

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { req.destroy(); reject(new Error('too_big')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// 1) Token éphémère pour la conversation vocale en temps réel (API Live).
//    Généré à chaque session, expire tout seul : la vraie clé ne quitte jamais le serveur.
//    Commun aux 4 expériences : le token n'est pas spécifique à un scénario.
async function handleToken(req, res) {
  if (!API_KEY) {
    console.error("Refus : aucune clé Gemini n'est configurée.");
    return sendJSON(res, 500, { error: 'cle_absente' });
  }
  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    sendJSON(res, 200, { token: token.name });
  } catch (e) {
    const msg = (e && (e.message || String(e))) || 'inconnu';
    console.error('\n❌ Gemini a refusé de créer le jeton éphémère :');
    console.error('   ' + msg + '\n');
    const invalide = /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(msg);
    sendJSON(res, 500, { error: invalide ? 'cle_invalide' : 'token_failed', detail: msg.slice(0, 240) });
  }
}

// 2) Débrief de fin de session (analyse de la transcription). Utilisé par les 4 expériences,
//    chacune envoie son propre prompt déjà composé côté client — le serveur ne fait
//    qu'appeler Gemini avec ce prompt, sans rien connaître du scénario.
async function handleDebrief(req, res) {
  let prompt = '';
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    prompt = (body.prompt || '').toString();
  } catch (e) { /* ignore */ }
  if (!prompt) return sendJSON(res, 400, { error: 'prompt_manquant' });

  let lastErr = null;
  for (const model of DEBRIEF_MODELS) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.3 },
      });
      const text = (r.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      return sendJSON(res, 200, JSON.parse(text));
    } catch (e) {
      lastErr = e;
    }
  }
  console.error('Erreur débrief:', lastErr && (lastErr.message || lastErr));
  sendJSON(res, 500, { error: 'ia_indisponible' });
}

// 3) Vérification factuelle en temps réel — utilisée uniquement par /assurance/,
//    mais la route reste ouverte à tous (les autres expériences ne l'appellent jamais).
async function handleVerifier(req, res) {
  let texte = '', fiche = '';
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    texte = (body.texte || '').toString().slice(0, 2000);
    fiche = (body.fiche || '').toString().slice(0, 6000);
  } catch (e) { /* ignore */ }
  if (!texte || !fiche) return sendJSON(res, 400, { error: 'parametres_manquants' });

  const prompt = `Tu vérifies si une phrase prononcée par un commercial pendant un appel de vente d'assurance contient une erreur factuelle sur le produit qu'il vend.

FICHE PRODUIT (source de vérité) :
${fiche}

PHRASE PRONONCÉE PAR LE COMMERCIAL :
"${texte}"

AVERTISSEMENT : c'est une transcription vocale automatique, parfois imparfaite ou coupée en plein milieu. Ne signale une erreur QUE si un chiffre (prix, capital), une garantie, une exclusion ou une condition est clairement et sans ambiguïté contredit par la fiche. En cas de doute, ou si la phrase ne contient aucune affirmation vérifiable sur le produit, ne signale rien.

Retourne UNIQUEMENT un objet JSON, sans texte autour :
{"erreur": true|false, "champ": "prix"|"garantie"|"exclusion"|"condition"|null, "correction": "la donnée exacte selon la fiche, en une courte phrase, ou null"}`;

  let lastErr = null;
  for (const model of DEBRIEF_MODELS) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0 },
      });
      const text = (r.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      return sendJSON(res, 200, JSON.parse(text));
    } catch (e) {
      lastErr = e;
    }
  }
  console.error('Erreur vérification:', lastErr && (lastErr.message || lastErr));
  sendJSON(res, 500, { error: 'ia_indisponible' });
}

// 4) Analytics (Umami) — injecté seulement si la variable d'environnement existe.
const UMAMI_ID = (process.env.UMAMI_WEBSITE_ID || '').trim();
const UMAMI_SRC = (process.env.UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js').trim();
const ANALYTICS_TAG = UMAMI_ID
  ? `<script defer src="${UMAMI_SRC}" data-website-id="${UMAMI_ID}"></script>`
  : '';
if (!UMAMI_ID) {
  console.log('ℹ️  Analytics désactivées (UMAMI_WEBSITE_ID non définie).');
}

// Fichiers statiques : les 4 apps vivent chacune dans son sous-dossier
// (public/marc/, public/langues/, public/histoire/, public/assurance/), plus la
// page d'accueil à la racine (public/index.html). "/marc" et "/marc/" pointent
// tous les deux vers public/marc/index.html.
function handleStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  else if (!path.extname(urlPath)) urlPath += '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    let body = data;
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') {
      body = Buffer.from(data.toString('utf8').replace('<!--ANALYTICS-->', ANALYTICS_TAG), 'utf8');
      headers['Cache-Control'] = 'no-cache';
    }
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(200, headers);
    res.end(body);
  });
}

// « Phishing ou pas ? » : module ES (Express + ws + SDK Gemini 3.x) monté sur /phishing/.
// Il vit dans phishing/ avec ses propres dépendances (installées via le script postinstall),
// pour ne rien changer au SDK Gemini 1.x utilisé par les 4 autres expériences.
let phishing = null;
import('./phishing/app.js')
  .then((m) => { phishing = m.createPhishing(); console.log('✅ Module /phishing/ chargé'); })
  .catch((e) => console.error('⚠️  Module /phishing/ indisponible :', e && (e.message || e)));

const PHISHING_PREFIX = '/phishing';
function estPhishing(url) { return url === PHISHING_PREFIX || url.startsWith(PHISHING_PREFIX + '/') || url.startsWith(PHISHING_PREFIX + '?'); }

const server = http.createServer((req, res) => {
  if (estPhishing(req.url || '')) {
    if (!phishing) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Module phishing indisponible.'); }
    if (req.url === PHISHING_PREFIX) { res.writeHead(301, { Location: PHISHING_PREFIX + '/' }); return res.end(); }
    req.url = req.url.slice(PHISHING_PREFIX.length) || '/';
    return phishing.handle(req, res);
  }
  if (req.method === 'POST' && req.url === '/api/token') return handleToken(req, res);
  if (req.method === 'POST' && req.url === '/api/debrief') return handleDebrief(req, res);
  if (req.method === 'POST' && req.url === '/api/verifier') return handleVerifier(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return handleStatic(req, res);
  res.writeHead(405); res.end();
});

server.on('upgrade', (request, socket, head) => {
  const chemin = (request.url || '').split('?')[0];
  if (phishing && chemin === PHISHING_PREFIX + '/api/live') return phishing.upgrade(request, socket, head);
  socket.destroy();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('✅ Serveur prêt sur le port ' + PORT + ' — /marc/ /langues/ /histoire/ /assurance/ /phishing/'));
