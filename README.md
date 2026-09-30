# Arpeda

Application web (mobile d'abord) de conception d'une salle d'eau avec vérification de l'implantation électrique selon la **NF C 15-100** (partie 7-701), visualisation 3D et réalité augmentée (WebXR).

> Aide à la conception, indicative : ne remplace ni la norme ni le contrôle d'un électricien qualifié.

## Utilisation

Aucune compilation : servir le dossier en statique et ouvrir `index.html`.

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

La RA (`immersive-ar` + `hit-test`) exige HTTPS et Chrome Android avec ARCore.

Ancrage RA : **Tap 1** = coin haut-gauche du plan, **Tap 2** = coin haut-droit (le long du mur du haut). La distance entre les deux fixe l'échelle (1:1 si elle égale la largeur du plan) et l'orientation ; ⚙️ permet d'affiner.

## Exercices pour apprentis (formateur → apprentis)

1. **Formateur** : dessiner la pièce (bouton 📐 pour saisir les cotes), poser sanitaires, meubles, portes, fenêtres et appareillage, régler les hauteurs, renseigner DDR 30 mA / LEL à l'étape Vérification, puis **🎓 Créer un exercice**.
2. Ajuster la correction (bouton ⇄ par point de contrôle, commentaire facultatif), puis **🔗 Lien + QR** (ou **💾 Fichier**).
3. **Apprenti** : scanne le QR / ouvre le lien. La scène est en lecture seule, les **volumes et verdicts sont masqués** (sauf case « aide » cochée). Il observe le plan, la 3D et la RA, puis remplit le rapport : conforme / non conforme + motifs.
4. **Valider** affiche la correction, la note et les volumes ; **Télécharger mon rapport** produit un fichier à remettre au formateur.

Le lien contient toute la scène : aucun serveur. Il faut donc **héberger l'application en HTTPS** (par ex. GitHub Pages) pour que le QR ouvre la bonne page — la RA l'exige de toute façon. La correction est recalculée côté apprenti avec le même moteur de règles : un apprenti curieux pourrait l'extraire du lien, à réserver à un usage de formation.

## Parcours

1. Murs → 2. Portes et fenêtres → 3. Sanitaires → 4. Appareillage → 5. Vue 3D → 6. Vérification (score, constats, rapport).

## Fonctionnalités

- **Meubles et appareils** : meuble vasque, colonne, miroir, lave-linge, sèche-linge, radiateur, sèche-serviettes, chauffe-eau ; élévation, hauteur, rotation, IP et classe réglables.
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
  meubles.js      meubles et appareils
  exercise.js     exercices formateur / apprenti, correction, notation
  vendor/qrcode.js  qrcode-generator 1.4.4 (MIT)
  norms.js        écran de vérification    report.js  rapport
  storage.js      autosave, export/import
legacy/           ancienne version (elec-complet.html), conservée pour référence
```

Les seuils de la norme sont regroupés dans `RULES` (`js/rules.js`) et `CAT_EL` (`js/catalog.js`).
