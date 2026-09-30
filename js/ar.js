'use strict';

// ════════════════════════════════
//  AR — WebXR
// ════════════════════════════════
let arSes, arRef, arHitSrc;
let arGL, arProg, arProgLine, arBuilt=false;
let arGeo={};
let arAnchorStep=0, arA=null, arB=null;
let arAnchored=false;
let arAnchorX=0, arAnchorY=0, arAnchorZ=0;
let arRotY=0, arSceneScale=1.0;
let arHitX=0, arHitY=0, arHitZ=0, arHitOK=false;
let arLayers={zones:true, elec:true, walls:true};
let arFrameN=0;
let arZoneCells=null;   // cellules de volumes (calculées une fois par session)

// ── Ancrage : point A au sol, point B à exactement 1 m ──
// Le plan définit le repère (SC.arRef : A et la direction A→B, 1 m). En RA on retrouve A au sol,
// puis un point à 1 m : la direction donne l'orientation, l'échelle est toujours 1:1.
const AR_B_DIST = 1.0;       // distance A→B (m)
const AR_CAPTURE = 0.25;     // tolérance de capture autour de l'anneau de 1 m
const AR_LOCK_MS = 800;      // temps de stabilité avant verrouillage automatique
let arSnap={ok:false,x:0,y:0,z:0,ux:1,uz:0,d:0};
let arStableSince=0, arLastDir=null;

// Repère du plan : A (point d'ancrage) et B (à 1 m). Par défaut : 1er sommet du 1er mur et sa direction.
function getArRef(){
  const r=SC.arRef;
  if(r && r.a && r.b && [r.a.x,r.a.y,r.b.x,r.b.y].every(Number.isFinite)){
    const d=Math.hypot(r.b.x-r.a.x, r.b.y-r.a.y);
    if(d>1e-6) return {a:{x:r.a.x,y:r.a.y}, b:{x:r.a.x+(r.b.x-r.a.x)/d, y:r.a.y+(r.b.y-r.a.y)/d}, label:r.label||''};
  }
  const w=SC.walls[0];
  if(w && w.pts.length>=2){
    const a=w.pts[0], b=w.pts[1], d=Math.hypot(b.x-a.x,b.y-a.y)||1;
    return {a:{x:a.x,y:a.y}, b:{x:a.x+(b.x-a.x)/d, y:a.y+(b.y-a.y)/d}, label:''};
  }
  return {a:{x:0,y:0}, b:{x:1,y:0}, label:''};
}

async function startAR(){
  if(!navigator.xr){ alert('WebXR non disponible.\nChrome Android + ARCore requis.'); return; }
  const ok=await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false);
  if(!ok){ alert('AR non supportée.'); return; }

  document.getElementById('home').style.display='none';
  document.getElementById('app').style.display='none';
  document.getElementById('scrAR').style.display='block';
  arSetSt('Ouverture caméra…','scan');

  // Dimensionner le canvas AVANT toute init WebGL
  const cv=document.getElementById('arCanvas');
  cv.width  = window.innerWidth;
  cv.height = window.innerHeight;
  cv.style.width  = window.innerWidth  + 'px';
  cv.style.height = window.innerHeight + 'px';

  try{
    arSes=await navigator.xr.requestSession('immersive-ar',{
      requiredFeatures:['hit-test'],
      optionalFeatures:['dom-overlay','local-floor'],
      domOverlay:{root:document.getElementById('scrAR')}
    });
  }catch(e){
    document.getElementById('scrAR').style.display='none';
    arBackScreen();
    alert('Erreur AR: '+e.message); return;
  }

  arDynVbo=null; arZoneCells=null;
  arSetSt(arMsgA(),'scan');
  arAnchorStep=0; arA=null; arB=null; arAnchored=false; arSceneScale=1; arRotY=0;
  arUpdBtn();

  arSes.addEventListener('end',()=>{
    document.getElementById('scrAR').style.display='none';
    arBackScreen();
    arSes=null; arBuilt=false;
  });
  arSes.addEventListener('select', arOnTap);

  // ⚠️ CRITIQUE pour la caméra :
  // alpha:true permet à la caméra de transparaître à travers les pixels non dessinés
  // Sans clear du color buffer, on garde l'image caméra en fond
  arGL = cv.getContext('webgl', {
    xrCompatible: true,
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });
  if(!arGL){
    alert('WebGL non disponible');
    document.getElementById('scrAR').style.display='none';
    arBackScreen();
    return;
  }
  await arGL.makeXRCompatible();

  const baseLayer = new XRWebGLLayer(arSes, arGL, {
    framebufferScaleFactor: 1.0
  });
  arSes.updateRenderState({
    baseLayer,
    depthNear: 0.05,
    depthFar:  50.0
  });

  try{ arRef=await arSes.requestReferenceSpace('local-floor'); }
  catch{ arRef=await arSes.requestReferenceSpace('local'); }

  await arStartHit();
  arBuildGL();
  arSes.requestAnimationFrame(arLoop);
}

async function arStartHit(){
  const vs=await arSes.requestReferenceSpace('viewer');
  arHitSrc=await arSes.requestHitTestSource({space:vs});
}
function arStopHit(){ if(arHitSrc){ try{arHitSrc.cancel();}catch{} arHitSrc=null; } }

// Écran affiché à la sortie de la RA : accueil (visionneuse) ou application (assistant / exercice)
function arBackScreen(){
  if(VIEWER.active) document.getElementById('home').style.display='flex';
  else document.getElementById('app').style.display='flex';
}

function arMsgA(){
  const r=getArRef();
  return 'Point A'+(r.label?' ('+r.label+')':'')+' : visez le sol et touchez';
}

function arOnTap(){
  if(arAnchorStep===0){
    if(!arHitOK){ arSetSt('Sol non détecté : bougez lentement le téléphone','scan'); return; }
    arA={x:arHitX,y:arHitY,z:arHitZ};
    arAnchorStep=1; arStableSince=0; arLastDir=null; arSnap.ok=false;
    arSetSt('Point B : placez-vous à 1 m de A (anneau vert)','ok');
    arUpdBtn();
  } else if(arAnchorStep===1){
    if(arSnap.ok) arLock();
    else arSetSt(`Point B à 1 m de A (actuellement ${arSnap.d.toFixed(2)} m)`,'scan');
  }
}

// Point B capturé à 1,00 m de A : calcule l'orientation, échelle 1:1
function arLock(){
  if(arAnchored || !arA) return;
  const ref=getArRef();
  const thp=Math.atan2(ref.b.y-ref.a.y, ref.b.x-ref.a.x);   // direction A→B dans le plan
  const thw=Math.atan2(arSnap.uz, arSnap.ux);                // direction A→B dans le monde (x, z)
  arB={x:arSnap.x,y:arSnap.y,z:arSnap.z};
  arRotY=thp-thw;
  arSceneScale=1;
  arAnchorX=arA.x; arAnchorY=arA.y; arAnchorZ=arA.z;
  arAnchored=true; arAnchorStep=2;
  arStopHit();
  arSetSt('Modèle ancré 1:1 ✓ — ⚙️ pour affiner','go');
  arUpdBtn();
  if(navigator.vibrate) try{ navigator.vibrate(60); }catch{}
  const rsc=document.getElementById('arRSc'), rry=document.getElementById('arRRy');
  const vsc=document.getElementById('arVSc'), vry=document.getElementById('arVRy');
  if(rsc){ rsc.value=1; vsc.textContent='×1.00'; }
  if(rry){ const deg=Math.round(arRotY*180/Math.PI); rry.value=Math.max(-180,Math.min(180,deg)); vry.textContent=deg+'°'; }
}

// Chaque image : capture sur l'anneau de 1 m, verrouillage si la visée reste stable
function arUpdateSnap(){
  arSnap.ok=false;
  if(!arHitOK || !arA){ arStableSince=0; arLastDir=null; return; }
  const dx=arHitX-arA.x, dz=arHitZ-arA.z, d=Math.hypot(dx,dz);
  arSnap.d=d;
  if(d>0.3 && Math.abs(d-AR_B_DIST)<=AR_CAPTURE){
    const ux=dx/d, uz=dz/d;
    arSnap={ok:true,d,x:arA.x+ux*AR_B_DIST,y:arHitY,z:arA.z+uz*AR_B_DIST,ux,uz};
    const dir=Math.atan2(uz,ux), now=performance.now();
    let dd=dir-(arLastDir===null?dir:arLastDir); while(dd>Math.PI) dd-=2*Math.PI; while(dd<-Math.PI) dd+=2*Math.PI;
    if(arLastDir===null || Math.abs(dd)>0.05){ arStableSince=now; }   // >3° de bougé : on repart
    arLastDir=dir;
    if(now-arStableSince>=AR_LOCK_MS) arLock();
  } else { arStableSince=0; arLastDir=null; }
}

function arPlaceObj(){ arOnTap(); }
function arReanchor(){
  arAnchored=false; arAnchorStep=0; arA=null; arB=null;
  arSceneScale=1; arRotY=0;
  arStartHit();
  arSetSt(arMsgA(),'scan');
  arUpdBtn();
}
let arOffY=0, arSetVisible=false;
function arSetSc(v){ arSceneScale=v; document.getElementById('arVSc').textContent='×'+v.toFixed(2); }
function arSetRy(deg){ arRotY=deg*Math.PI/180; document.getElementById('arVRy').textContent=deg+'°'; }
function arSetOff(v){ arOffY=v; document.getElementById('arVY').textContent=v.toFixed(2)+'m'; }
function toggleArSet(){
  arSetVisible=!arSetVisible;
  document.getElementById('arSet').style.display=arSetVisible?'block':'none';
  document.getElementById('bSet').classList.toggle('on',arSetVisible);
}
function arTog(k){
  arLayers[k]=!arLayers[k];
  document.getElementById('b'+k[0].toUpperCase()).classList.toggle('on',arLayers[k]);
}
function closeAR(){ if(arSes) arSes.end(); }
function arUpdBtn(){
  const b=document.getElementById('arPlace');
  if(arAnchorStep===0){ b.textContent='📍 Point A'; b.style.background=''; }
  else if(arAnchorStep===1){ b.textContent='📐 Point B'; b.style.background='rgba(167,139,250,.5)'; }
  else { b.textContent='✓ Ancré'; b.style.background='rgba(34,197,94,.5)'; }
}
function arSetSt(t,type){
  document.getElementById('arSt').textContent=t;
  document.getElementById('arDot').className='sdt '+(type||'scan');
}

// ── GL setup ──
function arBuildGL(){
  if(arBuilt) return; arBuilt=true;
  const gl=arGL;
  arProg=mkP(gl,
    `attribute vec3 aPos;attribute vec3 aCol;attribute vec3 aNorm;
     uniform mat4 uMVP,uM;varying vec3 vC,vN;
     void main(){gl_Position=uMVP*vec4(aPos,1.);vN=normalize(vec3(uM*vec4(aNorm,0.)));vC=aCol;}`,
    `precision mediump float;varying vec3 vC,vN;uniform float uA;uniform vec3 uTint;
     void main(){
       vec3 L1=normalize(vec3(.5,1.5,.7));
       vec3 L2=normalize(vec3(-.6,1.0,-.4));
       float d1=max(dot(vN,L1),0.);
       float d2=max(dot(vN,L2),0.)*0.4;
       float light=0.40+(d1+d2)*0.55;
       vec3 rgb=vC*uTint*light*uA;
       gl_FragColor=vec4(rgb,uA);
     }`);
  arProgLine=mkP(gl,
    `attribute vec3 aPos;uniform mat4 uMVP;void main(){gl_Position=uMVP*vec4(aPos,1.);}`,
    `precision mediump float;uniform vec4 uC;
     void main(){gl_FragColor=vec4(uC.rgb*uC.a, uC.a);}`);
  // Cube unitaire — couleurs blanches, le tint donne le matériau
  const s=0.5;
  const F=[
    {v:[[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]],n:[0,0,1],c:[1,1,1]},
    {v:[[s,-s,-s],[-s,-s,-s],[-s,s,-s],[s,s,-s]],n:[0,0,-1],c:[1,1,1]},
    {v:[[s,-s,s],[s,-s,-s],[s,s,-s],[s,s,s]],n:[1,0,0],c:[1,1,1]},
    {v:[[-s,-s,-s],[-s,-s,s],[-s,s,s],[-s,s,-s]],n:[-1,0,0],c:[1,1,1]},
    {v:[[-s,s,s],[s,s,s],[s,s,-s],[-s,s,-s]],n:[0,1,0],c:[1,1,1]},
    {v:[[-s,-s,-s],[s,-s,-s],[s,-s,s],[-s,-s,s]],n:[0,-1,0],c:[1,1,1]},
  ];
  const cv=[],ci=[];
  F.forEach(({v,n,c},fi)=>{const b=fi*4;v.forEach(p=>cv.push(...p,...c,...n));ci.push(b,b+1,b+2,b,b+2,b+3);});
  arGeo.cube=mkM(gl,new Float32Array(cv),new Uint16Array(ci));
  // Réticule cercle
  const rv=[];const R=0.07;
  rv.push(-R,0,0,R,0,0,0,0,-R,0,0,R);
  for(let i=0;i<32;i++){const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;rv.push(Math.cos(a)*R,0,Math.sin(a)*R,Math.cos(b)*R,0,Math.sin(b)*R);}
  arGeo.ret=mkL(gl,new Float32Array(rv));
}
function mkP(gl,vs,fs){const v=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(v,vs);gl.compileShader(v);
  const f=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(f,fs);gl.compileShader(f);
  const p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);return p;}
function mkM(gl,v,i){const vbo=gl.createBuffer(),ibo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,i,gl.STATIC_DRAW);
  return{vbo,ibo,count:i.length};}
function mkL(gl,v){const vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STATIC_DRAW);return{vbo,count:v.length/3};}
// Lignes dynamiques : un seul buffer GL réutilisé (dessiné aussitôt après l'appel).
// Avant : un buffer créé à chaque ligne et à chaque image, jamais libéré.
let arDynVbo=null;
function mkLD(d){
  const gl=arGL;
  if(!arDynVbo) arDynVbo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,arDynVbo);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(d),gl.DYNAMIC_DRAW);
  return {vbo:arDynVbo,count:d.length/3};
}

const AM={
  id(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])},
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;},
  T(x,y,z){const m=AM.id();m[12]=x;m[13]=y;m[14]=z;return m;},
  S(x,y,z){const m=AM.id();m[0]=x;m[5]=y;m[10]=z;return m;},
  RY(a){const c=Math.cos(a),s=Math.sin(a),m=AM.id();m[0]=c;m[8]=s;m[2]=-s;m[10]=c;return m;},
  mvp(p,v,m){return AM.mul(AM.mul(p,v),m);}
};

function arDM(p,v,m,g,a,tint){
  const gl=arGL,mvp=AM.mvp(p,v,m);
  gl.useProgram(arProg);
  gl.bindBuffer(gl.ARRAY_BUFFER,g.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ibo);
  const sa=(n,sz,o)=>{const l=gl.getAttribLocation(arProg,n);if(l<0)return;gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,sz,gl.FLOAT,false,36,o*4);};
  sa('aPos',3,0);sa('aCol',3,3);sa('aNorm',3,6);
  gl.uniformMatrix4fv(gl.getUniformLocation(arProg,'uMVP'),false,mvp);
  gl.uniformMatrix4fv(gl.getUniformLocation(arProg,'uM'),false,m);
  gl.uniform1f(gl.getUniformLocation(arProg,'uA'),a||1);
  const t = tint || [1,1,1];
  gl.uniform3f(gl.getUniformLocation(arProg,'uTint'),t[0],t[1],t[2]);
  gl.drawElements(gl.TRIANGLES,g.count,gl.UNSIGNED_SHORT,0);
}
function arDL(p,v,m,g,r,gr,b,a){
  const gl=arGL,mvp=AM.mvp(p,v,m);
  gl.useProgram(arProgLine);
  gl.bindBuffer(gl.ARRAY_BUFFER,g.vbo);
  const l=gl.getAttribLocation(arProgLine,'aPos');
  gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,3,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(gl.getUniformLocation(arProgLine,'uMVP'),false,mvp);
  gl.uniform4fv(gl.getUniformLocation(arProgLine,'uC'),[r,gr,b,a]);
  gl.drawArrays(gl.LINES,0,g.count);
}

function arLoop(t,frame){
  arSes.requestAnimationFrame(arLoop);
  if(!arGeo.cube) return;
  arFrameN++;
  const gl=arGL;
  const layer=arSes.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);
  // Ne PAS effacer le color buffer (= caméra visible en fond via alpha:true)
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  // Pour premultipliedAlpha:true → blend correct
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const pose=frame.getViewerPose(arRef); if(!pose) return;

  if(arHitSrc){
    const hits=frame.getHitTestResults(arHitSrc);
    arHitOK=hits.length>0;
    if(arHitOK){
      const hp=hits[0].getPose(arRef);
      if(hp){ arHitX=hp.transform.matrix[12]; arHitY=hp.transform.matrix[13]; arHitZ=hp.transform.matrix[14]; }
    }
  }

  if(arAnchorStep===1) arUpdateSnap();

  for(const view of pose.views){
    const vp=layer.getViewport(view);
    gl.viewport(vp.x,vp.y,vp.width,vp.height);
    const proj=view.projectionMatrix;
    const viewM=view.transform.inverse.matrix;

    // Phase 0
    if(arAnchorStep===0 && arHitOK){
      arDL(proj,viewM,AM.T(arHitX,arHitY,arHitZ),arGeo.ret,1,1,0.3,1);
    }
    // Phase 1 : anneau de 1 m autour de A, point B capturé sur l'anneau
    if(arAnchorStep===1 && arA){
      arDL(proj,viewM,AM.T(arA.x,arA.y+0.01,arA.z),arGeo.ret,0.2,1,0.4,1);
      const ring=[]; const N=72;
      for(let i=0;i<N;i++){
        const a0=i/N*Math.PI*2, a1=(i+1)/N*Math.PI*2;
        ring.push(Math.cos(a0)*AR_B_DIST,0.012,Math.sin(a0)*AR_B_DIST, Math.cos(a1)*AR_B_DIST,0.012,Math.sin(a1)*AR_B_DIST);
      }
      const near=arSnap.ok;
      arDL(proj,viewM,AM.T(arA.x,arA.y,arA.z),mkLD(ring), near?0.2:1, near?1:1, near?0.4:1, near?0.95:0.55);
      if(arHitOK){
        const tx=near?arSnap.x:arHitX, tz=near?arSnap.z:arHitZ;
        arDL(proj,viewM,AM.T(tx,arHitY,tz),arGeo.ret,near?0.2:0.7,near?1:0.3,near?0.4:1,1);
        const lg=mkLD([0,0.02,0,tx-arA.x,0.02,tz-arA.z]);
        arDL(proj,viewM,AM.T(arA.x,arA.y,arA.z),lg,1,0.85,0.1,0.9);
      }
      if(arFrameN%10===0 && arHitOK){
        if(near){
          const rest=Math.max(0,AR_LOCK_MS-(performance.now()-arStableSince));
          arSetSt(rest>0?`1,00 m ✓ — ne bougez plus (${(rest/1000).toFixed(1)} s)`:'Verrouillage…','go');
        } else arSetSt(`B : ${arSnap.d.toFixed(2)} m — visez l'anneau vert à 1 m`,'ok');
      }
    }

    if(!arAnchored) continue;

    // ══ SCÈNE ANCRÉE — RENDU PLEIN AVEC MATÉRIAUX ══
    let mnx=0,mxx=3,mny=0,mxy=2.4;
    if(SC.walls.length) for(const w of SC.walls) for(const p of w.pts){
      mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x);
      mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
    }
    const refA=getArRef().a, ox=refA.x, oz=refA.y;   // origine = point A du plan, ancré sur le point A au sol
    const sc=arSceneScale;
    const RH=SC.roomH||2.5, rW=(mxx-mnx)*sc, rD=(mxy-mny)*sc;
    const baseM=AM.mul(AM.T(arAnchorX,arAnchorY+arOffY,arAnchorZ),AM.RY(arRotY));
    const wM=(lx,ly,lz)=>AM.mul(baseM,AM.T((lx-ox)*sc,ly,(lz-oz)*sc));
    const wMS=(lx,ly,lz,sx,sy,sz)=>AM.mul(wM(lx,ly,lz),AM.S(sx*sc,sy,sz*sc));

    // Helper : box avec couleur de matériau
    const arBox=(cx,cy,cz, w,h,d, alpha, tint)=>{
      arDM(proj,viewM,wMS(cx,cy,cz,w,h,d),arGeo.cube,alpha||1,tint||[0.85,0.85,0.88]);
    };
    // Boîte locale à un objet tourné : (lx,lz) = décalage dans le repère de l'objet
    const arBoxS=(o, lx,cy,lz, w,h,d, alpha, tint)=>{
      const cs=Math.cos(o.rot||0), sn=Math.sin(o.rot||0);
      const wx=o.x+lx*cs-lz*sn, wz=o.y+lx*sn+lz*cs;
      const m=AM.mul(wM(wx,cy,wz), AM.mul(AM.RY(-(o.rot||0)), AM.S(w*sc,h,d*sc)));
      arDM(proj,viewM,m,arGeo.cube,alpha||1,tint||[0.85,0.85,0.88]);
    };
    // Helper : ligne au sol
    const arLine=(verts, r,g,b,a)=>{
      arDL(proj,viewM,baseM,mkLD(verts),r,g,b,a);
    };

    // Couleurs matériaux
    const COL_FLOOR  = [0.62, 0.65, 0.70];   // sol carrelage gris clair
    const COL_WALL   = [0.85, 0.86, 0.88];   // mur blanc cassé
    const COL_GLASS  = [0.45, 0.65, 0.85];   // vitre bleutée
    const COL_CERAM  = [0.96, 0.97, 0.98];   // céramique blanche
    const COL_WATER  = [0.30, 0.65, 0.90];   // eau bleue
    const COL_CHROME = [0.78, 0.80, 0.85];   // robinetterie chromée
    const COL_WC     = [0.94, 0.94, 0.96];   // WC blanc
    const COL_Z1     = [1.00, 0.55, 0.10];   // Z1 orange
    const COL_Z2     = [0.20, 0.50, 1.00];   // Z2 bleu
    const COL_Z0     = [1.00, 0.30, 0.30];   // Z0 rouge
    const COL_OK     = [0.20, 0.85, 0.40];   // élec ok
    const COL_ERR    = [1.00, 0.30, 0.30];   // élec erreur

    // ── SOL CARRELÉ ──
    if(arLayers.walls){
      // Dalle principale (gris clair)
      arBox((mnx+mxx)/2,0.005,(mny+mxy)/2, mxx-mnx, 0.01, mxy-mny, 0.65, COL_FLOOR);
      // Lignes de joints carrelage 40cm
      const ts=0.40;
      for(let x=mnx; x<=mxx+0.01; x+=ts){
        const lx=(x-ox)*sc;
        arLine([lx,0.012,0, lx,0.012,rD], 0.20, 0.25, 0.30, 0.7);
      }
      for(let z=mny; z<=mxy+0.01; z+=ts){
        const lz=(z-oz)*sc;
        arLine([0,0.012,lz, rW,0.012,lz], 0.20, 0.25, 0.30, 0.7);
      }

      // ── MURS PLEINS avec ouvertures découpées ──
      if(SC.walls.length){
        const wallH = RH;
        const wt = 0.04*sc; // épaisseur visuelle

        for(let wi=0; wi<SC.walls.length; wi++){
          const w = SC.walls[wi];
          if(!w.closed || w.pts.length<2) continue;
          const pts = [...w.pts, w.pts[0]];
          for(let si=0; si<pts.length-1; si++){
            const a = pts[si], b = pts[si+1];
            const segLen = Math.hypot(b.x-a.x, b.y-a.y);
            if(segLen<0.01) continue;
            const angle = Math.atan2(b.x-a.x, b.y-a.y);

            // Ouvertures sur ce segment
            const ops = SC.openings.filter(op => op.wi===wi && op.si===si);

            // Créer la liste des "blocs pleins" en t [0,1]
            let cuts = [];
            for(const op of ops){
              const hw = op.w/2/segLen;
              cuts.push({s:Math.max(0,op.t-hw), e:Math.min(1,op.t+hw), op});
            }
            cuts.sort((p,q)=>p.s-q.s);

            let pleins = [];
            let cursor = 0;
            for(const cut of cuts){
              if(cut.s > cursor) pleins.push({s:cursor, e:cut.s});
              cursor = Math.max(cursor, cut.e);
            }
            if(cursor < 1) pleins.push({s:cursor, e:1});

            // Helper local : dessiner un bloc de mur
            const drawWallBlock = (t1, t2, y, h, alpha)=>{
              const tMid = (t1+t2)/2;
              const len = (t2-t1)*segLen;
              if(len<=0.001) return;
              const px = a.x + (b.x-a.x)*tMid;
              const pz = a.y + (b.y-a.y)*tMid;
              const lx = (px-ox)*sc;
              const lz = (pz-oz)*sc;
              const m = AM.mul(AM.mul(baseM, AM.T(lx, y+h/2, lz)), AM.mul(AM.RY(angle), AM.S(wt, h, len*sc)));
              arDM(proj, viewM, m, arGeo.cube, alpha, COL_WALL);
            };

            // 1) Sections pleines (toute la hauteur)
            for(const p of pleins) drawWallBlock(p.s, p.e, 0, wallH, 0.82);

            // 2) Linteaux au-dessus des ouvertures
            for(const cut of cuts){
              const oh = opGeom(cut.op).y1;
              if(oh < wallH) drawWallBlock(cut.s, cut.e, oh, wallH-oh, 0.82);
            }

            // 3) Allèges sous les fenêtres
            for(const cut of cuts){
              const y0 = opGeom(cut.op).y0;
              if(y0 > 0.001) drawWallBlock(cut.s, cut.e, 0, y0, 0.82);
            }

            // 4) Vitrage des fenêtres (bleu translucide)
            for(const cut of cuts){
              if(cut.op.type==='window'){
                const tMid = (cut.s+cut.e)/2;
                const len = (cut.e-cut.s)*segLen;
                const px = a.x + (b.x-a.x)*tMid;
                const pz = a.y + (b.y-a.y)*tMid;
                const lx = (px-ox)*sc;
                const lz = (pz-oz)*sc;
                const m = AM.mul(AM.mul(baseM, AM.T(lx, (opGeom(cut.op).y0+opGeom(cut.op).y1)/2, lz)), AM.mul(AM.RY(angle), AM.S(wt*0.4, opGeom(cut.op).y1-opGeom(cut.op).y0, len*sc*0.95)));
                arDM(proj, viewM, m, arGeo.cube, 0.50, COL_GLASS);
              }
            }
          }
        }
      }

      // ── ARÊTES ROUGES POUR DÉLIMITER ──
      const corners=[[mnx,mny],[mxx,mny],[mxx,mxy],[mnx,mxy]];
      for(const [cx2,cz2] of corners){
        const lx=(cx2-ox)*sc, lz=(cz2-oz)*sc;
        arLine([lx,0.02,lz, lx,RH-0.01,lz], 0.40,0.65,1.0, 0.95);
      }
      for(let i=0;i<4;i++){
        const a=corners[i], b=corners[(i+1)%4];
        const lax=(a[0]-ox)*sc, laz=(a[1]-oz)*sc;
        const lbx=(b[0]-ox)*sc, lbz=(b[1]-oz)*sc;
        // Arête haute
        arLine([lax,RH-0.01,laz, lbx,RH-0.01,lbz], 0.40,0.65,1.0, 0.85);
        // Arête basse
        arLine([lax,0.02,laz, lbx,0.02,lbz], 0.40,0.65,1.0, 0.6);
      }
    }

    // ── SANITAIRES PLEINS AVEC MATÉRIAUX ──
    for(const s of SC.sanitaires){
      const c=CAT_SAN[s.type]; if(!c) continue;
      const h=sanH(s);

      switch(s.type){
        case 'baignoire':
        case 'balneo': {
          // Cuve principale céramique blanche
          arBoxS(s, 0, h/2, 0, c.w, h, c.d, 0.95, COL_CERAM);
          // Bord intérieur (légèrement plus foncé)
          arBoxS(s, 0, h*0.90, 0, c.w*0.86, 0.04, c.d*0.84, 0.7, [0.88,0.90,0.93]);
          // Surface eau bleue
          arBoxS(s, 0, h*0.85, 0, c.w*0.82, 0.005, c.d*0.80, 0.65, COL_WATER);
          // Robinetterie chromée
          arBoxS(s, 0-c.w*0.40, h+0.10, 0-c.d*0.30, 0.05, 0.20, 0.05, 0.95, COL_CHROME);
          // Bonde (cercle foncé)
          arBoxS(s, 0+c.w*0.40, h+0.012, 0, 0.08, 0.005, 0.08, 0.9, [0.30,0.32,0.35]);
          // Jets balnéo
          if(s.type==='balneo'){
            [[-0.30,-0.20],[0.30,-0.20],[-0.30,0.20],[0.30,0.20]].forEach(([fx,fz])=>{
              arBoxS(s, 0+c.w*fx, h*0.50, 0+c.d*fz, 0.06, 0.06, 0.04, 0.95, [0.45,0.30,0.65]);
            });
          }
          break;
        }
        case 'douche_it': {
          // Receveur de douche (plat, bord légèrement saillant)
          arBoxS(s, 0, h/2+0.02, 0, c.w, 0.04, c.d, 0.95, COL_CERAM);
          // Bonde centrale (grille foncée)
          arBoxS(s, 0, h+0.025, 0, 0.10, 0.005, 0.10, 0.9, [0.35,0.38,0.42]);
          // Pomme de douche : à la position réelle du pommeau (déplaçable dans le plan)
          const pp=pommeauPos(s);
          arBox(pp.x, 2.10, pp.y, 0.12, 0.05, 0.12, 0.95, COL_CHROME);
          arBox(pp.x, 1.55, pp.y, 0.025, 1.10, 0.025, 0.95, COL_CHROME);
          arBox(pp.x, 1.05, pp.y, 0.08, 0.04, 0.06, 0.95, COL_CHROME);
          break;
        }
        case 'lavabo':
        case 'vasque': {
          // Plan de toilette (céramique)
          arBoxS(s, 0, h-0.03, 0, c.w, 0.06, c.d, 0.95, COL_CERAM);
          // Vasque (creux foncé)
          arBoxS(s, 0, h-0.10, 0, c.w*0.72, 0.10, c.d*0.72, 0.85, [0.85,0.87,0.90]);
          // Reflet eau
          arBoxS(s, 0, h-0.06, 0, c.w*0.65, 0.002, c.d*0.65, 0.4, COL_WATER);
          // Robinet chromé
          arBoxS(s, 0, h+0.08, 0-c.d*0.35, 0.04, 0.18, 0.04, 0.95, COL_CHROME);
          arBoxS(s, 0, h+0.18, 0-c.d*0.20, 0.04, 0.04, 0.08, 0.95, COL_CHROME);
          break;
        }
        case 'wc': {
          // Cuvette (forme arrondie approximée par boîte)
          arBoxS(s, 0, h*0.40, 0+c.d*0.05, c.w*0.85, h*0.45, c.d*0.75, 0.95, COL_WC);
          // Réservoir au-dessus
          arBoxS(s, 0, h*0.85, 0-c.d*0.30, c.w, h*0.30, c.d*0.30, 0.95, COL_WC);
          // Lunette (foncée)
          arBoxS(s, 0, h*0.65, 0+c.d*0.08, c.w*0.78, 0.02, c.d*0.65, 0.85, [0.30,0.32,0.36]);
          // Bouton chasse
          arBoxS(s, 0, h*0.95, 0-c.d*0.30, 0.08, 0.02, 0.04, 0.9, COL_CHROME);
          break;
        }
        case 'bidet': {
          arBoxS(s, 0, h/2, 0, c.w, h, c.d, 0.95, COL_WC);
          // Vasque
          arBoxS(s, 0, h-0.04, 0, c.w*0.72, 0.08, c.d*0.72, 0.8, [0.85,0.87,0.90]);
          // Robinet
          arBoxS(s, 0, h+0.05, 0-c.d*0.30, 0.04, 0.10, 0.04, 0.95, COL_CHROME);
          break;
        }
        default:
          arBoxS(s, 0, h/2, 0, c.w, h, c.d, 0.85, [0.80,0.82,0.85]);
      }
    }

    // ── ZONES NF C 15-100 ──
    if(arLayers.zones && !hideZones()){
      const ZH=2.25, STEP=0.20;
      if(!arZoneCells){
        arZoneCells=[];
        const roomPoly = SC.walls.length && SC.walls[0].closed ? SC.walls[0].pts : null;
        for(let mx=mnx; mx<mxx; mx+=STEP){
          for(let mz=mny; mz<mxy; mz+=STEP){
            const cx2=mx+STEP/2, cz2=mz+STEP/2;
            if(roomPoly && !ptInPoly(cx2, cz2, roomPoly)) continue;
            const z=getZone(cx2, cz2, 1.0);
            if(z===1||z===2) arZoneCells.push({x:cx2, z:cz2, v:z});
          }
        }
      }
      for(const q of arZoneCells){
        arBox(q.x, ZH/2, q.z, STEP*0.95, ZH, STEP*0.95, q.v===1?0.20:0.14, q.v===1?COL_Z1:COL_Z2);
      }
      // Z0 : empreintes rouges (tournées avec le sanitaire)
      for(const s of SC.sanitaires){
        const c=CAT_SAN[s.type]; if(!c?.genZone) continue;
        arBoxS(s, 0, sanH(s)/2 + 0.005, 0, c.w*1.02, sanH(s)*1.02, c.d*1.02, 0.30, COL_Z0);
      }
    }

    // ── MEUBLES ──
    for(const m of SC.meubles){
      const c=CAT_MEUBLE[m.type]; if(!c) continue;
      const r=checkMeuble(m);
      const col=hideChecks()?c.col:r.errs.length?COL_ERR:r.warns.length?[1.0,0.7,0.25]:c.col;
      const mm=AM.mul(wM(m.x,m.z+m.hgt/2,m.y), AM.mul(AM.RY(-(m.rot||0)), AM.S(c.w*sc,m.hgt,c.d*sc)));
      arDM(proj,viewM,mm,arGeo.cube,0.9,col);
    }

    // ── ÉLECTRIQUE ──
    if(arLayers.elec){
      for(const e of SC.electrique){
        const c=CAT_EL[e.type]; if(!c) continue;
        const errs=checkEl(e).errs;
        const ok=hideChecks() || errs.length===0;
        const tint = hideChecks()?[0.38,0.65,0.98]:(ok?COL_OK:COL_ERR);
        if(c.mount==='wall' && typeof e.rot==='number'){
          const base=AM.mul(wM(e.x,e.h,e.y), AM.RY(-e.rot));
          arDM(proj,viewM,AM.mul(base,AM.mul(AM.T(0,0,c.pd/2*sc),AM.S(c.pw*sc,c.ph,c.pd*sc))),arGeo.cube,0.98,hideChecks()?[0.93,0.93,0.95]:[0.93,0.93,0.95]);
          arDM(proj,viewM,AM.mul(base,AM.mul(AM.T(0,0,(c.pd+0.002)*sc),AM.S(c.pw*0.55*sc,c.ph*0.55,0.004*sc))),arGeo.cube,0.98,tint);
          continue;
        }
        // Boîtier principal
        arBox(e.x, e.h, e.y, 0.10, 0.04, 0.10, 0.95, tint);
        // Halo conformité
        arBox(e.x, e.h+0.005, e.y, 0.16, 0.005, 0.16, ok?0.45:0.75, tint);
        // Tige verticale jusqu'au sol
        arBox(e.x, e.h/2, e.y, 0.015, e.h, 0.015, ok?0.35:0.6, tint);
      }
    }

    if(arAnchorStep>=1 && arA){
      arDL(proj,viewM,AM.T(arA.x,arA.y+0.01,arA.z),arGeo.ret,0.2,1,0.5,1);
    }
  }

  // HUD
  if(arFrameN%30===0){
    const ring=document.getElementById('xring');
    if(arAnchored) ring.style.borderColor='#60a5fa';
    else if(arAnchorStep===1) ring.style.borderColor='#a78bfa';
    else if(arHitOK) ring.style.borderColor='#22c55e';
    else ring.style.borderColor='rgba(255,255,255,.4)';

    document.getElementById('arInfo').textContent=
      `${SC.sanitaires.length} san · ${SC.electrique.length} él · ×${arSceneScale.toFixed(2)}`;
    if(arAnchored && !hideChecks()) updateVolBox();
  }
}

function updateVolBox(){
  const v=calcVols();
  document.getElementById('arVol').innerHTML=`
    <div class="vt">Volumes</div>
    <div class="vr"><span class="vk">Pièce</span><span class="vv">${v.roomVol.toFixed(2)}m³</span></div>
    <div class="vr"><span class="vk">Z0</span><span class="vv" style="color:#ef4444">${v.z0.toFixed(2)}</span></div>
    <div class="vr"><span class="vk">Z1</span><span class="vv" style="color:#f59e0b">${v.z1.toFixed(2)}</span></div>
    <div class="vr"><span class="vk">Z2</span><span class="vv" style="color:#93c5fd">${v.z2.toFixed(2)}</span></div>
    <div class="vr"><span class="vk">Hors</span><span class="vv" style="color:#22c55e">${v.hors.toFixed(2)}</span></div>`;
}
