# Simulateurs vocaux — 4 expériences, 1 seul serveur

Regroupe les 4 simulateurs vocaux MyDidactik Stories (Marc, Language Lab, Témoin,
Esprit Tranquille) derrière **un seul serveur Node** au lieu de 4 séparés.

But : un seul plan payant Render (Starter, 7 $/mois) suffit pour que les 4 démos
restent toujours actives (pas de redémarrage à froid), au lieu de payer un plan
pour chacune (jusqu'à 28 $/mois pour le même résultat avec 4 services séparés).

Aucune des 4 apps n'a été modifiée : leur code (prompt, mise en scène, débrief,
outils) est copié tel quel dans son sous-dossier. Seuls la page d'accueil et le
serveur qui les sert sont nouveaux.

## Structure

```
public/
  index.html      ← page d'accueil, menu déroulant "Choisis ton expérience"
  marc/            ← Entretien managérial (copie de "001. Simulateur demo augmentation")
  langues/         ← Language Lab (copie de "002. simulateur-langue")
  histoire/        ← Témoin (copie de "003. Simulateur histoire")
  assurance/       ← Esprit Tranquille (copie de "004. Simulateur assurance")
server.js          ← sert les 4 sous-dossiers + /api/token, /api/debrief, /api/verifier
```

Les 4 apps utilisaient déjà des routes absolues (`/api/token`, `/api/debrief`,
`/api/verifier`) — elles fonctionnent donc sans aucune modification, peu importe
depuis quel sous-dossier elles sont servies.

## Lancer en local

Double-clique `DEMARRER.command` (colle d'abord ta clé Gemini dans `cle-api.txt`).

## Déploiement sur Render

1. Pousser ce dossier sur GitHub (nouveau dépôt).
2. Sur render.com : New → Web Service → connecter le repo.
3. Instance Type : **Starter (7 $/mois)** — pour que ça ne redémarre jamais.
4. Build Command : `npm install` — Start Command : `npm start` (détecté automatiquement).
5. Environment → ajouter la variable `GEMINI_API_KEY` = ta clé Gemini, depuis
   [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Sécurité de la clé

Identique aux 4 apps d'origine : le navigateur ne reçoit jamais `GEMINI_API_KEY`.
À chaque session, le client appelle `POST /api/token` et le serveur fabrique un
jeton éphémère (1 seul usage, expire au bout de 30 min). Le débrief et la
vérification factuelle passent par `POST /api/debrief` et `POST /api/verifier`,
également côté serveur.

## Une fois en ligne

Sur `simulateurs.html`, remplacer les 4 liens des cartes de démo par un seul
lien vers ce service (ex. `https://simulateurs-4-experiences.onrender.com`),
ou garder une carte par expérience pointant directement vers
`.../marc/`, `.../langues/`, `.../histoire/`, `.../assurance/` — au choix.
Les 4 anciens services Render individuels peuvent alors être suspendus ou
supprimés pour arrêter leur facturation.
