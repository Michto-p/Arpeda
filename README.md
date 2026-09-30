# Arpeda

Application web (mobile d'abord) de conception d'une salle d'eau avec vérification de l'implantation électrique selon la **NF C 15-100** (partie 7-701), visualisation 3D et réalité augmentée (WebXR).

> Aide à la conception, indicative : ne remplace ni la norme ni le contrôle d'un électricien qualifié.

## Utilisation

Aucune compilation : servir le dossier en statique et ouvrir `index.html`.

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

La RA (`immersive-ar` + `hit-test`) exige HTTPS et Chrome Android avec ARCore.

## Parcours

1. Murs → 2. Portes et fenêtres → 3. Sanitaires → 4. Appareillage → 5. Vue 3D → 6. Vérification (score, constats, rapport).

## Fonctionnalités

- **Volumes** 0 / 1 / 2 générés par baignoire, douche italienne (pommeau déplaçable) et balnéo.
- **Contrôle par appareil** : volume autorisé, distance à l'eau, hauteur, indice IP, classe.
- **Contrôle d'installation** : nombre minimal d'équipements, DDR 30 mA, liaison équipotentielle locale (présence et section), dimensionnement indicatif des circuits.
- **Sauvegarde automatique** (`localStorage`), reprise du projet, export/import JSON.
- **Rapport** HTML autonome (plan annoté, constats), imprimable en PDF depuis le navigateur.

## Structure

```
index.html        page + ordre de chargement des scripts
css/style.css     styles
js/               scripts classiques (pas de modules : les handlers onclick utilisent des globales)
  catalog.js      catalogues sanitaires / appareils
  materials.js    matériaux, parois, menuiseries
  rules.js        règles d'installation (pur, sans DOM) : RULES, checkInstallation, evaluateProject
  state.js        état du projet (SC)
  volumes.js      calcul des volumes 0/1/2 (getZone)
  render.js       rendu canvas 2D      view3d.js  vue 3D WebGL      ar.js  WebXR
  norms.js        écran de vérification    report.js  rapport
  storage.js      autosave, export/import
legacy/           ancienne version (elec-complet.html), conservée pour référence
```

Les seuils de la norme sont regroupés dans `RULES` (`js/rules.js`) et `CAT_EL` (`js/catalog.js`).
