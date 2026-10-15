/**
 * Utilitaire de comptage universel pour l'ORM PostgreSQL Prisma 8 RC.
 *
 * Dans @prisma/orm-postgres, l'appel direct `.count()` sur une requête de modèle
 * n'est pas autorisé et lève l'exception :
 * "count() is only available inside include() refinement callbacks".
 *
 * Le calcul du total des lignes doit être effectué via la méthode `.aggregate()` :
 * `requete.aggregate((agg) => ({ total: agg.count() }))`
 */

/**
 * Calcule de manière fiable et typée le nombre total de lignes d'une requête ou table ORM.
 *
 * @param requete - Instance de requête ORM ou de modèle (ex: this.prisma.orm.public.Utilisateur ou requete.where(...))
 * @returns Le nombre total de lignes sous forme de `number` (>= 0)
 */
export async function compterLignes(requete: any): Promise<number> {
  if (!requete) {
    return 0;
  }

  // 1. Appel canonique supporté par @prisma/orm-postgres
  if (typeof requete.aggregate === 'function') {
    const resultat = await requete.aggregate((agg: any) => ({
      total: agg.count(),
    }));
    return Number(resultat?.total ?? 0);
  }

  // 2. Repli pour les mocks de tests unitaires définissant directement count()
  if (typeof requete.count === 'function') {
    const resultatDirect = await requete.count();
    return Number(resultatDirect ?? 0);
  }

  return 0;
}

