// Rest-space classification for the bundled MakeHuman mesh. Bone ownership
// separates arms/hands from torso, instead of guessing from vertical bands alone.
export const REGIONS = ['head','face','neck','chest','abdomen','upper_abdomen','lower_abdomen','back','upper_back','lower_back','shoulder','arm','upper_arm','forearm','elbow','wrist','hand','hip','leg','thigh','knee','calf','ankle','foot'];
export const regionLabel = region => region.replaceAll('_', ' ');
export function regionText(r) {
  const side = r.side === 'unspecified' ? '' : `${r.side} `;
  return `${side}${regionLabel(r.region)}${r.surface === 'back' && !r.region.includes('back') ? ' (back)' : ''}`;
}
export function matchesRegion(point, region) {
  const {x,y,bone,normalZ} = point;
  if (region.side === 'left' && x < .003 || region.side === 'right' && x > -.003) return false;
  const posterior = region.region.includes('back') || region.surface === 'back';
  // Keep enough side-facing triangles for small joints to remain visible.
  if (posterior ? normalZ > -.08 : normalZ < .08) return false;
  const torso = /^(spine|pelvis)/.test(bone);
  const hand = /^(hand|index|middle|pinky|ring|thumb)/.test(bone);
  const arm = /^(upperarm|lowerarm)/.test(bone);
  const leg = /^(thigh|calf)/.test(bone);
  switch (region.region) {
    case 'head': return bone === 'head';
    case 'face': return bone === 'head' && y > .88 && y < .97;
    case 'neck': return bone.startsWith('neck') && y < .89;
    case 'chest': return torso && y >= .69;
    case 'abdomen': return torso && y >= .53 && y < .69;
    case 'upper_abdomen': return torso && y >= .61 && y < .69;
    case 'lower_abdomen': return torso && y >= .53 && y < .61;
    case 'back': return torso && y >= .53;
    case 'upper_back': return torso && y >= .69;
    case 'lower_back': return torso && y >= .53 && y < .69;
    case 'shoulder': return bone.startsWith('clavicle') || bone.startsWith('upperarm') && y >= .77;
    case 'arm': return arm;
    case 'upper_arm': return bone.startsWith('upperarm');
    case 'forearm': return bone.startsWith('lowerarm');
    case 'elbow': return arm && y >= .67 && y <= .72;
    case 'wrist': return (bone.startsWith('lowerarm') || bone.startsWith('hand')) && Math.abs(x) >= .265 && Math.abs(x) <= .29;
    case 'hand': return hand;
    case 'hip': return (torso || bone.startsWith('thigh')) && y >= .47 && y < .58;
    case 'leg': return leg;
    case 'thigh': return bone.startsWith('thigh') && y >= .31;
    case 'knee': return leg && y >= .255 && y <= .32;
    case 'calf': return bone.startsWith('calf') && y >= .09 && y < .255;
    case 'ankle': return /^(calf|foot)/.test(bone) && y >= .035 && y <= .09;
    case 'foot': return /^(foot|ball)/.test(bone);
    default: return false;
  }
}

// Most specific first, so a painted knee is reported as "knee", not "leg".
const PAINT_ORDER = ['face','head','neck','upper_back','lower_back','shoulder','elbow','wrist','hand','upper_arm','forearm',
  'chest','upper_abdomen','lower_abdomen','knee','ankle','foot','calf','thigh','hip'];

const MIDLINE = ['face','head','neck','chest','upper_abdomen','lower_abdomen','upper_back','lower_back'];

// Turns the surface points of painted triangles into body locations.
// Small accidental strokes are ignored; both sides of one area become "both".
export function summarizePainted(points, {minFaces = 8, limit = 5} = {}) {
  const counts = new Map();
  for (const point of points) {
    if (Math.abs(point.normalZ) < .08) continue;
    const surface = point.normalZ < 0 ? 'back' : 'front';
    const region = PAINT_ORDER.find(name => matchesRegion(point, {region: name, side: 'unspecified', surface}));
    if (!region) continue;
    const side = point.x >= .003 ? 'left' : point.x <= -.003 ? 'right' : 'unspecified';
    const key = `${region}|${side}|${region.includes('back') ? 'unspecified' : surface}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const found = [...counts].filter(([, n]) => n >= minFaces).sort((a, b) => b[1] - a[1]).map(([key, n]) => {
    const [region, side, surface] = key.split('|');
    return {region, side, surface, n};
  });
  const merged = [];
  for (const item of found) {
    const twin = merged.find(m => m.region === item.region && m.surface === item.surface);
    if (!twin) { merged.push({...item}); continue; }
    if (twin.side !== item.side && twin.side !== 'unspecified' && item.side !== 'unspecified') {
      twin.side = MIDLINE.includes(item.region) ? 'unspecified' : 'both';
    }
  }
  return merged.slice(0, limit).map(({region, side, surface}) => ({region, side, surface}));
}
