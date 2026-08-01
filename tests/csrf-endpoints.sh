#!/usr/bin/env bash
#
# Vérifie le contrôle d'origine sur les vraies routes, pas seulement sur la
# fonction qui le décide. Les tests unitaires couvrent la règle ; celui-ci
# couvre son branchement — c'est l'oubli le plus probable, et le plus silencieux.
#
# À lancer contre un serveur de développement, où Cloudflare Access n'est pas
# devant : sur un déploiement réel, Access répondrait 302 avant même que la
# fonction ne s'exécute, et le test ne prouverait rien.
#
#   npx wrangler pages dev --port 8788
#   ./tests/csrf-endpoints.sh [http://127.0.0.1:8788] [id_demande] [id_pro]
#
# Aucune donnée n'est créée ni modifiée : toutes les requêtes sont conçues pour
# être refusées avant d'atteindre la base.

set -u

BASE="${1:-http://127.0.0.1:8788}"
LEAD="${2:-1}"
PRO="${3:-1}"

echecs=0

verifier() {
  local intitule="$1" attendu="$2" obtenu="$3"
  if [ "$obtenu" = "$attendu" ]; then
    printf '  ok    %-58s %s\n' "$intitule" "$obtenu"
  else
    printf '  ÉCHEC %-58s %s (attendu %s)\n' "$intitule" "$obtenu" "$attendu"
    echecs=$((echecs + 1))
  fi
}

# $1 intitulé, $2 chemin, $3 corps, $4 en-tête Origin (ou "-" pour ne pas l'envoyer)
poster() {
  local intitule="$1" chemin="$2" corps="$3" origine="$4"
  local code
  if [ "$origine" = "-" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$chemin" -d "$corps")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$chemin" -H "Origin: $origine" -d "$corps")
  fi
  verifier "$intitule" "403" "$code"
}

echo "Contrôle d'origine sur $BASE"
echo
echo "Origine étrangère"
poster "suppression d'une demande"        "/admin"                "action=supprimer&id=$LEAD"                    "https://exemple-malveillant.fr"
poster "changement de statut d'une demande" "/admin"              "action=statut&id=$LEAD&statut=perdu"          "https://exemple-malveillant.fr"
poster "envoi au professionnel"           "/admin/lead/$LEAD"     "action=envoyer&pro_id=$PRO&sujet=x&corps=y"   "https://exemple-malveillant.fr"
poster "réponse : refus du professionnel" "/admin/lead/$LEAD"     "action=refus&pro_id=$PRO&statut=refuse"       "https://exemple-malveillant.fr"
poster "libération d'une réservation"     "/admin/lead/$LEAD"     "action=liberer&pro_id=$PRO"                   "https://exemple-malveillant.fr"
poster "modification d'une fiche pro"     "/admin/pros"           "action=enregistrer&id=$PRO&raison_sociale=Pirate&email=pirate@example.fr" "https://exemple-malveillant.fr"
poster "bascule d'un statut de fiche"     "/admin/pros"           "action=basculer&id=$PRO&colonne=actif"        "https://exemple-malveillant.fr"
poster "suppression d'une fiche pro"      "/admin/pros"           "action=supprimer&id=$PRO"                     "https://exemple-malveillant.fr"

echo
echo "En-tête Origin absent"
poster "suppression d'une demande"        "/admin"                "action=supprimer&id=$LEAD"                    "-"
poster "envoi au professionnel"           "/admin/lead/$LEAD"     "action=envoyer&pro_id=$PRO&sujet=x&corps=y"   "-"
poster "modification d'une fiche pro"     "/admin/pros"           "action=enregistrer&id=$PRO&raison_sociale=X&email=x@example.fr" "-"

echo
echo "Origine opaque"
poster "suppression d'une demande"        "/admin"                "action=supprimer&id=$LEAD"                    "null"
poster "envoi au professionnel"           "/admin/lead/$LEAD"     "action=envoyer&pro_id=$PRO&sujet=x&corps=y"   "null"
poster "modification d'une fiche pro"     "/admin/pros"           "action=enregistrer&id=$PRO&raison_sociale=X&email=x@example.fr" "null"

echo
echo "Les lectures restent ouvertes"
verifier "GET /admin"            "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"
verifier "GET /admin/pros"       "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/pros")"
verifier "GET /admin/lead/$LEAD" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/lead/$LEAD")"

echo
if [ "$echecs" -eq 0 ]; then
  echo "Toutes les vérifications passent."
else
  echo "$echecs vérification(s) en échec."
fi
exit "$echecs"
