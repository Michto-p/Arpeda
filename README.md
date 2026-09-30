# Arpeda

Application web (mobile d'abord) de conception d'une salle d'eau avec vérification de l'implantation électrique selon la **NF C 15-100** (partie 7-701), visualisation 3D et réalité augmentée (WebXR).

> Aide à la conception, indicative : ne remplace ni la norme ni le contrôle d'un électricien qualifié.

## Utilisation

Aucune compilation : servir le dossier en statique et ouvrir `index.html`.

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

**Deux usages, deux appareils**

| Appareil | Rôle |
|---|---|
| **Ordinateur** (écran ≥ 900 px + souris) | **Éditeur** de plans : création de la pièce, pose des équipements, vérification NF C 15-100, exercices. |
| **Téléphone** | **Réalité augmentée** (Chrome Android + ARCore, HTTPS) : le projet arrive par QR / lien depuis l'éditeur (« 📱 Envoyer à la RA »). Un assistant de dessin simplifié reste disponible en secours. |

Forcer un mode : `?studio=1` (éditeur) ou `?mobile=1` (téléphone).

## Éditeur PC

Plan à l'échelle façon logiciel d'architecte : murs à l'épaisseur réelle (hachurés), portes et fenêtres avec battants, cotes extérieures, surface, grille, accrochage (extrémités, milieux, murs, alignements, angles de 45°). Les objets se collent aux murs.

- **Tracer** : `W` (murs, cloisons) — clics pour poser les points, ou tapez la longueur (`320` = 3,20 m, `3.2` aussi) puis Entrée ; Entrée ferme la pièce. `R` : rectangle, 2 clics ou `320x240` + Entrée.
- **Modifier** : glisser un sommet, un mur ou un objet ; poignée « + » pour ajouter un sommet ; poignée ⟳ pour pivoter ; double-clic sur un mur pour taper sa longueur ; les hauteurs, IP, classes, matériaux se règlent dans le panneau de droite.
- **Cotes utiles** : par défaut les cotes sont prises **entre parements intérieurs** (affichées dans la pièce, avec la surface utile) ; la barre d'état permet de passer aux cotes d'axe ou d'afficher les deux. « 300x240 » crée une pièce de 3,00 × 2,40 m utiles ; double-clic sur un côté pour taper sa longueur utile (le mur opposé suit sur une pièce rectangulaire).
- **Murs fins** : les nouveaux murs utilisent par défaut un mur léger de 16 cm (béton cellulaire 14 + enduits) au lieu de 32,8 cm ; la composition se change dans le panneau du mur. Les cotes utiles sont tracées à l'extérieur, avec des traits de rappel jusqu'aux parements.
- **Appareillage mural réaliste** : prises, interrupteurs, appliques et tableau sont des **plaques à l'échelle plaquées contre la face intérieure du mur** (8 × 8 cm, saillie 2 cm), orientées vers la pièce, en plan (symbole de prise / d'interrupteur), en 3D et en RA. Ils s'aimantent au mur le plus proche quand on les pose ou les déplace, et le suivent si le mur est modifié.
- **Exemples** : boutons « 📋 Exemple » (salle d'eau 2,80 × 2,20 m complète, conforme, score 100 %) et « 📋 Exemple à erreurs » (mêmes plans avec prise trop près de l'eau, lave-linge en volume 2, miroir de classe I, DDR et LEL absents) — utilisable tel quel comme exercice.
- **Équipement type (touche K)** : pose en un clic un point d'éclairage, un interrupteur (côté poignée de la porte) et une prise 16 A (près du lavabo) aux emplacements qui passent les règles NF C 15-100 ; ne duplique pas ce qui existe, s'annule d'un `Ctrl+Z`.
- **Confort** : annuler/refaire 100 niveaux (`Ctrl+Z` / `Ctrl+Y`), copier/coller, `Suppr`, flèches, molette + `Espace` pour la vue, `?` pour la liste des raccourcis.
- **Onglets** : Plan, 3D, Vérification (score et rapport), Exercice.

### Repère RA (point A + point à 1 m)

Sur le plan, le repère (A et la direction vers B, à 1 m) se pose avec `A` ou en glissant les marqueurs ; par défaut : premier sommet du premier mur. Sur le chantier :

1. Touchez le **point A** au sol (le coin ou repère indiqué).
2. Placez-vous à **1 m** : un anneau vert autour de A montre où viser. Dès que la visée reste stable environ 0,8 s sur l'anneau, le point B est **verrouillé automatiquement** à exactement 1,00 m.
3. Le modèle est ancré en **1:1**, orienté selon A→B. ⚙️ permet d'affiner rotation, hauteur et échelle.

## Exercices pour apprentis (formateur → apprentis)

1. **Formateur** (sur PC) : dessiner la pièce, poser sanitaires, meubles, portes, fenêtres et appareillage, régler les hauteurs, renseigner DDR 30 mA / LEL à l'étape Vérification, puis **🎓 Créer un exercice**.
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
  studio.js       éditeur PC : coque, outils, catalogue, onglets, envoi vers le téléphone
  studio-canvas.js éditeur PC : plan, accrochage, souris, clavier, rendu
  kit.js          équipement type d'une salle d'eau (un clic)
  example.js      exemples types (conforme / avec erreurs)
  history.js      annuler / refaire
  meubles.js      meubles et appareils
  exercise.js     exercices formateur / apprenti, correction, notation
  vendor/qrcode.js  qrcode-generator 1.4.4 (MIT)
  norms.js        écran de vérification    report.js  rapport
  storage.js      autosave, export/import
legacy/           ancienne version (elec-complet.html), conservée pour référence
```

Les seuils de la norme sont regroupés dans `RULES` (`js/rules.js`) et `CAT_EL` (`js/catalog.js`).
