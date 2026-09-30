'use strict';

// ════════════════════════════════════════════════════════════════
//  MATÉRIAUX (couches)
//  Chaque matériau a : couleur, densité, isolation, conductivité
//  Tout est paramétrique pour formation/devis
// ════════════════════════════════════════════════════════════════
const MAT_LIB = {
  // STRUCTURE
  brique:        {label:'Brique creuse',     col:[0.72,0.42,0.30], type:'struct',   r:0.85, U:0.75},
  brique_pleine: {label:'Brique pleine',     col:[0.65,0.32,0.22], type:'struct',   r:0.30, U:1.50},
  parpaing:      {label:'Parpaing 20',       col:[0.70,0.70,0.72], type:'struct',   r:0.20, U:2.20},
  beton:         {label:'Béton',             col:[0.75,0.75,0.78], type:'struct',   r:0.10, U:2.50},
  beton_cell:    {label:'Béton cellulaire',  col:[0.92,0.92,0.88], type:'struct',   r:1.20, U:0.45},
  pierre:        {label:'Pierre',            col:[0.78,0.72,0.62], type:'struct',   r:0.15, U:2.00},
  ossature_bois: {label:'Ossature bois',     col:[0.55,0.40,0.25], type:'struct',   r:0.80, U:0.40},
  // ISOLATION
  laine_verre:   {label:'Laine de verre',    col:[0.95,0.92,0.55], type:'iso',      r:2.50, U:0},
  laine_roche:   {label:'Laine de roche',    col:[0.65,0.70,0.55], type:'iso',      r:2.85, U:0},
  polystyrene:   {label:'Polystyrène',       col:[0.95,0.95,0.92], type:'iso',      r:3.00, U:0},
  pse_graph:     {label:'PSE graphité',      col:[0.30,0.30,0.32], type:'iso',      r:3.50, U:0},
  ouate_cell:    {label:'Ouate cellulose',   col:[0.85,0.78,0.62], type:'iso',      r:2.70, U:0},
  // PAREMENT
  ba13:          {label:'BA13 (placo)',      col:[0.95,0.95,0.96], type:'parement', r:0.05, U:0.25},
  ba18:          {label:'BA18',              col:[0.95,0.95,0.96], type:'parement', r:0.07, U:0.25},
  fermacell:     {label:'Fermacell',         col:[0.88,0.85,0.78], type:'parement', r:0.07, U:0.25},
  enduit_ext:    {label:'Enduit ext.',       col:[0.92,0.88,0.78], type:'finition', r:0.02, U:1.00},
  enduit_int:    {label:'Enduit int.',       col:[0.96,0.96,0.98], type:'finition', r:0.02, U:1.00},
  carrelage:     {label:'Carrelage',         col:[0.92,0.93,0.95], type:'finition', r:0.02, U:1.30},
  faience:       {label:'Faïence',           col:[0.18,0.34,0.50], type:'finition', r:0.02, U:1.30},
  parquet:       {label:'Parquet',           col:[0.62,0.42,0.25], type:'finition', r:0.10, U:0.18},
  bardage_bois:  {label:'Bardage bois',      col:[0.55,0.38,0.22], type:'finition', r:0.15, U:0.18},
  // VITRAGE & MENUISERIE
  alu:           {label:'Aluminium',         col:[0.80,0.82,0.85], type:'menuiserie',r:0,    U:5.90},
  alu_rt:        {label:'Alu rupt. pont',    col:[0.78,0.80,0.85], type:'menuiserie',r:0.20, U:1.80},
  pvc:           {label:'PVC',               col:[0.94,0.94,0.96], type:'menuiserie',r:0.30, U:1.40},
  bois:          {label:'Bois',              col:[0.55,0.38,0.22], type:'menuiserie',r:0.45, U:1.20},
  vitrage_simple:{label:'Vitrage simple',    col:[0.55,0.75,0.92], type:'vitrage',  r:0,    U:5.80},
  vitrage_double:{label:'Double vitrage',    col:[0.50,0.72,0.92], type:'vitrage',  r:0.40, U:1.40},
  vitrage_triple:{label:'Triple vitrage',    col:[0.48,0.70,0.92], type:'vitrage',  r:0.65, U:0.80},
};

// COMPOSITIONS PRÉRÉGLÉES
// Chaque composition = liste de couches [{mat, e (épaisseur en m)}]
// Ordre : extérieur → intérieur pour murs ext, gauche → droite pour cloisons
const COMP_LIB = {
  // MURS EXTÉRIEURS
  mur_brique_classique: {
    label:'Mur brique 20 + ITI',
    kind:'ext',
    desc:'Brique creuse 20 + laine verre 100 + BA13',
    layers:[
      {mat:'enduit_ext', e:0.015},
      {mat:'brique',     e:0.20},
      {mat:'laine_verre',e:0.10},
      {mat:'ba13',       e:0.013},
    ]
  },
  mur_parpaing_iti: {
    label:'Parpaing + ITI',
    kind:'ext',
    desc:'Parpaing 20 + laine roche 100 + BA13',
    layers:[
      {mat:'enduit_ext', e:0.015},
      {mat:'parpaing',   e:0.20},
      {mat:'laine_roche',e:0.10},
      {mat:'ba13',       e:0.013},
    ]
  },
  mur_brique_ite: {
    label:'Brique + ITE',
    kind:'ext',
    desc:'ITE PSE 140 + brique 20 + enduit',
    layers:[
      {mat:'enduit_ext', e:0.015},
      {mat:'pse_graph',  e:0.14},
      {mat:'brique',     e:0.20},
      {mat:'enduit_int', e:0.015},
    ]
  },
  mur_ossature_bois: {
    label:'Ossature bois',
    kind:'ext',
    desc:'Bardage + ouate 145 + OSB + BA13',
    layers:[
      {mat:'bardage_bois',e:0.022},
      {mat:'ossature_bois',e:0.145},
      {mat:'ouate_cell', e:0.145, fill:true},
      {mat:'ba13',       e:0.013},
    ]
  },
  mur_beton: {
    label:'Voile béton',
    kind:'ext',
    desc:'Béton 16 + PSE 100 + BA13',
    layers:[
      {mat:'enduit_ext', e:0.015},
      {mat:'beton',      e:0.16},
      {mat:'polystyrene',e:0.10},
      {mat:'ba13',       e:0.013},
    ]
  },
  mur_pierre: {
    label:'Pierre + doublage',
    kind:'ext',
    desc:'Pierre 40 + laine 80 + BA13',
    layers:[
      {mat:'pierre',     e:0.40},
      {mat:'laine_roche',e:0.08},
      {mat:'ba13',       e:0.013},
    ]
  },
  // CLOISONS
  cloison_72_48: {
    label:'Cloison 72/48 LV',
    kind:'int',
    desc:'BA13 + rail 48 + LV 45 + BA13',
    layers:[
      {mat:'ba13',       e:0.013},
      {mat:'laine_verre',e:0.045, fill:true},
      {mat:'ba13',       e:0.013},
    ]
  },
  cloison_98_70: {
    label:'Cloison 98/70 LV',
    kind:'int',
    desc:'BA13 + rail 70 + LV 70 + BA13',
    layers:[
      {mat:'ba13',       e:0.013},
      {mat:'laine_verre',e:0.07, fill:true},
      {mat:'ba13',       e:0.013},
    ]
  },
  cloison_double: {
    label:'Cloison phonique double',
    kind:'int',
    desc:'BA13 ×2 + LV 70 + BA13 ×2',
    layers:[
      {mat:'ba13',       e:0.013},
      {mat:'ba13',       e:0.013},
      {mat:'laine_roche',e:0.07, fill:true},
      {mat:'ba13',       e:0.013},
      {mat:'ba13',       e:0.013},
    ]
  },
  cloison_brique: {
    label:'Cloison brique 5',
    kind:'int',
    desc:'Enduit + brique 5 + enduit',
    layers:[
      {mat:'enduit_int', e:0.01},
      {mat:'brique',     e:0.05},
      {mat:'enduit_int', e:0.01},
    ]
  },
  cloison_carreau: {
    label:'Carreau plâtre 7',
    kind:'int',
    desc:'Plaque pleine 7cm',
    layers:[
      {mat:'ba18',       e:0.07},
    ]
  },
};

// COMPOSITIONS DE MENUISERIES
const MENUI_LIB = {
  porte_bois_iso: {
    label:'Porte bois isolante',
    desc:'Bois massif 40mm + isolation',
    type:'door',
    layers:[
      {mat:'bois',       e:0.04},
    ]
  },
  porte_alu: {
    label:'Porte aluminium',
    desc:'Alu rupture pont thermique',
    type:'door',
    layers:[
      {mat:'alu_rt',     e:0.07},
    ]
  },
  porte_pvc: {
    label:'Porte PVC',
    desc:'PVC multichambre',
    type:'door',
    layers:[
      {mat:'pvc',        e:0.07},
    ]
  },
  fenetre_pvc_dv: {
    label:'Fenêtre PVC DV',
    desc:'PVC + double vitrage 4/16/4',
    type:'window',
    cadre:'pvc',
    cadreE:0.07,
    vitrage:'vitrage_double',
    vitrageE:0.024,
  },
  fenetre_pvc_tv: {
    label:'Fenêtre PVC TV',
    desc:'PVC + triple vitrage',
    type:'window',
    cadre:'pvc',
    cadreE:0.08,
    vitrage:'vitrage_triple',
    vitrageE:0.044,
  },
  fenetre_alu_rt: {
    label:'Fenêtre Alu RT',
    desc:'Alu rupture pont + DV',
    type:'window',
    cadre:'alu_rt',
    cadreE:0.07,
    vitrage:'vitrage_double',
    vitrageE:0.024,
  },
  fenetre_bois: {
    label:'Fenêtre bois',
    desc:'Bois exotique + DV',
    type:'window',
    cadre:'bois',
    cadreE:0.07,
    vitrage:'vitrage_double',
    vitrageE:0.024,
  },
};

// Calcul épaisseur totale d'une composition
function compThickness(comp){
  if(!comp || !comp.layers) return 0.10;
  return comp.layers.reduce((s,l)=>s+l.e, 0);
}

// Calcul U (transmission thermique simplifiée)
function compU(comp){
  if(!comp || !comp.layers) return 1.0;
  const Rsi=0.13, Rse=0.04;
  let R = Rsi + Rse;
  for(const l of comp.layers){
    const m = MAT_LIB[l.mat];
    if(!m) continue;
    R += (l.e / 1.0) * (m.r > 0 ? m.r/0.04 : 0.5); // approximation
  }
  return Math.max(0.1, 1/R);
}
