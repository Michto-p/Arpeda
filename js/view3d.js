'use strict';

// ════════════════════════════════
//  VUE 3D INTERACTIVE (hors RA)
//  Canvas WebGL avec orbit + zoom + pan
// ════════════════════════════════
let v3D = null;       // contexte WebGL
let v3DProg = null;
let v3DProgLine = null;
let v3DGeo = {};
let v3DBuilt = false;
// Caméra orbit
const CAM3D = {
  yaw: 0.7, pitch: -0.5,    // angles en radians
  dist: 5.5,                 // distance au centre
  targetX: 0, targetY: 0.8, targetZ: 0,  // point regardé (centre pièce)
};
let v3DLayers = {room:true, san:true, el:true, zones:true, cut:false};
let v3DRaf = null;

function init3D(){
  const wrap = document.getElementById('w3D');
  const cv = document.getElementById('cv3D');
  if(!cv || !wrap) return;
  const dpr = window.devicePixelRatio||1;
  cv.width = wrap.clientWidth*dpr;
  cv.height = wrap.clientHeight*dpr;
  cv.style.width = wrap.clientWidth+'px';
  cv.style.height = wrap.clientHeight+'px';

  if(!v3D){
    v3D = cv.getContext('webgl', {alpha:false, antialias:true});
    if(!v3D){ alert('WebGL non supporté'); return; }
    setup3DEvents(cv);
  }
  build3DGL();
  // Centrer caméra sur la pièce
  fit3DCamera();
  // Lancer la boucle de rendu
  if(!v3DRaf) v3DRaf = requestAnimationFrame(loop3D);
}

function fit3DCamera(){
  let mnx=0,mxx=3,mny=0,mxy=2.4;
  if(SC.walls.length) for(const w of SC.walls) for(const p of w.pts){
    mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x);
    mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
  }
  CAM3D.targetX = (mnx+mxx)/2;
  CAM3D.targetZ = (mny+mxy)/2;
  CAM3D.targetY = (SC.roomH||2.5)/2;
  // Distance plus grande car FOV serré (25° au lieu de 50°)
  CAM3D.dist = Math.max(mxx-mnx, mxy-mny) * 3.0 + 4;
  CAM3D.yaw = 0.6;
  CAM3D.pitch = -0.5;  // angle plus marqué pour effet axonométrique
}

function reset3D(){ fit3DCamera(); }

function setRoomH(h){
  SC.roomH = h;
  scheduleSave();
  document.getElementById('lblH').textContent = h.toFixed(2)+'m';
  // Refresh canvas du step si actif
}

function tog3D(k){
  v3DLayers[k] = !v3DLayers[k];
  const id={room:'t3DRoom',san:'t3DSan',el:'t3DEl',zones:'t3DZ',cut:'t3DCut'}[k];
  document.getElementById(id).classList.toggle('on', v3DLayers[k]);
}

function orbit3D(dy, dp){
  CAM3D.yaw += dy;
  CAM3D.pitch = Math.max(-Math.PI/2+0.1, Math.min(-0.05, CAM3D.pitch + dp));
}

function setup3DEvents(cv){
  let last = null;
  let touches = [];

  cv.addEventListener('mousedown', e=>{ last = {x:e.clientX, y:e.clientY, btn:e.button}; });
  document.addEventListener('mouseup', ()=>{ last = null; });
  document.addEventListener('mousemove', e=>{
    if(!last) return;
    const dx = e.clientX-last.x, dy = e.clientY-last.y;
    last = {x:e.clientX, y:e.clientY};
    if(e.shiftKey){
      // Pan
      CAM3D.targetX -= dx*0.005;
      CAM3D.targetZ -= dy*0.005;
    } else {
      CAM3D.yaw   -= dx*0.008;
      CAM3D.pitch  = Math.max(-Math.PI/2+0.1, Math.min(-0.05, CAM3D.pitch - dy*0.008));
    }
  });
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    CAM3D.dist = Math.max(0.5, Math.min(20, CAM3D.dist * (e.deltaY>0?1.12:0.89)));
  }, {passive:false});

  // Touch
  cv.addEventListener('touchstart', e=>{
    e.preventDefault();
    touches = Array.from(e.touches).map(t=>({x:t.clientX,y:t.clientY}));
  }, {passive:false});
  cv.addEventListener('touchmove', e=>{
    e.preventDefault();
    const ts = Array.from(e.touches);
    if(ts.length===1 && touches.length===1){
      const dx = ts[0].clientX - touches[0].x;
      const dy = ts[0].clientY - touches[0].y;
      CAM3D.yaw   -= dx*0.008;
      CAM3D.pitch  = Math.max(-Math.PI/2+0.1, Math.min(-0.05, CAM3D.pitch - dy*0.008));
    } else if(ts.length===2 && touches.length===2){
      // Pinch
      const d0 = Math.hypot(touches[1].x-touches[0].x, touches[1].y-touches[0].y);
      const d1 = Math.hypot(ts[1].clientX-ts[0].clientX, ts[1].clientY-ts[0].clientY);
      if(d0>0) CAM3D.dist = Math.max(0.5, Math.min(20, CAM3D.dist * d0/d1));
      // Pan center
      const c0 = {x:(touches[0].x+touches[1].x)/2, y:(touches[0].y+touches[1].y)/2};
      const c1 = {x:(ts[0].clientX+ts[1].clientX)/2, y:(ts[0].clientY+ts[1].clientY)/2};
      CAM3D.targetX -= (c1.x-c0.x)*0.005;
      CAM3D.targetZ -= (c1.y-c0.y)*0.005;
    }
    touches = ts.map(t=>({x:t.clientX,y:t.clientY}));
  }, {passive:false});
  cv.addEventListener('touchend', ()=>{ touches=[]; }, {passive:false});
}

function build3DGL(){
  if(v3DBuilt) return;
  v3DBuilt = true;
  const gl = v3D;

  v3DProg = compileProg(gl,
    `attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aNorm;
     uniform mat4 uMVP, uM;
     varying vec3 vC, vN, vP;
     void main(){
       gl_Position = uMVP * vec4(aPos,1.0);
       vN = normalize(vec3(uM * vec4(aNorm,0.0)));
       vC = aCol;
       vP = (uM * vec4(aPos,1.0)).xyz;
     }`,
    `precision mediump float;
     varying vec3 vC, vN, vP;
     uniform float uA;
     void main(){
       vec3 L1 = normalize(vec3(0.5, 1.5, 0.7));
       vec3 L2 = normalize(vec3(-0.6, 1.0, -0.4));
       float d1 = max(dot(vN,L1),0.0);
       float d2 = max(dot(vN,L2),0.0)*0.4;
       float light = 0.35 + (d1+d2)*0.55;
       gl_FragColor = vec4(vC * light, uA);
     }`);

  v3DProgLine = compileProg(gl,
    `attribute vec3 aPos; uniform mat4 uMVP;
     void main(){ gl_Position = uMVP * vec4(aPos,1.0); }`,
    `precision mediump float; uniform vec4 uC;
     void main(){ gl_FragColor = uC; }`);

  // Cube unitaire [-0.5, 0.5]
  const s = 0.5;
  const F = [
    {v:[[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]],     n:[0,0,1]},
    {v:[[s,-s,-s],[-s,-s,-s],[-s,s,-s],[s,s,-s]],  n:[0,0,-1]},
    {v:[[s,-s,s],[s,-s,-s],[s,s,-s],[s,s,s]],       n:[1,0,0]},
    {v:[[-s,-s,-s],[-s,-s,s],[-s,s,s],[-s,s,-s]],  n:[-1,0,0]},
    {v:[[-s,s,s],[s,s,s],[s,s,-s],[-s,s,-s]],       n:[0,1,0]},
    {v:[[-s,-s,-s],[s,-s,-s],[s,-s,s],[-s,-s,s]],   n:[0,-1,0]},
  ];
  const cv=[], ci=[];
  F.forEach(({v,n}, fi)=>{
    const b = fi*4;
    v.forEach(p => cv.push(...p, 1,1,1, ...n));  // couleur unifiée (sera overridée)
    ci.push(b,b+1,b+2, b,b+2,b+3);
  });
  v3DGeo.cube = makeMesh(gl, new Float32Array(cv), new Uint16Array(ci));
}

function compileProg(gl, vsrc, fsrc){
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsrc); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsrc); gl.compileShader(fs);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  return p;
}

function makeMesh(gl, verts, idx){
  const vbo = gl.createBuffer(), ibo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  return {vbo, ibo, count:idx.length};
}

// Matrices
const M3 = {
  id(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])},
  mul(a,b){
    const o=new Float32Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++)
      o[c*4+r] += a[k*4+r] * b[c*4+k];
    return o;
  },
  T(x,y,z){ const m=M3.id(); m[12]=x;m[13]=y;m[14]=z; return m; },
  S(x,y,z){ const m=M3.id(); m[0]=x;m[5]=y;m[10]=z; return m; },
  RY(a){ const c=Math.cos(a),s=Math.sin(a),m=M3.id(); m[0]=c;m[8]=s;m[2]=-s;m[10]=c; return m; },
  RX(a){ const c=Math.cos(a),s=Math.sin(a),m=M3.id(); m[5]=c;m[9]=-s;m[6]=s;m[10]=c; return m; },
  // Matrice projection perspective
  perspective(fovY, aspect, near, far){
    const f = 1.0/Math.tan(fovY/2);
    const nf = 1/(near-far);
    return new Float32Array([
      f/aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far+near)*nf, -1,
      0, 0, 2*far*near*nf, 0
    ]);
  },
  // LookAt simplifié à partir de orbit
  viewFromOrbit(target, yaw, pitch, dist){
    // Position caméra
    const cy=Math.cos(yaw), sy=Math.sin(yaw);
    const cp=Math.cos(pitch), sp=Math.sin(pitch);
    const cx = target[0] + dist*cp*sy;
    const cyP = target[1] + dist*sp*-1;  // pitch négatif = caméra au-dessus
    const cz = target[2] + dist*cp*cy;
    return M3.lookAt([cx,cyP,cz], target, [0,1,0]);
  },
  lookAt(eye, target, up){
    const z0=eye[0]-target[0], z1=eye[1]-target[1], z2=eye[2]-target[2];
    const zl=Math.hypot(z0,z1,z2);
    const fz0=z0/zl, fz1=z1/zl, fz2=z2/zl;
    let x0=up[1]*fz2-up[2]*fz1, x1=up[2]*fz0-up[0]*fz2, x2=up[0]*fz1-up[1]*fz0;
    const xl=Math.hypot(x0,x1,x2);
    x0/=xl;x1/=xl;x2/=xl;
    const y0=fz1*x2-fz2*x1, y1=fz2*x0-fz0*x2, y2=fz0*x1-fz1*x0;
    return new Float32Array([
      x0, y0, fz0, 0,
      x1, y1, fz1, 0,
      x2, y2, fz2, 0,
      -(x0*eye[0]+x1*eye[1]+x2*eye[2]),
      -(y0*eye[0]+y1*eye[1]+y2*eye[2]),
      -(fz0*eye[0]+fz1*eye[1]+fz2*eye[2]),
      1
    ]);
  }
};

function draw3DBox(proj, view, model, col, alpha){
  const gl = v3D;
  const mvp = M3.mul(M3.mul(proj, view), model);
  gl.useProgram(v3DProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, v3DGeo.cube.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, v3DGeo.cube.ibo);
  const stride = 36;
  const sa=(n,sz,o)=>{
    const l=gl.getAttribLocation(v3DProg, n);
    if(l<0) return;
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, sz, gl.FLOAT, false, stride, o*4);
  };
  sa('aPos',3,0); sa('aCol',3,3); sa('aNorm',3,6);
  // Hack : on remplace la couleur via uColor uniforme — non, on a aCol
  // → Solution simple : on update les couleurs en passant par un attrib divisé
  // Mais ici on garde 1 couleur via uniform supplémentaire
  gl.uniformMatrix4fv(gl.getUniformLocation(v3DProg,'uMVP'), false, mvp);
  gl.uniformMatrix4fv(gl.getUniformLocation(v3DProg,'uM'), false, model);
  gl.uniform1f(gl.getUniformLocation(v3DProg,'uA'), alpha||1);
  // Pour la couleur : on injecte via vertexAttrib3f (couleur globale)
  const cl = gl.getAttribLocation(v3DProg,'aCol');
  if(cl>=0){
    gl.disableVertexAttribArray(cl);
    gl.vertexAttrib3f(cl, col[0], col[1], col[2]);
  }
  gl.drawElements(gl.TRIANGLES, v3DGeo.cube.count, gl.UNSIGNED_SHORT, 0);
  // Restore
  if(cl>=0){
    gl.bindBuffer(gl.ARRAY_BUFFER, v3DGeo.cube.vbo);
    gl.enableVertexAttribArray(cl);
    gl.vertexAttribPointer(cl, 3, gl.FLOAT, false, stride, 12);
  }
}

function draw3DLines(proj, view, model, verts, col){
  const gl = v3D;
  const mvp = M3.mul(M3.mul(proj, view), model);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.useProgram(v3DProgLine);
  const l = gl.getAttribLocation(v3DProgLine,'aPos');
  gl.enableVertexAttribArray(l);
  gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(v3DProgLine,'uMVP'), false, mvp);
  gl.uniform4fv(gl.getUniformLocation(v3DProgLine,'uC'), col);
  gl.drawArrays(gl.LINES, 0, verts.length/3);
  gl.deleteBuffer(buf);
}

function loop3D(){
  v3DRaf = requestAnimationFrame(loop3D);
  // Skip rendu si pas sur l'écran 3D
  if(curStep !== 4){ return; }
  if(!v3D || !v3DGeo.cube) return;

  const gl = v3D;
  const cv = document.getElementById('cv3D');
  if(!cv) return;
  gl.viewport(0, 0, cv.width, cv.height);
  gl.clearColor(0.04, 0.07, 0.13, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Bounding box pièce → centrer
  let mnx=0,mxx=3,mny=0,mxy=2.4;
  if(SC.walls.length) for(const w of SC.walls) for(const p of w.pts){
    mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x);
    mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
  }
  const rcx=(mnx+mxx)/2, rcz=(mny+mxy)/2;
  const RH = SC.roomH || 2.5;
  const rW = mxx-mnx, rD = mxy-mny;

  // Caméra
  const aspect = cv.width / cv.height;
  // FOV plus serré = moins de distorsion perspective = effet axonométrique/BIM
  const proj = M3.perspective(25*Math.PI/180, aspect, 0.05, 100);
  const view = M3.viewFromOrbit(
    [CAM3D.targetX, CAM3D.targetY, CAM3D.targetZ],
    CAM3D.yaw, CAM3D.pitch, CAM3D.dist
  );

  // ── PLAFOND coupé ? ──
  const ceilingVisible = !v3DLayers.cut;

  // ── SOL ──
  if(v3DLayers.room){
    const floorM = M3.mul(M3.T(rcx, 0, rcz), M3.S(rW+0.05, 0.02, rD+0.05));
    draw3DBox(proj, view, floorM, [0.10, 0.18, 0.30], 1.0);
    // Lignes carrelage 40cm
    const tileLines = [];
    for(let x=mnx;x<=mxx+0.01;x+=0.40){
      tileLines.push(x, 0.012, mny, x, 0.012, mxy);
    }
    for(let z=mny;z<=mxy+0.01;z+=0.40){
      tileLines.push(mnx, 0.012, z, mxx, 0.012, z);
    }
    if(tileLines.length){
      draw3DLines(proj, view, M3.id(), tileLines, [0.4, 0.6, 0.9, 0.4]);
    }
  }

  // ── MURS avec ouvertures découpées ──
  if(v3DLayers.room && SC.walls.length){
    const wt = 0.06; // épaisseur mur
    // Pour chaque mur (segment), on calcule les ouvertures dessus et on dessine en morceaux
    for(let wi=0; wi<SC.walls.length; wi++){
      const w = SC.walls[wi];
      if(!w.closed || w.pts.length<2) continue;
      const pts = [...w.pts, w.pts[0]];
      for(let si=0; si<pts.length-1; si++){
        const a = pts[si], b = pts[si+1];
        // Ouvertures sur ce segment
        const opsHere = SC.openings
          .filter(op => op.wi===wi && op.si===si)
          .map(op => ({...op}));
        drawWallSegment(proj, view, a, b, RH, wt, opsHere);
      }
    }

    // Plafond (si non coupé)
    if(ceilingVisible){
      const ceilM = M3.mul(M3.T(rcx, RH, rcz), M3.S(rW, 0.02, rD));
      draw3DBox(proj, view, ceilM, [0.85, 0.88, 0.92], 0.85);
    }

    // Arêtes de la pièce
    const corners = [[mnx,mny],[mxx,mny],[mxx,mxy],[mnx,mxy]];
    const edgeLines = [];
    for(const [x,z] of corners){
      edgeLines.push(x,0.02,z, x,RH-0.01,z);
    }
    for(let i=0;i<4;i++){
      const a=corners[i], b=corners[(i+1)%4];
      edgeLines.push(a[0],RH-0.01,a[1], b[0],RH-0.01,b[1]);
    }
    draw3DLines(proj, view, M3.id(), edgeLines, [0.55, 0.75, 1.0, 0.7]);
  }

  // ── SANITAIRES ──
  if(v3DLayers.san){
    for(const s of SC.sanitaires){
      const c = CAT_SAN[s.type];
      const h = c.h3 || 0.5;
      const colors = {
        baignoire: [0.85, 0.92, 0.96],
        douche_it: [0.55, 0.75, 0.92],
        douche_cab:[0.55, 0.75, 0.92],
        lavabo:    [0.92, 0.96, 1.0],
        vasque:    [0.92, 0.96, 1.0],
        wc:        [0.95, 0.95, 0.95],
        bidet:     [0.93, 0.93, 0.95],
        balneo:    [0.85, 0.92, 0.96],
      };
      const col = colors[s.type] || [0.7, 0.8, 0.9];
      const rot = s.rot||0;
      const sanBase = M3.mul(M3.T(s.x, 0, s.y), M3.RY(rot));
      // Corps principal
      const m = M3.mul(M3.mul(sanBase, M3.T(0, h/2, 0)), M3.S(c.w, h, c.d));
      draw3DBox(proj, view, m, col, 1.0);
      if(c.water && h > 0.05){
        const wm = M3.mul(M3.mul(sanBase, M3.T(0, h+0.01, 0)), M3.S(c.w*0.86, 0.01, c.d*0.86));
        draw3DBox(proj, view, wm, [0.4, 0.7, 0.95], 0.6);
      }
      if(c.water && (s.type==='lavabo'||s.type==='vasque'||s.type==='baignoire'||s.type==='balneo')){
        const tapM = M3.mul(M3.mul(sanBase, M3.T(-c.w*0.35, h+0.10, -c.d*0.35)), M3.S(0.04, 0.20, 0.04));
        draw3DBox(proj, view, tapM, [0.7, 0.75, 0.82], 1.0);
      }
    }
  }

  // ── ZONES NF C 15-100 (avec clipping par les murs) ──
  if(v3DLayers.zones){
    const ZH = 2.25;
    const sanZ = SC.sanitaires.filter(s => CAT_SAN[s.type]?.genZone);
    if(sanZ.length){
      const roomPoly = SC.walls.length && SC.walls[0].closed ? SC.walls[0].pts : null;
      const STEP = 0.20; // pas + grossier en 3D pour les perfs
      // On dessine 1 boîte par cellule pour respecter le clipping
      for(let mx=mnx; mx<mxx; mx+=STEP){
        for(let mz=mny; mz<mxy; mz+=STEP){
          const cx = mx + STEP/2, cz = mz + STEP/2;
          if(roomPoly && !ptInPoly(cx, cz, roomPoly)) continue;
          let zone = null;
          if(inV0(cx, cz)) zone = 0;
          else {
            const d = distToV0(cx, cz);
            if(d <= 60)       zone = 1;
            else if(d <= 120) zone = 2;
          }
          if(zone === null) continue;
          if(zone === 0){
            // Z0 : dans l'emprise, hauteur du sanitaire
            // Trouver hauteur du sanitaire concerné
            let h0 = 0.5;
            for(const s of sanZ){
              const c = CAT_SAN[s.type];
              if(cx>=s.x-c.w/2 && cx<=s.x+c.w/2 && cz>=s.y-c.d/2 && cz<=s.y+c.d/2){
                h0 = c.h3 || 0.5;
                break;
              }
            }
            // Pas besoin de redessiner Z0 ici, le sanitaire couvre déjà
          } else {
            // Z1 ou Z2 : volume jusqu'à H=2.25m, clippé sol-plafond
            const m = M3.mul(M3.T(cx, ZH/2, cz), M3.S(STEP, ZH, STEP));
            const col = zone === 1 ? [0.95, 0.55, 0.05] : [0.20, 0.45, 0.95];
            draw3DBox(proj, view, m, col, 0.10);
          }
        }
      }
    }
  }

  // ── ÉLECTRIQUE ──
  if(v3DLayers.el){
    for(const e of SC.electrique){
      const c = CAT_EL[e.type];
      if(!c) continue;
      const {errs, warns} = checkEl(e);
      const col = errs.length ? [0.95, 0.27, 0.27] : (warns.length ? [0.96, 0.62, 0.04] : [0.13, 0.78, 0.36]);
      // Boîtier
      const m = M3.mul(M3.T(e.x, e.h, e.y), M3.S(0.10, 0.04, 0.10));
      draw3DBox(proj, view, m, col, 1.0);
      // Halo erreur
      if(errs.length){
        const halo = M3.mul(M3.T(e.x, e.h, e.y), M3.S(0.16, 0.005, 0.16));
        draw3DBox(proj, view, halo, [0.95, 0.27, 0.27], 0.6);
      }
      // Tige verticale (lien sol→appareil)
      const stem = M3.mul(M3.T(e.x, e.h/2, e.y), M3.S(0.012, e.h, 0.012));
      draw3DBox(proj, view, stem, col, 0.5);
    }
  }

  // (Les ouvertures sont déjà rendues dans le rendu des murs via drawWallSegment)

  // Update info
  document.getElementById('info3D').innerHTML =
    `<b>Vue 3D</b> — ${rW.toFixed(1)}×${rD.toFixed(1)}×${RH.toFixed(2)}m`;
  document.getElementById('info3D2').innerHTML =
    `<b>${SC.sanitaires.length}</b> san · <b>${SC.electrique.length}</b> él`;
}

// Rendu d'un segment de mur avec ses ouvertures découpées
// a, b = points du segment au sol (mètres)
// height = hauteur pièce
// thickness = épaisseur mur
// ops = liste d'ouvertures sur ce segment {type, t, w}
function drawWallSegment(proj, view, a, b, height, thickness, ops){
  const dx = b.x - a.x, dz = b.y - a.y;
  const segLen = Math.hypot(dx, dz);
  if(segLen < 0.01) return;
  const angle = Math.atan2(dx, dz); // rotation Y du mur
  const cx = (a.x + b.x) / 2;
  const cz = (a.y + b.y) / 2;

  // Couleur mur
  const wallCol = [0.50, 0.55, 0.62];

  // Trier ouvertures par t croissant
  const sortedOps = [...ops].sort((p,q) => p.t - q.t);

  // Construire la liste des "segments pleins" en t [0,1]
  // chaque ouverture occupe [t-w/2/segLen, t+w/2/segLen]
  let cuts = []; // intervalles [start, end] en t, vides
  for(const op of sortedOps){
    const hw = op.w / 2 / segLen;
    cuts.push({s: Math.max(0, op.t-hw), e: Math.min(1, op.t+hw), op});
  }

  // Position des "blocs pleins"
  // 1. Sous l'ouverture (allège fenêtre)
  // 2. Au-dessus de l'ouverture (linteau)
  // 3. Plein mur entre les ouvertures et aux extrémités

  // Pour chaque cut, on dessine :
  // - allège (sous) : si fenêtre — hauteur 0 → 1.10m
  // - linteau (haut) : porte → 2.10m → height ;  fenêtre → 2.30m → height
  // Mais d'abord on dessine les sections pleines entre les ouvertures

  // Calcul des sections pleines en t
  let pleins = [];
  let cursor = 0;
  for(const cut of cuts){
    if(cut.s > cursor){
      pleins.push({s: cursor, e: cut.s});
    }
    cursor = Math.max(cursor, cut.e);
  }
  if(cursor < 1) pleins.push({s: cursor, e: 1});

  // Helper pour dessiner un bloc rectangulaire orienté le long du segment
  function drawBlock(t1, t2, y, h, col, alpha){
    const len = (t2 - t1) * segLen;
    if(len <= 0.001) return;
    const tMid = (t1 + t2) / 2;
    const px = a.x + dx * tMid;
    const pz = a.y + dz * tMid;
    const m = M3.mul(M3.mul(M3.T(px, y + h/2, pz), M3.RY(angle)), M3.S(thickness, h, len));
    draw3DBox(proj, view, m, col, alpha);
  }

  // 1. Sections pleines (toute la hauteur)
  for(const p of pleins){
    drawBlock(p.s, p.e, 0, height, wallCol, 0.95);
  }

  // 2. Au-dessus de chaque ouverture (linteau jusqu'au plafond)
  for(const cut of cuts){
    const op = cut.op;
    const oh = (op.type === 'door' || op.type === 'wide') ? 2.10 : 2.30;
    if(oh < height){
      drawBlock(cut.s, cut.e, oh, height - oh, wallCol, 0.95);
    }
  }

  // 3. Sous chaque fenêtre (allège 0 → 1.10m)
  for(const cut of cuts){
    const op = cut.op;
    if(op.type === 'window'){
      drawBlock(cut.s, cut.e, 0, 1.10, wallCol, 0.95);
    }
  }

  // 4. Indicateurs visuels des ouvertures
  for(const cut of cuts){
    const op = cut.op;
    const len = (cut.e - cut.s) * segLen;
    if(len <= 0) continue;
    const tMid = (cut.s + cut.e) / 2;
    const px = a.x + dx * tMid;
    const pz = a.y + dz * tMid;
    if(op.type === 'window'){
      // Vitrage bleuté entre 1.10m et 2.30m
      const m = M3.mul(M3.mul(M3.T(px, 1.10 + 1.20/2, pz), M3.RY(angle)), M3.S(thickness*0.5, 1.20, len*0.95));
      draw3DBox(proj, view, m, [0.40, 0.70, 0.95], 0.55);
      // Cadre fenêtre
      const fr1 = M3.mul(M3.mul(M3.T(px, 1.10, pz), M3.RY(angle)), M3.S(thickness*1.1, 0.04, len));
      draw3DBox(proj, view, fr1, [0.85, 0.85, 0.90], 1.0);
      const fr2 = M3.mul(M3.mul(M3.T(px, 2.30, pz), M3.RY(angle)), M3.S(thickness*1.1, 0.04, len));
      draw3DBox(proj, view, fr2, [0.85, 0.85, 0.90], 1.0);
    } else {
      // Porte : encadrement + repère au sol
      const seuilM = M3.mul(M3.mul(M3.T(px, 0.01, pz), M3.RY(angle)), M3.S(thickness*1.2, 0.02, len));
      draw3DBox(proj, view, seuilM, [0.55, 0.40, 0.20], 1.0);
      const lintCol = [0.65, 0.55, 0.40];
      const lintM = M3.mul(M3.mul(M3.T(px, 2.10, pz), M3.RY(angle)), M3.S(thickness*1.1, 0.06, len));
      draw3DBox(proj, view, lintM, lintCol, 1.0);
    }
  }
}
