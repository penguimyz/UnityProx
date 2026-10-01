/* Unity — underwater background
   Layer 1 (WebGL): ray-traced water volume — Snell's window on the surface, total internal
   reflection, god rays, dispersed caustics on sand, distant reef silhouettes, marine snow, fog
   and click ripples.
   Layer 2 (2D canvas): schooling fish that flee the cursor, wobbling bubbles, swaying kelp and
   the occasional manta passing in the distance. */
(function () {
  'use strict';

  const VERT = `attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

  const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLook;
uniform vec2 uMouse;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSand;
uniform vec3 uSun;
uniform vec3 uAccent;
uniform float uBio;
uniform float uOct;
uniform float uRays;
uniform float uSnow;
uniform float uCaus;
uniform float uDisp;
uniform vec4 uRip[6];

#define TAU 6.2831853

float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.,0.)),u.x),mix(hash12(i+vec2(0.,1.)),hash12(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){if(float(i)>=uOct)break;v+=a*noise(p);p=m*p;a*=.5;}return v;}

/* tileable water caustic (iterated turbulence) */
float caustic(vec2 uv,float t){
  vec2 p=mod(uv*TAU,TAU)-250.;
  vec2 i=p;float c=1.;float inten=.005;
  for(int n=0;n<5;n++){
    float tt=t*(1.-(3.5/float(n+1)));
    i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+tt)/inten),p.y/(cos(i.y+tt)/inten)));
  }
  c/=5.;c=1.17-pow(c,1.4);
  return pow(abs(c),8.);
}

void main(){
  vec2 frag=vUv*uRes;
  vec2 q=(frag-.5*uRes)/uRes.y;
  vec2 q0=q;
  float t=uTime;

  /* click ripples — refract the whole scene */
  float ripLight=0.;
  for(int k=0;k<6;k++){
    vec4 r=uRip[k];
    if(r.w<=0.)continue;
    float age=t-r.z;
    if(age<0.||age>4.)continue;
    vec2 rp=(r.xy*uRes-.5*uRes)/uRes.y;
    vec2 d=q-rp;float L=length(d);
    float front=age*.32;
    float env=exp(-pow((L-front)*14.,2.))*exp(-age*1.4)*r.w*smoothstep(0.,.15,age);
    float w=sin((L-front)*110.)*env;
    q+=d/(L+1e-4)*w*.006;
    ripLight+=w;
  }

  /* underwater shimmer */
  q+=(vec2(noise(q*3.5+t*.35),noise(q*3.5-t*.35+9.))-.5)*.007;

  /* camera */
  float fov=1.45;
  vec3 rd=normalize(vec3(q*fov,1.));
  float pitch=.18+uLook.y*.045,yaw=uLook.x*.07;
  float cp=cos(pitch),sp=sin(pitch);
  rd=vec3(rd.x,rd.y*cp+rd.z*sp,-rd.y*sp+rd.z*cp);
  float cy=cos(yaw),sy=sin(yaw);
  rd=vec3(rd.x*cy+rd.z*sy,rd.y,-rd.x*sy+rd.z*cy);
  vec3 ro=vec3(0.);

  vec3 sunDir=normalize(vec3(.3,1.,.65));

  /* in-scattered water colour for this direction */
  float up=rd.y;
  float scat=pow(max(dot(rd,sunDir),0.),5.);
  vec3 water=mix(uDeep,uShallow,smoothstep(-.55,.85,up));
  water+=uSun*uShallow*scat*.9;
  water+=uShallow*pow(max(up,0.),2.)*.35;

  vec3 col=water;
  float k=.085;
  float S=7.,F=1.35;
  float hlen=length(rd.xz);

  if(rd.y>0.){
    /* underside of the surface */
    float ts=S/rd.y;
    vec2 P=ro.xz+rd.xz*ts;
    float e=.06;
    vec2 wp=P*.32+vec2(t*.07,t*.05);
    vec2 wq=P*1.15+vec2(-t*.16,t*.11);
    float h0=fbm(wp)+.35*noise(wq)+.15*noise(wq*2.3+7.);
    float hx=fbm(wp+vec2(e,0.))+.35*noise(wq+vec2(e*3.6,0.))+.15*noise((wq+vec2(e*3.6,0.))*2.3+7.);
    float hz=fbm(wp+vec2(0.,e))+.35*noise(wq+vec2(0.,e*3.6))+.15*noise((wq+vec2(0.,e*3.6))*2.3+7.);
    vec3 n=normalize(vec3(-(hx-h0)/e*.55,-1.,-(hz-h0)/e*.55));
    float cosi=-dot(rd,n);
    float k2=1.-1.777*(1.-cosi*cosi);           /* >0 inside Snell's window */
    float win=smoothstep(0.,.35,k2);
    vec3 tr=normalize(1.333*rd+(1.333*cosi-sqrt(max(k2,0.)))*n);
    vec3 tir=uDeep*.8+uShallow*(.18+.25*h0);
    vec3 sky=mix(uShallow*1.5+.2,vec3(.9,.98,1.),.45);
    float sunSpot=pow(max(dot(tr,normalize(vec3(.3,1.,.5))),0.),40.)*3.;
    vec3 surf=mix(tir,sky*.8+uSun*sunSpot,pow(win,.7)*.8)+uShallow*.25*pow(max(cosi,0.),8.);
    surf+=uSun*caustic(P*.11,t*.32)*.22*uCaus*(.4+.6*win);
    float tf=exp(-ts*k*.5);
    col=mix(water,surf,tf);
  }else{
    /* sea floor */
    float tf=F/(-rd.y);
    vec2 P=ro.xz+rd.xz*tf;
    float n1=fbm(P*1.2);
    float rip=sin(P.x*5.5+P.y*1.8+n1*7.)*.5+.5;
    vec3 sand=uSand*(.62+.38*n1)*(.78+.22*rip);
    float rk=fbm(P*.21+3.7);
    float rock=smoothstep(.56,.63,rk);
    vec3 rockC=mix(uSand*.32,vec3(.10,.20,.15),.55)*(.65+.7*fbm(P*2.6));
    sand=mix(sand,rockC,rock);
    vec2 cu=P*.3;float ct=t*.42;
    float cg=caustic(cu,ct);
    vec3 cs=uDisp>.5?vec3(caustic(cu+vec2(.006,0.),ct),cg,caustic(cu-vec2(.006,0.),ct)):vec3(cg);
    float lightMask=.5+.5*noise(P*.13+t*.04);
    vec3 lit=sand*(.3+.7*lightMask)+uSun*cs*uCaus*1.25*lightMask*(1.-rock*.5);
    lit*=mix(vec3(1.),uShallow*2.2,.28);
    float trn=exp(-tf*k*1.45)*.92;
    col=mix(water,lit,trn);
  }

  /* distant reef silhouettes */
  float ang=atan(rd.x,rd.z);
  for(int l=0;l<2;l++){
    float fl=float(l);
    float D=fl<.5?42.:20.;
    float Hw=-F+(fbm(vec2(ang*(2.2+fl*1.7)+fl*13.+ro.z*.002,fl*7.))-.3)*(fl<.5?11.:5.);
    float yAt=rd.y/max(hlen,1e-3)*D;
    bool floorFirst=rd.y<0.&&(F/(-rd.y))*hlen<D;
    if(!floorFirst){
      float cov=smoothstep(0.,.025*D,Hw-yAt);
      vec3 rc=mix(uDeep*.55,uSand*.25,.3)*(.8+.4*noise(vec2(ang*30.,yAt)));
      col=mix(col,mix(water,rc,exp(-D*k*.9)),cov);
    }
  }

  /* god rays — shafts radiating from the sun above the frame */
  vec3 a1=normalize(cross(sunDir,vec3(0.,0.,1.)));vec3 a2=cross(sunDir,a1);
  float ang2=atan(dot(rd,a1),-dot(rd,a2));
  float b1=noise(vec2(ang2*16.,t*.22));
  float b2=noise(vec2(ang2*37.+5.,-t*.31));
  float b3=noise(vec2(ang2*7.+11.,t*.12));
  float beams=pow(b1*b2*1.6+b3*.35,2.2);
  float rmask=smoothstep(-.45,.75,rd.y)*(.35+.65*smoothstep(.0,1.,dot(rd,sunDir)));
  col+=uSun*mix(uShallow,vec3(1.),.3)*beams*uRays*rmask*.32;

  /* marine snow, three parallax layers */
  vec3 snow=vec3(0.);
  for(int L=0;L<3;L++){
    float fl=float(L);
    float sc=7.+fl*6.;
    vec2 sp2=q0*sc+vec2(t*(.04+fl*.03)+uLook.x*(fl+1.)*.25,t*(.07+fl*.05)-uLook.y*(fl+1.)*.2);
    vec2 cell=floor(sp2);vec2 f=fract(sp2)-.5;
    vec2 h=hash22(cell+fl*17.3);
    if(h.x<.55*uSnow){
      vec2 o=(h-.5)*.6+.14*vec2(sin(t*.6+h.y*TAU),cos(t*.45+h.x*TAU));
      float d=length(f-o);
      float sz=.035+.05*h.y*(1.-fl*.25);
      float pulse=.6+.4*sin(t*(1.5+h.y*2.)+h.x*TAU);
      snow+=smoothstep(sz,0.,d)*(.18+.22*fl)*mix(1.,pulse*1.8,uBio);
    }
  }
  vec3 snowC=mix(uShallow*1.4+.25,uAccent*1.8,uBio);
  col+=snowC*snow;

  /* ripple glints + soft lantern under the cursor */
  col+=uSun*ripLight*.025;
  vec2 mq=(uMouse*uRes-.5*uRes)/uRes.y;
  col+=uShallow*.10*exp(-length(q0-mq)*5.);

  /* vignette, tonemap, gamma, dither */
  vec2 vv=vUv-.5;
  col*=1.-.55*pow(length(vv*vec2(1.,1.15))*1.2,2.4);
  col=1.-exp(-col*1.3);
  col=pow(max(col,0.),vec3(1./2.2));
  col+=(hash12(frag+fract(t*.37)*113.)-.5)/200.;
  gl_FragColor=vec4(col,1.);
}`;

  const QUALITY = {
    low:    { scale: 0.3,  oct: 3, fps: 30, disp: 0 },
    medium: { scale: 0.45, oct: 4, fps: 60, disp: 0 },
    high:   { scale: 0.7,  oct: 5, fps: 60, disp: 1 },
    ultra:  { scale: 1.0,  oct: 6, fps: 60, disp: 1 },
  };
  const hexToLin = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)); };

  let glCv, lifeCv, gl, prog, U = {};
  let W = 0, H = 0, dpr = 1;
  let quality = 'medium', Q = QUALITY.medium, autoScale = 1;
  let enabled = true, paused = false;
  let lastFrame = 0, simTime = 0, lastNow = 0;
  const mouse = { nx: 0.5, ny: 0.5 }, look = [0, 0];
  let lookTarget = [0, 0];
  const ripples = [];
  let theme = null;
  let fpsCb = null, fpsCount = 0, fpsLast = performance.now(), perfFrames = 0, perfStart = 0;

  function initGL() {
    try { gl = glCv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' }); } catch (e) { gl = null; }
    if (!gl) return false;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; } return o; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { gl = null; return false; }
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); gl = null; return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uTime', 'uLook', 'uMouse', 'uShallow', 'uDeep', 'uSand', 'uSun', 'uAccent', 'uBio', 'uOct', 'uRays', 'uSnow', 'uCaus', 'uDisp', 'uRip'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    glCv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; });
    return true;
  }
  function applyThemeUniforms() {
    if (!gl || !theme) return;
    gl.uniform3fv(U.uShallow, hexToLin(theme.shallow)); gl.uniform3fv(U.uDeep, hexToLin(theme.deep)); gl.uniform3fv(U.uSand, hexToLin(theme.sand));
    gl.uniform3fv(U.uSun, hexToLin(theme.sun)); gl.uniform3fv(U.uAccent, hexToLin(theme.accent));
    gl.uniform1f(U.uBio, theme.bio || 0); gl.uniform1f(U.uRays, theme.rays == null ? 1 : theme.rays);
    gl.uniform1f(U.uSnow, theme.snow == null ? 1 : theme.snow); gl.uniform1f(U.uCaus, theme.caustics == null ? 1 : theme.caustics);
  }
  function resize() {
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    const s = (quality === 'ultra' ? dpr : Q.scale) * autoScale;
    glCv.width = Math.max(2, Math.round(W * s)); glCv.height = Math.max(2, Math.round(H * s));
    if (gl) gl.viewport(0, 0, glCv.width, glCv.height);
    if (window.Reef) Reef.resize(W, H, quality);
  }
  function drawGL(time) {
    if (!gl) return fallback2D();
    gl.uniform2f(U.uRes, glCv.width, glCv.height); gl.uniform1f(U.uTime, time);
    gl.uniform2f(U.uLook, look[0], look[1]); gl.uniform2f(U.uMouse, mouse.nx, 1 - mouse.ny);
    gl.uniform1f(U.uOct, Q.oct); gl.uniform1f(U.uDisp, Q.disp);
    const arr = new Float32Array(24);
    ripples.forEach((r, i) => { if (i < 6) { arr[i * 4] = r.x; arr[i * 4 + 1] = r.y; arr[i * 4 + 2] = r.t; arr[i * 4 + 3] = r.s; } });
    gl.uniform4fv(U.uRip, arr);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function fallback2D() {
    const c = glCv.getContext('2d'); if (!c || !theme) return;
    const g = c.createLinearGradient(0, 0, 0, glCv.height);
    g.addColorStop(0, theme.shallow); g.addColorStop(0.7, theme.deep); g.addColorStop(1, theme.sand);
    c.fillStyle = g; c.fillRect(0, 0, glCv.width, glCv.height);
  }
  /* dynamic resolution: if frames are slow, render the water smaller (and grow back when there's headroom) */
  function adapt(now) {
    if (!perfStart) { perfStart = now; perfFrames = 0; return; }
    perfFrames++;
    if (now - perfStart < 2000) return;
    const fps = (perfFrames * 1000) / (now - perfStart); perfStart = now; perfFrames = 0;
    const target = Q.fps;
    if (fps < target * 0.8 && autoScale > 0.5) { autoScale = Math.max(0.5, autoScale * 0.82); resize(); if (window.Reef) Reef.setAutoScale(autoScale); }
    else if (fps > target * 0.95 && autoScale < 1) { autoScale = Math.min(1, autoScale * 1.1); resize(); if (window.Reef) Reef.setAutoScale(autoScale); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!(enabled && !paused && !document.hidden)) { lastNow = now; perfStart = 0; return; }
    if (now - lastFrame < 1000 / Q.fps - 2) return;
    lastFrame = now;
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
    simTime += dt;
    look[0] += (lookTarget[0] - look[0]) * 0.03; look[1] += (lookTarget[1] - look[1]) * 0.03;
    for (let i = ripples.length - 1; i >= 0; i--) if (simTime - ripples[i].t > 4) ripples.splice(i, 1);
    drawGL(simTime);
    if (window.Reef) Reef.render(dt, simTime, look);
    adapt(now);
    fpsCount++;
    if (fpsCb && now - fpsLast > 500) { fpsCb(Math.round((fpsCount * 1000) / (now - fpsLast))); fpsCount = 0; fpsLast = now; }
    else if (!fpsCb) { fpsCount = 0; fpsLast = now; }
  }

  const Water = {
    init(glCanvas, lifeCanvas) {
      glCv = glCanvas; lifeCv = lifeCanvas;
      const ok = initGL();
      if (window.Reef) Reef.init(lifeCv);
      addEventListener('resize', resize);
      addEventListener('pointermove', (e) => { mouse.nx = e.clientX / innerWidth; mouse.ny = e.clientY / innerHeight; lookTarget = [(mouse.nx - 0.5) * 2, -(mouse.ny - 0.5) * 2]; }, { passive: true });
      resize();
      requestAnimationFrame(frame);
      return ok;
    },
    setTheme(th) { theme = th; applyThemeUniforms(); if (window.Reef) Reef.setTheme(th); if (!gl) fallback2D(); },
    setQuality(q) { if (!QUALITY[q]) return; quality = q; Q = QUALITY[q]; autoScale = 1; if (window.Reef) Reef.setAutoScale(1); resize(); },
    setEnabled(v) { enabled = v; glCv.style.opacity = lifeCv.style.opacity = v ? '1' : '0'; },
    setPaused(v) { paused = v; },
    setLife(k, v) { if (window.Reef) Reef.setLife(k, v); },
    setDensity(m) { if (window.Reef) Reef.setDensity(m); },
    onFps(cb) { fpsCb = cb; },
    click(x, y) {
      ripples.unshift({ x: x / W, y: 1 - y / H, t: simTime, s: 1 }); if (ripples.length > 6) ripples.pop();
      if (window.Reef) Reef.click(x, y);
    },
    get hasGL() { return !!gl; },
    get autoScale() { return autoScale; },
  };
  window.Water = Water;
})();
