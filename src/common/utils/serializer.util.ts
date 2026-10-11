/**
 * Assure la sérialisation correcte des BigInt en chaîne de caractères
 * pour JSON.stringify (Express, NestJS, etc.).
 */
if (!('toJSON' in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

/**
 * Convertit récursivement les types non directement sérialisables (BigInt)
 * en formats compatibles JSON standards (string).
 */
export function serialiserDonnees<T>(donnees: T): T {
  if (donnees === null || donnees === undefined) {
    return donnees;
  }

  if (typeof donnees === 'bigint') {
    return donnees.toString() as unknown as T;
  }

  if (Array.isArray(donnees)) {
    return donnees.map((element) => serialiserDonnees(element)) as unknown as T;
  }

  if (typeof donnees === 'object' && !(donnees instanceof Date)) {
    const resultat: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(donnees)) {
      resultat[cle] = serialiserDonnees(valeur);
    }
    return resultat as T;
  }

  return donnees;
}

