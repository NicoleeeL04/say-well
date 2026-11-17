// Emergency warning signs. Works offline on the patient's own words and the
// English translation. It never diagnoses: a match only asks the person to get
// urgent help. Patterns cover English, Chinese and Spanish.
const any = (...patterns) => text => patterns.some(p => p.test(text));
const CHEST = any(/chest[^.]{0,20}(pain|pressure|tight|hurt|ache|squeez)/i, /(pain|pressure|tightness)[^.]{0,12}(in|on) (my )?chest/i, /胸(口|部)?[^，。,]{0,4}(痛|疼|闷|压|紧)/, /dolor (de|en el) pecho|opresi[oó]n en el pecho/i);
const BREATH = any(/short(ness)? of breath|(can'?t|cannot|can not) (catch my breath|breathe)|trouble breathing|hard to breathe|difficulty breathing|struggling to breathe/i, /喘不(过|上)气|呼吸困难|上不来气|透不过气/, /no puedo respirar|falta de aire|dificultad para respirar/i);
const ARM_JAW_SWEAT = any(/(arm|jaw|shoulder)[^.]{0,15}(numb|pain|hurt|tingl)/i, /cold sweat|sweating a lot/i, /(胳膊|手臂|下巴|肩膀)[^，。,]{0,6}(麻|疼|痛)/, /(出|冒)冷汗|大汗/, /sudor fr[ií]o|brazo (izquierdo )?(dormido|entumecido)/i);
const FEVER = any(/fever|high temperature/i, /发烧|发热|高烧/, /fiebre/i);
const STIFF_NECK = any(/stiff neck|neck (is )?stiff|(can'?t|cannot) bend my neck/i, /脖子[^，。,]{0,3}(僵|硬)|颈(部|子)?[^，。,]{0,3}(僵|硬)/, /cuello r[ií]gido/i);

export const RED_FLAGS = [
  {id:'self-harm', call:'988', title:'You don’t have to face this alone',
    message:'Call or text 988 (Suicide & Crisis Lifeline) to talk to someone now. If you might act on it, call 911.',
    test:any(/kill myself|suicid|end (my|it all)|want to die|don'?t want to (live|be alive)|hurt(ing)? myself|self[- ]harm/i, /不想活|想死|自杀|轻生|结束(我的)?生命|伤害自己|自残/, /quiero morir(me)?|suicid|matarme|hacerme da[nñ]o/i)},
  {id:'chest', call:'911', title:'This could be an emergency',
    message:'Chest pain with trouble breathing, arm or jaw pain, or sweating needs care now.',
    test:text => CHEST(text) && (BREATH(text) || ARM_JAW_SWEAT(text))},
  {id:'stroke', call:'911', title:'This could be a stroke',
    message:'Sudden weakness or numbness on one side, a drooping face or slurred speech needs care right away.',
    test:any(/face (is )?droop|drooping face|one side of (my )?(face|body)|slurred speech|(can'?t|cannot) (speak|talk) (properly|clearly)|sudden(ly)? (numb|weak)[^.]{0,20}(arm|leg|side)|(can'?t|cannot) (move|feel) (my )?(left|right) (arm|leg|side)/i,
      /半边(脸|身|身体)|一(侧|边)[^，。,]{0,6}(无力|麻|动不了)|口齿不清|说话不清|嘴(巴)?歪|突然[^，。,]{0,6}(手|脚|胳膊|腿)[^，。,]{0,4}(没力|无力|麻)/,
      /cara ca[ií]da|no puedo mover (el|mi) (brazo|lado)|habla arrastrada/i)},
  {id:'headache', call:'911', title:'This could be an emergency',
    message:'A sudden, extremely severe headache (the worst of your life) needs care right away.',
    test:any(/worst headache|thunderclap|sudden(ly)?,? (severe|extreme|explosive) headache/i, /(这辈子|有史以来|从来没有过)[^，。,]{0,6}(最|这么)[^，。,]{0,3}(严重|疼|痛)的?头(痛|疼)|突然[^，。,]{0,4}剧烈[^，。,]{0,2}头(痛|疼)/, /peor dolor de cabeza/i)},
  {id:'allergy', call:'911', title:'This could be a severe allergic reaction',
    message:'Swelling of the throat, tongue or lips, or trouble breathing after a food, sting or medicine needs care now.',
    test:any(/(throat|tongue|lips?)[^.]{0,10}(swell|swollen|closing|tight)/i, /(喉咙|嗓子|舌头|嘴唇)[^，。,]{0,4}(肿|发紧|堵)/, /(garganta|lengua|labios) (hinchad|cerr)/i)},
  {id:'breathing', call:'911', title:'This could be an emergency',
    message:'Severe trouble breathing or blue lips needs care now.',
    test:any(/(can'?t|cannot) breathe at all|struggling to breathe|lips (are |turning )?blue|gasping/i, /完全喘不(过|上)气|嘴唇(发紫|发青)|窒息/, /labios morados|me ahogo/i)},
  {id:'bleeding', call:'911', title:'This could be an emergency',
    message:'Heavy bleeding that won’t stop, or vomiting or coughing up blood, needs care now.',
    test:any(/bleeding (that )?(won'?t|will not|doesn'?t|does not) stop|heavy bleeding|(vomit|throw)(ing)? up blood|cough(ing)? up blood|blood in (my )?vomit/i, /血止不住|止不住[^，。,]{0,3}血|吐血|咳血|大出血/, /sangrado que no para|vomitar sangre|toser sangre/i)},
  {id:'collapse', call:'911', title:'This could be an emergency',
    message:'Fainting, a seizure or losing consciousness needs care now.',
    test:any(/passed out|fainted|blacked out|seizure|convuls|lost consciousness/i, /晕倒|昏倒|昏迷|抽搐|失去意识|不省人事/, /me desmay|convulsi|perd[ií] el conocimiento/i)},
  {id:'meningitis', call:'911', title:'This could be an emergency',
    message:'Fever with a stiff neck needs care right away.',
    test:text => FEVER(text) && STIFF_NECK(text)},
];

// Returns the most important matching warning, or null.
export function redFlag(...texts) {
  const text = texts.filter(Boolean).join('\n');
  return text.trim() ? RED_FLAGS.find(flag => flag.test(text)) || null : null;
}
