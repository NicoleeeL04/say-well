import * as T from 'three';
import { GLTFLoader } from './GLTFLoader.js';
import {matchesRegion} from './regions.js';
const root=document.getElementById('skin-paint'),stage=root.querySelector('#sp-stage'),status=root.querySelector('#sp-status');
try{
const gltf=await new GLTFLoader().loadAsync('./human.glb');
const scene=new T.Scene(),human=new T.Group();scene.add(human);human.add(gltf.scene);human.position.y=.89;gltf.scene.position.y-=.89;let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});if(!mesh?.geometry.attributes.uv)throw Error('Model is missing texture coordinates');
const geometry=mesh.geometry,pos=geometry.attributes.position,uv=geometry.attributes.uv,index=geometry.index.array,norm=geometry.attributes.normal;
const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#c8ad98';ctx.fillRect(0,0,2048,2048);
const texture=new T.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;
mesh.material=new T.MeshStandardMaterial({map:texture,roughness:.70,metalness:0,side:T.DoubleSide});
scene.add(new T.HemisphereLight(0xffffff,0x6a6470,2));const key=new T.DirectionalLight(0xfff4e9,2.6);key.position.set(-3,5,4);scene.add(key);const rim=new T.DirectionalLight(0xffffff,1.4);rim.position.set(3,2,-3);scene.add(rim);
const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);stage.append(renderer.domElement);
const camera=new T.PerspectiveCamera(34,1,.01,30);let distance=3.5;const orientation=new T.Quaternion();camera.position.set(0,.89,distance);camera.lookAt(0,.89,0);
const state={left:0,right:0,mode:'paint',size:3,color:0},palette=['#d44d61','#397bd1','#9652b5'];let strokeCount=0,undo=[],drag=null,readOnly=false,revision=0;
function changed(source){revision++;root.dispatchEvent(new CustomEvent('paintchange',{detail:{source,revision}}));}
const ring=new T.Mesh(new T.RingGeometry(.92,1,48),new T.MeshBasicMaterial({color:0xa33950,side:T.DoubleSide,depthTest:false,transparent:true,opacity:.8}));ring.renderOrder=20;ring.visible=false;scene.add(ring);
const bones={};for(const [side,suffix]of [['left','l'],['right','r']]){const bone=mesh.skeleton.bones.find(b=>b.name==='upperarm_'+suffix);bones[side]={bone,rest:bone.quaternion.clone(),sign:side==='left'?1:-1};}
let renderFrame=0;
function draw(){human.quaternion.copy(orientation);camera.position.z=distance;human.updateMatrixWorld(true);mesh.skeleton.update();if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=0;renderer.render(scene,camera)})}

function pose(){human.rotation.set(0,0,0);human.updateMatrixWorld(true);for(const side of ['left','right']){const b=bones[side],parentQ=b.bone.parent.getWorldQuaternion(new T.Quaternion()),axis=new T.Vector3(0,0,1).applyQuaternion(parentQ.invert());b.bone.quaternion.copy(new T.Quaternion().setFromAxisAngle(axis,b.sign*state[side]*Math.PI/180)).multiply(b.rest);root.querySelector('#sp-'+side).value=state[side];root.querySelector(side==='left'?'#sp-lv':'#sp-rv').textContent=state[side]+'°';}human.updateMatrixWorld(true);mesh.skeleton.update();updatePicking();ring.visible=false;draw()}
function summary(){status.textContent=strokeCount?strokeCount+' mark'+(strokeCount===1?'':'s')+' · Saved in this page only':'Drag to paint. Right-drag or choose Rotate to turn the body.';root.querySelector('#sp-undo').disabled=!undo.length}
function mode(m){if(readOnly)m='rotate';state.mode=m;root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===m)));stage.style.cursor=m==='rotate'?'grab':'crosshair';root.querySelector('#sp-hint').textContent=m==='rotate'?'Drag to rotate · Scroll to zoom':'Paint on the body · Right-drag to rotate';ring.visible=false;draw()}
// A refitted BVH picks a cached posed surface instead of re-skinning every
// triangle for every pointer event. Topology is built once; poses refit bounds.
const posed=new Float32Array(pos.array.length),tempVertex=new T.Vector3();
const triangleIds=Array.from({length:index.length/3},(_,i)=>i);
const centers=new Float32Array(triangleIds.length*3);
for(let t=0;t<triangleIds.length;t++)for(let axis=0;axis<3;axis++)centers[t*3+axis]=(pos.array[index[t*3]*3+axis]+pos.array[index[t*3+1]*3+axis]+pos.array[index[t*3+2]*3+axis])/3;
function buildBVH(ids){const node={box:new T.Box3(),ids:null,left:null,right:null};if(ids.length<=16){node.ids=ids;return node}const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of ids)for(let a=0;a<3;a++){const v=centers[id*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v)}let axis=0;for(let a=1;a<3;a++)if(max[a]-min[a]>max[axis]-min[axis])axis=a;ids.sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]);const mid=ids.length>>1;node.left=buildBVH(ids.slice(0,mid));node.right=buildBVH(ids.slice(mid));return node}
const pickTree=buildBVH(triangleIds);
function refit(node){node.box.makeEmpty();if(node.ids){for(const id of node.ids)for(let j=0;j<3;j++){const i=index[id*3+j]*3;node.box.expandByPoint(tempVertex.fromArray(posed,i))}}else{refit(node.left);refit(node.right);node.box.copy(node.left.box).union(node.right.box)}}
function updatePicking(){for(let i=0;i<pos.count;i++){mesh.getVertexPosition(i,tempVertex);tempVertex.toArray(posed,i*3)}refit(pickTree)}
const localRay=new T.Ray(),inverseWorld=new T.Matrix4(),va=new T.Vector3(),vb=new T.Vector3(),vc=new T.Vector3(),intersection=new T.Vector3();
function pickSurface(worldRay){inverseWorld.copy(mesh.matrixWorld).invert();localRay.copy(worldRay).applyMatrix4(inverseWorld);let best=Infinity,result=null;const stack=[pickTree];while(stack.length){const node=stack.pop();if(!localRay.intersectsBox(node.box))continue;if(node.ids){for(const id of node.ids){const a=index[id*3],b=index[id*3+1],c=index[id*3+2];va.fromArray(posed,a*3);vb.fromArray(posed,b*3);vc.fromArray(posed,c*3);if(localRay.intersectTriangle(va,vb,vc,false,intersection)){const distance=intersection.distanceToSquared(localRay.origin);if(distance<best){best=distance;result={face:{a,b,c},point:intersection.clone().applyMatrix4(mesh.matrixWorld)}}}}}else{stack.push(node.left,node.right)}}return result}
const ray=new T.Raycaster(),pointer=new T.Vector2();
function hitAt(x,y){const r=renderer.domElement.getBoundingClientRect();pointer.set((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2);ray.setFromCamera(pointer,camera);human.updateMatrixWorld(true);mesh.skeleton.update();const hit=pickSurface(ray.ray);if(!hit)return null;
 const a=new T.Vector3().fromArray(posed,hit.face.a*3),b=new T.Vector3().fromArray(posed,hit.face.b*3),c=new T.Vector3().fromArray(posed,hit.face.c*3),p=mesh.worldToLocal(hit.point.clone());const bary=T.Triangle.getBarycoord(p,a,b,c,new T.Vector3());
 const center=new T.Vector3(),normal=new T.Vector3();[hit.face.a,hit.face.b,hit.face.c].forEach((i,j)=>{const w=[bary.x,bary.y,bary.z][j];center.addScaledVector(new T.Vector3().fromBufferAttribute(pos,i),w);normal.addScaledVector(new T.Vector3().fromBufferAttribute(norm,i),w)});normal.normalize();
 const visibleNormal=new T.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize().transformDirection(mesh.matrixWorld);if(visibleNormal.dot(ray.ray.direction)>0)visibleNormal.negate();ring.position.copy(hit.point).addScaledVector(visibleNormal,.001);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),visibleNormal);ring.scale.setScalar(state.size/100);ring.visible=state.mode!=='rotate';return {center,normal};}
// Paint a 3D brush footprint into every intersecting UV triangle, including UV seams.
const faces=[];for(let j=0;j<index.length;j+=3){let ids=[index[j],index[j+1],index[j+2]],p=ids.map(i=>new T.Vector3().fromBufferAttribute(pos,i));let center=p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1/3),radius=Math.max(...p.map(v=>v.distanceTo(center)));const normal=new T.Vector3().crossVectors(p[1].clone().sub(p[0]),p[2].clone().sub(p[0])).normalize();faces.push({p,center,radius,normal,uv:ids.map(i=>[uv.getX(i)*2048,uv.getY(i)*2048])})}
// Brush queries only nearby UV faces using a rest-space spatial grid.
const cellSize=.04,faceGrid=new Map();
for(let id=0;id<faces.length;id++){const f=faces[id],min=[0,1,2].map(a=>Math.floor(Math.min(...f.p.map(p=>p.getComponent(a)))/cellSize)),max=[0,1,2].map(a=>Math.floor(Math.max(...f.p.map(p=>p.getComponent(a)))/cellSize));for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++){const key=x+','+y+','+z;let list=faceGrid.get(key);if(!list)faceGrid.set(key,list=[]);list.push(id)}}
function nearbyFaces(p,r){const ids=new Set();for(let x=Math.floor((p.x-r)/cellSize);x<=Math.floor((p.x+r)/cellSize);x++)for(let y=Math.floor((p.y-r)/cellSize);y<=Math.floor((p.y+r)/cellSize);y++)for(let z=Math.floor((p.z-r)/cellSize);z<=Math.floor((p.z+r)/cellSize);z++){const list=faceGrid.get(x+','+y+','+z);if(list)for(const id of list)ids.add(id)}return ids}
function paint(x,y){const h=hitAt(x,y);if(!h){ring.visible=false;draw();return false}const radius=state.size/100,n=h.normal,helper=Math.abs(n.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0),u=new T.Vector3().crossVectors(helper,n).normalize(),v=new T.Vector3().crossVectors(n,u),color=state.mode==='erase'?'#c8ad98':palette[state.color];let painted=false;
 for(const id of nearbyFaces(h.center,radius)){const f=faces[id];if(f.center.distanceTo(h.center)>radius+f.radius||f.normal.dot(n)<.2)continue;const projected=f.p.map(p=>{const d=p.clone().sub(h.center);return [d.dot(u),d.dot(v),d.dot(n)]});if(projected.every(p=>Math.abs(p[2])>radius*.5))continue;
 const [[x0,y0],[x1,y1],[x2,y2]]=projected,[[U0,V0],[U1,V1],[U2,V2]]=f.uv,dx1=x1-x0,dy1=y1-y0,dx2=x2-x0,dy2=y2-y0,det=dx1*dy2-dx2*dy1;if(Math.abs(det)<1e-12)continue;
 const A=((U1-U0)*dy2-(U2-U0)*dy1)/det,C=((U2-U0)*dx1-(U1-U0)*dx2)/det,B=((V1-V0)*dy2-(V2-V0)*dy1)/det,D=((V2-V0)*dx1-(V1-V0)*dx2)/det,E=U0-A*x0-C*y0,F=V0-B*x0-D*y0;
 ctx.save();ctx.beginPath();ctx.moveTo(U0,V0);ctx.lineTo(U1,V1);ctx.lineTo(U2,V2);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,E,F);const g=ctx.createRadialGradient(0,0,radius*.55,0,0,radius);g.addColorStop(0,color);g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(-radius,-radius,2*radius,2*radius);ctx.restore();painted=true;
 }if(painted)texture.needsUpdate=true;draw();return painted;}
function trackball(x,y){const r=stage.getBoundingClientRect(),scale=Math.min(r.width,r.height)*.45;let a=(x-r.left-r.width/2)/scale,b=(r.height/2-y+r.top)/scale,d=a*a+b*b;return new T.Vector3(a,b,d<=.5?Math.sqrt(1-d):.5/Math.sqrt(d)).normalize()}
stage.addEventListener('contextmenu' ,e=>e.preventDefault());stage.addEventListener('pointerdown',e=>{if(![0,2].includes(e.button))return;stage.setPointerCapture(e.pointerId);const orbit=readOnly||state.mode==='rotate'||e.button===2;drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,ball:trackball(e.clientX,e.clientY),orientation:orientation.clone(),orbit,changed:false,before:orbit?null:ctx.getImageData(0,0,2048,2048)};if(!orbit)drag.changed=paint(e.clientX,e.clientY)});
let pendingMove=null,moveFrame=0;
function processMove(e){const started=performance.now();try{if(!drag){if(state.mode!=='rotate'){hitAt(e.clientX,e.clientY)|| (ring.visible=false);draw()}return}if(drag.orbit){const delta=new T.Quaternion().setFromUnitVectors(drag.ball,trackball(e.clientX,e.clientY));const axis=new T.Vector3(delta.x,delta.y,delta.z);const length=axis.length();if(length>1e-8)delta.setFromAxisAngle(axis.multiplyScalar(1/length),2*Math.atan2(length,delta.w)*1.7);orientation.copy(delta).multiply(drag.orientation).normalize();ring.visible=false;draw();return}const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5));for(let i=1;i<=n;i++)drag.changed=paint(drag.lastX+dx*i/n,drag.lastY+dy*i/n)||drag.changed;drag.lastX=e.clientX;drag.lastY=e.clientY}finally{root.dataset.brushMs=(performance.now()-started).toFixed(2)}}
function flushMove(){if(moveFrame){cancelAnimationFrame(moveFrame);moveFrame=0}if(pendingMove){const e=pendingMove;pendingMove=null;processMove(e)}}
stage.addEventListener('pointermove',e=>{pendingMove={clientX:e.clientX,clientY:e.clientY};if(!moveFrame)moveFrame=requestAnimationFrame(()=>{moveFrame=0;flushMove()})});

function finish(){flushMove();if(!drag)return;if(drag.changed){undo.push({image:drag.before,count:strokeCount});if(undo.length>5)undo.shift();strokeCount++;summary();changed('manual')}drag=null;ring.visible=false;draw()}
stage.addEventListener('pointerup',finish);stage.addEventListener('pointercancel',finish);stage.addEventListener('pointerleave',()=>{if(!drag){ring.visible=false;draw()}});stage.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.6,Math.min(5,distance+e.deltaY*.020));ring.visible=false;draw()},{passive:false});
root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{finish();mode(b.dataset.mode)});root.querySelector('#sp-color').onchange=e=>{state.color=+e.target.value;mode('paint')};root.querySelector('#sp-size').oninput=e=>{state.size=+e.target.value};for(const side of ['left','right'])root.querySelector('#sp-'+side).oninput=e=>{state[side]=+e.target.value;pose()};
for(const [id,value]of [['front',0],['back',Math.PI],['leftview',Math.PI/2]])root.querySelector('#sp-'+id).onclick=()=>{orientation.setFromAxisAngle(new T.Vector3(0,1,0),value);ring.visible=false;draw()};for(const [id,angle]of [['top',Math.PI/2],['bottom',-Math.PI/2]])root.querySelector('#sp-'+id).onclick=()=>{orientation.setFromAxisAngle(new T.Vector3(1,0,0),angle);ring.visible=false;draw()};root.querySelector('#sp-undo').onclick=()=>{const p=undo.pop();if(!p)return;ctx.putImageData(p.image,0,0);strokeCount=p.count;texture.needsUpdate=true;summary();draw();changed('manual')};root.querySelector('#sp-clear').onclick=()=>{undo.push({image:ctx.getImageData(0,0,2048,2048),count:strokeCount});if(undo.length>5)undo.shift();ctx.fillStyle='#c8ad98';ctx.fillRect(0,0,2048,2048);texture.needsUpdate=true;strokeCount=0;summary();draw();changed('manual')};
new ResizeObserver(()=>{if(!stage.clientWidth||!stage.clientHeight)return;renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();draw()}).observe(stage);
// Cache the dominant skeleton bone per face so posed arms and hands retain
// anatomically consistent marks in their original UV coordinates.
const bodyBox=new T.Box3().setFromBufferAttribute(pos),bodySize=bodyBox.getSize(new T.Vector3());
const joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
for(let id=0;id<faces.length;id++){
 const scores=new Map();
 for(let j=0;j<3;j++){const vertex=index[id*3+j];for(let k=0;k<4;k++){
  const joint=joints.array[vertex*4+k],weight=weights.array[vertex*4+k];
  scores.set(joint,(scores.get(joint)||0)+weight);
 }}
 const dominant=[...scores].sort((a,b)=>b[1]-a[1])[0][0];
 faces[id].regionPoint={x:faces[id].center.x/bodySize.y,y:(faces[id].center.y-bodyBox.min.y)/bodySize.y,
  normalZ:faces[id].normal.z,bone:mesh.skeleton.bones[dominant].name};
}
function markRegions(regions){
 finish();undo.push({image:ctx.getImageData(0,0,2048,2048),count:strokeCount});if(undo.length>5)undo.shift();
 ctx.fillStyle='#c8ad98';ctx.fillRect(0,0,2048,2048);ctx.fillStyle=palette[0];
 const marked=[],missing=[];let triangles=0;
 for(const region of regions){let hits=0;
  for(const face of faces){if(!matchesRegion(face.regionPoint,region))continue;
   ctx.beginPath();ctx.moveTo(...face.uv[0]);ctx.lineTo(...face.uv[1]);ctx.lineTo(...face.uv[2]);ctx.closePath();ctx.fill();hits++;
  }
  (hits?marked:missing).push(region);triangles+=hits;
 }
 strokeCount=marked.length;texture.needsUpdate=true;
 orientation.setFromAxisAngle(new T.Vector3(0,1,0),regions.length&&regions.every(r=>r.region.includes('back')||r.surface==='back')?Math.PI:0);
 distance=3.5;summary();draw();changed('automatic');
 return {marked,missing,triangles};
}
root.skinPaint={markRegions,getInfo:()=>({strokeCount,revision}),setReadOnly:value=>{readOnly=value;root.querySelectorAll('[data-mode=paint],[data-mode=erase],#sp-undo,#sp-clear,#sp-color,#sp-size,#sp-left,#sp-right').forEach(el=>el.disabled=value);mode(value?'rotate':'paint');if(!value)summary();},snapshot:()=>{ring.visible=false;human.quaternion.copy(orientation);camera.position.z=distance;human.updateMatrixWorld(true);mesh.skeleton.update();renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png')},getState:()=>({version:2,left:state.left,right:state.right,texture:canvas.toDataURL('image/png'),strokeCount}),setState:async d=>{if(d?.version!==2||typeof d.texture!=='string'||!d.texture.startsWith('data:image/png;base64,'))throw Error('Invalid annotation');const img=new Image();img.src=d.texture;await img.decode();ctx.drawImage(img,0,0,2048,2048);state.left=Math.max(0,Math.min(120,Number(d.left)||0));state.right=Math.max(0,Math.min(120,Number(d.right)||0));texture.needsUpdate=true;strokeCount=Number(d.strokeCount)||0;undo=[];pose();summary();changed('restore');}};
root.dataset.model='CC0 MakeHuman / Innerscene';root.dataset.vertices=String(pos.count);pose();mode('paint');summary();root.dataset.ready='true';root.dispatchEvent(new Event('skinpaint-ready'));
}catch(e){root.dataset.error='true';status.textContent='Body model unavailable: '+e.message;console.error(e)}
