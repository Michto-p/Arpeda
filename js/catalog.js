'use strict';

// ════════════════════════════════
//  CATALOGUE
// ════════════════════════════════
// genZone = true → génère vraiment des volumes 0/1/2 (NF C 15-100 §701)
// → uniquement baignoires, douches receveur, balnéo
// Les lavabos/vasques/WC/bidets sont des sanitaires mais sans zones générées
const CAT_SAN = {
  baignoire: {label:'Baignoire',     ico:'🛁', w:1.70,d:.75, h3:.55, water:true, genZone:true,  zR:{z1:.60,z2:1.20}},
  douche_it: {label:'Douche ital.',  ico:'🚿', w:.90, d:.90, h3:.01, water:true, genZone:true,  zR:{z1:.60,z2:1.20}},
  lavabo:    {label:'Lavabo',        ico:'🪣', w:.60, d:.50, h3:.85, water:true, genZone:false},
  vasque:    {label:'Vasque',        ico:'🪣', w:.50, d:.45, h3:.85, water:true, genZone:false},
  wc:        {label:'WC',            ico:'🚽', w:.38, d:.65, h3:.78, water:false,genZone:false},
  bidet:     {label:'Bidet',         ico:'🚽', w:.35, d:.55, h3:.40, water:false,genZone:false},
  balneo:    {label:'Balnéo',        ico:'🛁', w:1.80,d:.90, h3:.55, water:true, genZone:true,  zR:{z1:.60,z2:1.20}},
};

const CAT_EL = {
  dcl:     {label:'DCL plafond',    ico:'🔵', zones:[0,1,2,'hors'],minH:2.20,ip:'IP44',cl:'II',defH:2.45},
  spot:    {label:'Spot encastré',  ico:'💡', zones:[0,1,2,'hors'],minH:2.00,ip:'IP44',cl:'II',defH:2.45},
  applique:{label:'Applique',       ico:'🔦', zones:[2,'hors'],    minH:2.25,ip:'IP44',cl:'II',defH:2.30},
  hublot:  {label:'Hublot',         ico:'⭕', zones:[1,2,'hors'],  minH:2.00,ip:'IP44',cl:'II',defH:2.10},
  prise:   {label:'Prise 16A',      ico:'🔌', zones:['hors'],minDist:120,minH:.95,maxH:1.30,ip:'IP21',cl:'II',defH:1.05},
  inter:   {label:'Interrupteur',   ico:'🔆', zones:['hors'],minDist:60, minH:.90,maxH:1.30,ip:'IP21',cl:'II',defH:1.10},
  seche:   {label:'Sèche-serv.',    ico:'♨️', zones:[1,2],         minH:.30, ip:'IP44',cl:'II',defH:1.20},
  vmc:     {label:'VMC',            ico:'🌀', zones:[0,1,2,'hors'],minH:2.20,ip:'IP45',cl:'II',defH:2.45},
  tableau: {label:'Tableau élec.',  ico:'⚡', zones:['hors'],minDist:120,ip:'IP21',cl:'II',defH:1.50},
};

const STEP_TITLES = ['Tracer les murs','Portes & fenêtres','Sanitaires','Appareillage','Vue 3D','Vérification'];
