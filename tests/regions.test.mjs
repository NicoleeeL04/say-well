import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS,matchesRegion} from '../body-painter/regions.js';
// Exercise the actual bundled model, not invented points matching the code.
const glb=readFileSync(new URL('../body-painter/human.glb',import.meta.url));
const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength).toString());
const binary=glb.subarray(28+jsonLength);
function accessor(id){
 const a=gltf.accessors[id],view=gltf.bufferViews[a.bufferView];
 const count={VEC3:3,VEC4:4,SCALAR:1}[a.type];
 const [size,read]={5126:[4,'readFloatLE'],5125:[4,'readUInt32LE'],5123:[2,'readUInt16LE'],5121:[1,'readUInt8']}[a.componentType];
 return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,j)=>binary[read]((view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||count*size)+j*size)));
}
const primitive=gltf.meshes[0].primitives[0],attrs=primitive.attributes;
const positions=accessor(attrs.POSITION),joints=accessor(attrs.JOINTS_0),weights=accessor(attrs.WEIGHTS_0),indices=accessor(primitive.indices).flat();
const names=gltf.skins[0].joints.map(i=>gltf.nodes[i].name);
const minY=gltf.accessors[attrs.POSITION].min[1],height=gltf.accessors[attrs.POSITION].max[1]-minY;
const points=[];
for(let i=0;i<indices.length;i+=3){
 const vertices=indices.slice(i,i+3),[a,b,c]=vertices.map(v=>positions[v]);
 const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
 const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
 const scores=new Map();for(const v of vertices)for(let k=0;k<4;k++)scores.set(joints[v][k],(scores.get(joints[v][k])||0)+weights[v][k]);
 points.push({x:(a[0]+b[0]+c[0])/3/height,y:((a[1]+b[1]+c[1])/3-minY)/height,normalZ:n[2]/Math.hypot(...n),bone:names[[...scores].sort((a,b)=>b[1]-a[1])[0][0]]});
}
for(const region of REGIONS)test(`${region}: real mesh has paintable faces on each side`,()=>{
 for(const side of ['left','right','both','unspecified']){
  const selected=points.filter(p=>matchesRegion(p,{region,side,surface:'unspecified'}));
  assert.ok(selected.length>5,`${region} ${side}: ${selected.length} faces`);
  if(side==='left')assert.ok(selected.every(p=>p.x>0));
  if(side==='right')assert.ok(selected.every(p=>p.x<0));
 }
});
test('posterior knee uses back-facing surfaces, distinct from front',()=>{
 const r={region:'knee',side:'left'};
 const back=points.filter(p=>matchesRegion(p,{...r,surface:'back'}));
 assert.ok(back.length>5);assert.ok(back.every(p=>p.normalZ<0));
 assert.ok(back.every(p=>!matchesRegion(p,{...r,surface:'front'})));
});
test('hand marking cannot spill onto torso or upper arm',()=>{
 const selected=points.filter(p=>matchesRegion(p,{region:'hand',side:'left'}));
 assert.ok(selected.every(p=>/^(hand|index|middle|pinky|ring|thumb)/.test(p.bone)));
});
