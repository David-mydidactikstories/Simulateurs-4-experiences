// Version « démo » du simulateur (page d'accueil publique) : mêmes scénarios, mais sans le contexte
// de l'atelier UCM (collaborateur UCM, Crédit Belge, bpost). Les substitutions sont appliquées
// à la volée au HTML et aux prompts de secours Gemini ; l'original reste intact.
export const DEMO_SUBS = [
  ["<meta name=\"robots\" content=\"noindex, nofollow\">\n", ""],
  ["var QUOTA = 0;", "var QUOTA = 3;"],
  ["return v || \"Bertille\"; }", "return v || \"Ton prénom\"; }"],
  ["au Crédit Belge", "à la Banque Horizon"],
  ["du Crédit Belge", "de la Banque Horizon"],
  ["le Crédit Belge", "la Banque Horizon"],
  ["Crédit Belge", "Banque Horizon"],
  ["Un membre · changer son IBAN", "Un client · changer son IBAN"],
  ["collaborateur UCM", "collaborateur"],
  ["technicien du support informatique interne de l'UCM (fictif)", "technicien du support informatique interne de l'entreprise (fictive)"],
  ["UCM-0457", "INV-0457"],
  ["membre de l'UCM, et qui appelle les services aux membres", "client de l'entreprise, et qui appelle le service clientèle"],
  ["Ton rôle : agent des services aux membres", "Ton rôle : agent du service clientèle"],
  ["Tu travailles aux services aux membres de l\\'UCM. Tu as le dossier du membre sous les yeux.", "Tu travailles au service clientèle de l\\'entreprise. Tu as le dossier du client sous les yeux."],
  ["Allô, services aux membres, bonjour ?", "Allô, service clientèle, bonjour ?"],
  ["Services aux membres, bonjour", "Service clientèle, bonjour"],
  ["Dossier membre", "Dossier client"],
  ["vrai membre", "vrai client"],
  ["Dernière cotisation", "Dernière facture"],
  ["dernière cotisation", "dernière facture"],
  ["conseiller UCM", "conseiller client"],
  ["numéro de membre", "numéro de client"],
  ["l'espace membre", "l'espace client"],
  ["membre chez vous", "client chez vous"],
  ["cotisation", "facture"],
  ["bi-post", "Mondial Relay"],
  ["bpost", "Mondial Relay"],
];

export function applyDemo(text) {
  let t = String(text);
  for (const [a, b] of DEMO_SUBS) t = t.replaceAll(a, b);
  return t;
}
