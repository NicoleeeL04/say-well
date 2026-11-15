// FDI quadrants: 1 upper right, 2 upper left, 3 lower left, 4 lower right.
// The displayed model contains positions 1–7, with no wisdom teeth.
const RANKS = {last:1, backmost:1, rearmost:1, second:2, '2nd':2,
  penultimate:2, third:3, '3rd':3, antepenultimate:3, fourth:4, '4th':4};

export function relativeToothPosition(text = '') {
  const source = text.toLowerCase().replace(/[‐‑‒–—]/g, '-');
  const matches = [];
  const patterns = [
    /\b(second|third|fourth|2nd|3rd|4th)[\s-]+from[\s-]+(?:the[\s-]+)?(?:back|end|last)[\s-]+(?:tooth|molar)\b/g,
    /\b(?:(second|third|fourth|2nd|3rd|4th)[\s-]+(?:to[\s-]+)?last|last[\s-]+but[\s-]+one|(last|backmost|rearmost|penultimate|antepenultimate))[\s-]+(?:(?:upper|lower|left|right|back|adult|permanent)[\s-]+)*(?:tooth|molar)\b/g,
    /\b(second|third|fourth|2nd|3rd|4th)[\s-]+(?:tooth|molar)[\s-]+from[\s-]+(?:the[\s-]+)?(?:back|end)\b/g,
    /\b(?:tooth|molar)[\s-]+(?:that[\s-]+is[\s-]+)?(second|third|fourth|2nd|3rd|4th)[\s-]+from[\s-]+(?:the[\s-]+)?(?:back|end)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const prefix = source.slice(Math.max(0, match.index - 24), match.index);
      const negated = /(?:\bnot|n't|rather than|instead of)\s+(?:the\s+)?$/.test(prefix);
      const rank = match[1] ? RANKS[match[1]] : match[2] ? RANKS[match[2]] : 2;
      matches.push({rank, negated, start:match.index, end:match.index+match[0].length});
    }
  }
  for (const match of source.matchAll(/倒数第([一二三四五六七八1-8])(?:颗|个)(?:牙齿|牙)?/g)) {
    matches.push({rank:Number(match[1]) || '一二三四五六七八'.indexOf(match[1])+1, start:match.index, end:match.index+match[0].length,
      negated:/(?:不是|并非)\s*$/.test(source.slice(Math.max(0, match.index-8),match.index))});
  }
  const distinct = matches.filter((a,index)=>!matches.some((b,other)=>
    other!==index && b.start<=a.start && b.end>=a.end &&
    (b.start<a.start || b.end>a.end || other<index)));
  const excludes = /\b(?:excluding|not counting|not including) (?:my |the |a )?wisdom (?:tooth|teeth)\b|\b(?:no|without|don't have|do not have) (?:any |a |my )?wisdom (?:tooth|teeth)\b|不(?:包括|含|算)智齿|没有智齿/.test(source);
  const includes = !excludes && /\b(?:including|counting) (?:my |the |a )?wisdom (?:tooth|teeth)\b|(?:包括|包含|算上)智齿/.test(source);
  return {rank:distinct.length === 1 && !distinct[0].negated ? distinct[0].rank : null,
    mentioned:distinct.length > 0, reference:excludes ? 'model' : includes ? 'wisdom' : null};
}

export function dentalSuggestions(dental, {text = '', countFrom = null} = {}) {
  const selected = new Map();
  const relative = relativeToothPosition(text);
  const reference = relative.reference || countFrom;
  let uncertain = false, unsupported = false, needsCount = false, needsManual = false;
  for (const location of dental.locations) {
    if (location.area === 'wisdom') { unsupported = true; continue; }
    if (location.tooth) {
      if (location.tooth % 10 === 8) { unsupported = true; continue; }
      selected.set(location.tooth, {tooth:location.tooth, includesGum:location.includesGum});
      continue;
    }
    // Preserve ordinal specificity. Never widen "second-to-last tooth" into
    // a whole posterior quadrant, or silently assume whether wisdom teeth count.
    if (relative.mentioned) {
      if (!relative.rank || dental.locations.length !== 1
          || !['upper','lower'].includes(location.jaw)
          || !['left','right'].includes(location.side)) {
        uncertain = true; needsManual = true; continue;
      }
      const provisional = !['model','wisdom'].includes(reference);
      if (provisional) { uncertain = true; needsCount = true; }
      // Preview one location using the displayed model's count. Keep it
      // explicitly uncertain until the user confirms or changes the reference.
      const position = (reference === 'wisdom' ? 8 : 7) - relative.rank + 1;
      if (position === 8) { unsupported = true; continue; }
      if (position < 1 || position > 7) { uncertain = true; needsManual = true; needsCount = false; continue; }
      const quadrant = location.jaw === 'upper'
        ? location.side === 'right' ? 1 : 2
        : location.side === 'left' ? 3 : 4;
      const tooth = quadrant * 10 + position;
      selected.set(tooth, {tooth, includesGum:location.includesGum});
      continue;
    }
    if (location.jaw === 'unspecified' && location.side === 'unspecified' && location.area === 'unspecified') { uncertain = true; continue; }
    uncertain = true;
    for (let quadrant = 1; quadrant <= 4; quadrant++) {
      const jaw = quadrant <= 2 ? 'upper' : 'lower';
      const side = [1,4].includes(quadrant) ? 'right' : 'left';
      if (location.jaw !== 'unspecified' && location.jaw !== jaw) continue;
      if (!['unspecified','both',side].includes(location.side)) continue;
      for (let position = 1; position <= 7; position++) {
        if (location.area === 'front' && position > 3 || location.area === 'back' && position < 4) continue;
        const tooth = quadrant * 10 + position;
        selected.set(tooth,{tooth,includesGum:location.includesGum || selected.get(tooth)?.includesGum || false});
      }
    }
  }
  return {selections:[...selected.values()], uncertain, unsupported, needsCount, needsManual};
}
