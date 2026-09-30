'use strict';

// ════════════════════════════════
//  STEP 3 : ÉLECTRIQUE
// ════════════════════════════════

// Test si le segment AB traverse un mur (extérieur du polygone pièce)
// Les zones ne peuvent pas traverser un mur de la pièce
function segIntersect(p1, p2, p3, p4){
  const x1=p1.x, y1=p1.y, x2=p2.x, y2=p2.y, x3=p3.x, y3=p3.y, x4=p4.x, y4=p4.y;
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if(Math.abs(denom) < 1e-9) return false;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
  const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denom;
  return t > 1e-6 && t < 1-1e-6 && u > 1e-6 && u < 1-1e-6;
}

// Test si la ligne (sanX,sanY) → (px,py) traverse un mur entre l'intérieur de la pièce
// Si oui, le point est "derrière le mur" → pas de zone
function lineCrossesWall(ax, ay, px, py){
  for(const w of SC.walls){
    if(!w.closed || w.pts.length<3) continue;
    const pts = [...w.pts, w.pts[0]];
    for(let i=0;i<pts.length-1;i++){
      // Une "ouverture" annule cette traversée (porte/fenêtre)
      // On regarde s'il y a une ouverture sur ce segment
      let openOnSeg = null;
      for(const op of SC.openings){
        if(op.wi !== SC.walls.indexOf(w)) continue;
        if(op.si !== i) continue;
        openOnSeg = op;
        break;
      }
      const a = pts[i], b = pts[i+1];
      if(!segIntersect({x:ax,y:ay}, {x:px,y:py}, a, b)) continue;
      // S'il y a une ouverture, vérifier si l'intersection est dans la portion ouverte
      if(openOnSeg){
        // Calculer paramètre t le long de a→b à l'intersection
        const dx = b.x-a.x, dy = b.y-a.y;
        const len2 = dx*dx+dy*dy;
        if(len2<1e-9) return true;
        // Intersection point
        const denom = (ax-px)*(a.y-b.y) - (ay-py)*(a.x-b.x);
        if(Math.abs(denom)<1e-9) return true;
        const u = -((ax-px)*(ay-a.y) - (ay-py)*(ax-a.x)) / denom;
        // u = position le long de [a,b]
        const sl = Math.sqrt(len2);
        const hw = openOnSeg.w/2/sl;
        const t1 = Math.max(0, openOnSeg.t-hw), t2 = Math.min(1, openOnSeg.t+hw);
        // Si traverse dans la zone ouverte → pas un mur bloquant
        if(u >= t1 && u <= t2){
          // Pour les portes (oh=2.10) la zone passe (à hauteur du sol)
          // Pour les fenêtres (allège 1.10m, hauteur 1.20m) la zone bloque
          // jusqu'à 1.10m de hauteur — simplification : porte = passe, fenêtre = bloque
          if(openOnSeg.type==='door' || openOnSeg.type==='wide'){
            continue; // porte = passe
          }
          // Fenêtre = considéré comme bloquant pour zones (au sol)
          return true;
        }
      }
      return true;
    }
  }
  return false;
}

// ════════════════════════════════════════════════════════════════
//  CALCUL DES VOLUMES NF C 15-100
//
//  V0 :
//    - Baignoire / bac à douche : intérieur du bac (z = 0 → c.h3)
//    - Douche italienne : sol → 10 cm sur l'emprise
//
//  V1 :
//    - Au-dessus du V0
//    - Hauteur : jusqu'à 2,25 m au-dessus de la bonde (= sol fini)
//    - Largeur : empreinte du V0
//    - Douche italienne : extension de 1,20 m autour du pommeau
//
//  V2 :
//    - +60 cm horizontal autour du V1
//    - Hauteur : sol → 2,25 m au-dessus bonde
// ════════════════════════════════════════════════════════════════

// Position du pommeau de douche (pour l'italienne)
// Par défaut : coin opposé à la bonde (s.x - 0.30, s.y - 0.30) en local
function pommeauPos(s){
  const c=CAT_SAN[s.type]; if(!c) return {x:s.x, y:s.y};
  // Si pommeau personnalisé stocké en local (px, py par rapport au centre, avant rotation)
  // Par défaut : coin "haut-gauche" du sanitaire
  const lx = (typeof s.pommeauLx === 'number') ? s.pommeauLx : -c.w*0.30;
  const ly = (typeof s.pommeauLy === 'number') ? s.pommeauLy : -c.d*0.30;
  // Appliquer rotation
  const cos=Math.cos(s.rot||0), sin=Math.sin(s.rot||0);
  return {
    x: s.x + lx*cos - ly*sin,
    y: s.y + lx*sin + ly*cos,
  };
}

// Conversion inverse : position monde → position locale (avant rotation)
function worldToLocalPommeau(s, px, py){
  const cos=Math.cos(-(s.rot||0)), sin=Math.sin(-(s.rot||0));
  const dx = px - s.x, dy = py - s.y;
  return {
    lx: dx*cos - dy*sin,
    ly: dx*sin + dy*cos,
  };
}

// Test si un point (px,py) est dans l'emprise du sanitaire (rotation incluse)
function inSanitaire(px, py, s){
  const c=CAT_SAN[s.type]; if(!c) return false;
  // Repasser dans le repère local du sanitaire
  const cos=Math.cos(-(s.rot||0)), sin=Math.sin(-(s.rot||0));
  const dx = px - s.x, dy = py - s.y;
  const lx = dx*cos - dy*sin;
  const ly = dx*sin + dy*cos;
  return Math.abs(lx) <= c.w/2 && Math.abs(ly) <= c.d/2;
}

// Distance min en cm d'un point à l'emprise du sanitaire (rotation incluse)
function distToSanEmprise(px, py, s){
  const c=CAT_SAN[s.type]; if(!c) return Infinity;
  const cos=Math.cos(-(s.rot||0)), sin=Math.sin(-(s.rot||0));
  const dx = px - s.x, dy = py - s.y;
  const lx = dx*cos - dy*sin;
  const ly = dx*sin + dy*cos;
  const cx = Math.max(-c.w/2, Math.min(c.w/2, lx));
  const cy = Math.max(-c.d/2, Math.min(c.d/2, ly));
  return Math.hypot(lx-cx, ly-cy) * 100;
}

// Le point (px, py) est-il dans le V0 d'un des sanitaires ?
function inV0(px, py){
  for(const s of SC.sanitaires){
    const c=CAT_SAN[s.type]; if(!c?.genZone) continue;
    if(inSanitaire(px, py, s)) return true;
  }
  return false;
}

// Distance horizontale min au pommeau de douche (pour V1 douche italienne) en cm
function distToPommeau(px, py){
  let m=Infinity;
  for(const s of SC.sanitaires){
    const c=CAT_SAN[s.type]; if(!c?.genZone) continue;
    // Seule la douche italienne a un V1 étendu autour du pommeau
    if(s.type !== 'douche_it') continue;
    if(lineCrossesWall(s.x, s.y, px, py)) continue;
    const p = pommeauPos(s);
    m = Math.min(m, Math.hypot(px-p.x, py-p.y)*100);
  }
  return m;
}

// Distance horizontale min à l'emprise V0 de TOUS les sanitaires generateurs (en cm)
// Sert à V2 = +60cm autour de V1
function distToV0(px, py){
  let m=Infinity;
  for(const s of SC.sanitaires){
    const c=CAT_SAN[s.type]; if(!c?.genZone) continue;
    if(lineCrossesWall(s.x, s.y, px, py)) continue;
    m = Math.min(m, distToSanEmprise(px, py, s));
  }
  return m;
}

// Détermine la zone d'un point 3D (x, y, h)
// h = hauteur en mètres
// Retourne 0, 1, 2 ou 'hors'
function getZone(x, y, h=1){
  // V0
  if(inV0(x, y)){
    // Baignoire/bac : V0 est entre 0 et c.h3
    // Douche italienne : V0 est entre 0 et 0.10 m
    for(const s of SC.sanitaires){
      const c=CAT_SAN[s.type]; if(!c?.genZone) continue;
      if(!inSanitaire(x, y, s)) continue;
      if(s.type === 'douche_it'){
        // V0 = sol → 10 cm
        if(h <= 0.10) return 0;
        // Au-dessus : V1 si h ≤ 2.25
        if(h <= 2.25) return 1;
      } else {
        // Baignoire/bac/balnéo : V0 = sol → h3 (rebord)
        if(h <= (c.h3 || 0.55)) return 0;
        // Au-dessus : V1
        if(h <= 2.25) return 1;
      }
      return 'hors';
    }
  }

  // V1 douche italienne : 1.20 m autour du pommeau (sol → 2.25 m)
  if(distToPommeau(x, y) <= 120 && h <= 2.25) return 1;

  // V1 baignoire/bac : empreinte du V0 + verticale jusqu'à 2.25m
  // (déjà géré par inV0 ci-dessus)

  // V2 : +60 cm autour du V1, sol → 2.25 m
  // V1 = soit l'empreinte V0 (baignoire/bac), soit 120cm autour pommeau (italienne)
  // Donc V2 = 60 cm autour de l'emprise V0 pour bac/baignoire,
  //    OU = entre 120cm et 180cm autour du pommeau pour italienne
  if(h <= 2.25){
    // V2 baignoire/bac : 0-60 cm autour du V0 (en 2D)
    const dV0 = distToV0(x, y);
    if(dV0 > 0 && dV0 <= 60){
      // Vérifier que ce sanitaire est bien baignoire/bac (pas italienne)
      // Note : si plusieurs sanitaires, on prend le plus proche
      const hasNonItalienneNearby = SC.sanitaires.some(s=>{
        const c=CAT_SAN[s.type]; if(!c?.genZone) return false;
        if(s.type === 'douche_it') return false;
        if(lineCrossesWall(s.x, s.y, x, y)) return false;
        return distToSanEmprise(x, y, s) <= 60;
      });
      if(hasNonItalienneNearby) return 2;
    }
    // V2 douche italienne : entre 120cm et 180cm autour du pommeau
    const dP = distToPommeau(x, y);
    if(dP > 120 && dP <= 180) return 2;
  }

  return 'hors';
}
