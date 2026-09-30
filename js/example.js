'use strict';

// ════════════════════════════════════════════════════════════════
//  EXEMPLES TYPES : une salle d'eau complète (2,80 × 2,20 m utiles)
//   - « ok »      : conforme NF C 15-100 (score 100 %), point de départ / référence
//   - « erreurs » : mêmes plans avec des non-conformités classiques, pour un exercice
//  Plan (y vers le bas) : baignoire au nord-ouest, meuble vasque + miroir au nord-est,
//  sèche-serviettes à l'est, lave-linge au sud-ouest, porte au sud, petite fenêtre à l'ouest.
// ════════════════════════════════════════════════════════════════
function exampleScene(variant){
  const bad = variant==='erreurs';
  const T = compThickness(COMP_LIB[DEFAULT_WALL]), e = T/2;
  const W=2.80, D=2.20;
  let id=0;
  const san = (type,x,y,rot=0)=>({id:++id,type,x,y,rot});
  const meu = (type,x,y,rot=0,extra={})=>{ const c=CAT_MEUBLE[type]; return {id:++id,type,x,y,rot,z:c.z,hgt:c.hgt,ip:c.ip||null,cl:c.cl||null,...extra}; };
  const el  = (type,x,y,h)=>{ const c=CAT_EL[type]; return {id:++id,type,x,y,h:h||c.defH,ip:c.ip,cl:c.cl}; };

  const walls=[{pts:[{x:-e,y:-e},{x:W+e,y:-e},{x:W+e,y:D+e},{x:-e,y:D+e}], closed:true, kind:'ext', comp:DEFAULT_WALL}];
  const openings=[
    {id:++id, type:'door',   wi:0, si:2, t:(W+e-2.2)/(W+T), w:0.80, menui:'porte_bois_iso', openDeg:30, hinge:'l', swing:'in'},
    {id:++id, type:'window', wi:0, si:3, t:(D+e-1.0)/(D+T), w:0.60, menui:'fenetre_pvc_dv', openDeg:30, sill:1.20, hgt:0.60},
  ];
  const sanitaires=[ san('baignoire',0.85,0.375), san('lavabo',2.30,0.25) ];
  const meubles=[
    meu('meuble_vasque',2.30,0.25),
    meu('miroir',2.30,0.025,0, bad?{cl:'I'}:{}),
    meu('seche_serviettes',W-0.05,1.15,Math.PI/2),
    meu('lave_linge', bad?2.05:0.30, bad?1.15:1.90),
  ];
  const electrique=[
    el('dcl',1.40,1.30),
    el('vmc',2.20,1.80),
    el('inter',1.55,D),
    el('prise',bad?W:0.90, bad?0.55:D),
    el('prise',W,1.60),
  ];
  return {
    name: bad ? "Exemple avec erreurs – salle d'eau" : "Exemple type – salle d'eau",
    walls, openings, sanitaires, meubles, electrique,
    roomH:2.50, idSeq:id,
    install:{diff30:!bad, conducteurs:{canalisations:true, huisseries:false, bacMetal:false}, lel:!bad, lelSection:2.5, lelProtegee:true},
    exercise:{title: bad?"Salle d'eau à contrôler":'', consigne: bad?"Contrôlez l'implantation électrique de cette salle d'eau selon la NF C 15-100 : volumes, distances, IP, classe, protections.":'', showZones:false, overrides:{}},
    arRef:{a:{x:0,y:D}, b:{x:1,y:D}, label:'angle intérieur bas gauche (sous la fenêtre)'},
  };
}

async function loadExample(variant){
  if((SC.walls.length||SC.sanitaires.length||SC.electrique.length) && !await askConfirm("Remplacer le projet actuel par l'exemple ? (vous pourrez annuler avec Ctrl+Z dans l'éditeur)")) return;
  if(STUDIO.active) histCommit();
  applyScene(exampleScene(variant));
  for(const e of SC.electrique) if(CAT_EL[e.type].mount==='wall') elMountToWall(e, 0.5);   // plaqué aux murs
  refreshElements();
  if(STUDIO.active){
    VIEWS.studio.init=false; initCanvas('studio'); studioAfterRestore(); histCommit();
    toast('Exemple chargé — Ctrl+Z pour revenir à votre projet');
  } else openEditor();
  saveNow();
}

// Téléphone : ouvre un exemple en visionneuse (lecture seule, rien n'est enregistré) puis « Démarrer la RA »
function startExampleViewer(variant){
  const sc=exampleScene(variant);
  startViewer({s:sc, t:sc.name});
  for(const e of SC.electrique) if(CAT_EL[e.type].mount==='wall') elMountToWall(e, 0.5);   // appareillage plaqué
  refreshElements();
}
