/**
 * Choix du professionnel à qui transmettre une demande.
 *
 * Le nombre de professionnels référencés se compte en dizaines : la sélection
 * se fait donc en mémoire, sur une liste déjà réduite aux éligibles par la
 * base. C'est plus lisible qu'un jeu de LIKE sur des colonnes CSV, et cela
 * garde une seule définition de « compatible », partagée par la recommandation
 * et par la liste des remplaçants.
 */

export type Professionnel = {
  id: number;
  created_at: string;
  raison_sociale: string;
  contact_nom: string | null;
  email: string;
  telephone: string | null;
  siret: string | null;
  metiers: string;
  communes: string;
  priorite: number;
  actif: number;
  disponible: number;
  email_verifie: number;
  dernier_lead_at: string | null;
  dernier_lead_id: number | null;
  note_interne: string | null;
};

export type Attribution = {
  id: number;
  created_at: string;
  lead_id: number;
  professionnel_id: number;
  statut: string;
  motif: string | null;
  email_envoye: number;
};

/**
 * Ce dont la sélection a besoin : ni les coordonnées, ni la description.
 * Les colonnes sont facultatives pour accepter aussi bien une ligne complète
 * lue en base qu'une demande partielle en cours de saisie.
 */
export type LeadRoutable = {
  id: number;
  metier?: string | null;
  ville?: string | null;
  commune?: string | null;
  pro_actif_id?: number | null;
};

/**
 * Forme canonique d'un métier ou d'une commune.
 * « Saint-Georges-sur-Baulche », « saint georges sur baulche » et
 * « SAINT-GEORGES-SUR-BAULCHE » doivent désigner la même zone : la saisie
 * libre du demandeur ne correspondra jamais au slug de la fiche autrement.
 */
export function enSlug(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Découpe une colonne CSV de la fiche professionnel en slugs. */
export function listeSlugs(csv: unknown): string[] {
  return String(csv ?? '')
    .split(',')
    .map(enSlug)
    .filter(Boolean);
}

/**
 * Zones auxquelles rattacher la demande. On retient la ville de la page
 * d'origine ET la commune saisie par le demandeur : les deux diffèrent
 * souvent (page « Auxerre », commune « Monéteau »), et une couverture de
 * l'une ou de l'autre suffit à rendre le professionnel pertinent.
 */
export function zonesDuLead(lead: Pick<LeadRoutable, 'ville' | 'commune'>): string[] {
  return [enSlug(lead.ville), enSlug(lead.commune)].filter(Boolean);
}

export type MotifIncompatibilite = 'metier' | 'zone';

/**
 * Compatibilité métier + zone, hors éligibilité (actif, disponible, vérifié)
 * qui est filtrée en amont par la requête.
 */
export function incompatibilite(
  pro: Professionnel,
  lead: Pick<LeadRoutable, 'metier' | 'ville' | 'commune'>
): MotifIncompatibilite | null {
  const metierDemande = enSlug(lead.metier);
  const metiersDuPro = listeSlugs(pro.metiers);

  // Un professionnel sans métier déclaré ne reçoit rien : mieux vaut une
  // fiche incomplète qui ne sert jamais qu'une fiche qui reçoit tout.
  if (!metierDemande || !metiersDuPro.includes(metierDemande)) return 'metier';

  const communesDuPro = listeSlugs(pro.communes);
  // Liste vide = tout le département. C'est le cas courant d'un artisan qui
  // se déplace partout dans l'Yonne, et l'exiger commune par commune serait
  // une source d'erreur permanente.
  if (communesDuPro.length === 0) return null;

  const zones = zonesDuLead(lead);
  if (zones.some((zone) => communesDuPro.includes(zone))) return null;

  return 'zone';
}

/**
 * Ordre de passage entre professionnels également compatibles.
 * 1. priorité décroissante — le classement voulu par l'administrateur ;
 * 2. le moins récemment servi d'abord — rotation équitable, un professionnel
 *    jamais servi (dernier_lead_at NULL) passe en tête ;
 * 3. identifiant croissant — départage stable, pour que deux affichages
 *    successifs ne renvoient jamais un ordre différent.
 */
export function comparerPros(a: Professionnel, b: Professionnel): number {
  if (a.priorite !== b.priorite) return b.priorite - a.priorite;

  const aQuand = a.dernier_lead_at ?? '';
  const bQuand = b.dernier_lead_at ?? '';
  if (aQuand !== bQuand) return aQuand < bQuand ? -1 : 1;

  return a.id - b.id;
}

export type Ecarte = { pro: Professionnel; motif: string };

export type Selection = {
  /** Professionnel recommandé, ou null si aucun candidat. */
  recommande: Professionnel | null;
  /** Candidats compatibles et encore proposables, recommandé inclus, dans l'ordre. */
  candidats: Professionnel[];
  /** Professionnels écartés, avec la raison — affiché pour lever le doute. */
  ecartes: Ecarte[];
};

const STATUTS_QUI_EXCLUENT = new Set(['envoye', 'refuse', 'indisponible']);

/**
 * Un professionnel qui a déjà reçu cette demande, l'a refusée ou s'est
 * déclaré indisponible ne doit plus être proposé pour elle. Les échecs
 * d'envoi n'excluent pas : ils justifient au contraire une nouvelle tentative.
 */
export function idsDejaSollicites(historique: Attribution[]): Set<number> {
  const ids = new Set<number>();
  for (const ligne of historique) {
    if (STATUTS_QUI_EXCLUENT.has(ligne.statut)) ids.add(ligne.professionnel_id);
  }
  return ids;
}

function motifLisible(pro: Professionnel, deja: Set<number>, incompat: MotifIncompatibilite | null): string | null {
  if (pro.actif !== 1) return 'fiche inactive';
  if (pro.disponible !== 1) return 'déclaré indisponible';
  if (pro.email_verifie !== 1) return 'adresse e-mail non vérifiée';
  if (incompat === 'metier') return 'métier non couvert';
  if (incompat === 'zone') return 'commune hors zone';
  if (deja.has(pro.id)) return 'déjà sollicité pour cette demande';
  return null;
}

/**
 * Trie l'ensemble des professionnels en candidats et écartés.
 * `tous` doit contenir toutes les fiches, y compris inactives : c'est ce qui
 * permet d'expliquer une absence de candidat au lieu d'afficher une page vide.
 */
export function selectionner(
  tous: Professionnel[],
  lead: Pick<LeadRoutable, 'metier' | 'ville' | 'commune'>,
  historique: Attribution[]
): Selection {
  const deja = idsDejaSollicites(historique);
  const candidats: Professionnel[] = [];
  const ecartes: Ecarte[] = [];

  for (const pro of tous) {
    const motif = motifLisible(pro, deja, incompatibilite(pro, lead));
    if (motif) ecartes.push({ pro, motif });
    else candidats.push(pro);
  }

  candidats.sort(comparerPros);

  return { recommande: candidats[0] ?? null, candidats, ecartes };
}

/** Charge tout ce qu'il faut pour router une demande, en une seule fois. */
export async function chargerRoutage(
  db: D1Database,
  lead: LeadRoutable
): Promise<{ selection: Selection; historique: Attribution[]; tous: Professionnel[] }> {
  const [pros, attributions] = await Promise.all([
    db.prepare('SELECT * FROM professionnels ORDER BY raison_sociale').all<Professionnel>(),
    db
      .prepare('SELECT * FROM attributions WHERE lead_id = ? ORDER BY created_at DESC, id DESC')
      .bind(lead.id)
      .all<Attribution>()
  ]);

  const tous = pros.results || [];
  const historique = attributions.results || [];

  return { selection: selectionner(tous, lead, historique), historique, tous };
}
