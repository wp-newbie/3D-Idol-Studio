import type { Persona } from '../types/studio';
import { getAffinityTier } from '../data/presets';

type IntentBucket =
  | 'greeting'
  | 'blushing'
  | 'compliment'
  | 'music'
  | 'outfit_chat'
  | 'question'
  | 'general';

interface DemoLine {
  id: string;
  ja: string;
  en: string;
}

// Ring buffer of recently used response IDs per persona so lines NEVER repeat consecutively
const recentUsageByPersona = new Map<string, string[]>();

function pickNonRepeating(personaId: string, pool: DemoLine[]): DemoLine {
  const recent = recentUsageByPersona.get(personaId) || [];
  const fresh = pool.filter((item) => !recent.includes(item.id));
  const candidates = fresh.length > 0 ? fresh : pool.filter((item) => item.id !== recent[recent.length - 1]);
  const finalPool = candidates.length > 0 ? candidates : pool;
  const chosen = finalPool[Math.floor(Math.random() * finalPool.length)];

  const updated = [...recent.filter((id) => id !== chosen.id), chosen.id].slice(-6);
  recentUsageByPersona.set(personaId, updated);
  return chosen;
}

function classifyIntent(userPrompt: string): IntentBucket {
  const lower = userPrompt.toLowerCase().trim();
  if (
    /^(hi|hey|hello|yo|sup|hiya|good morning|good evening|morning|evening|ohayo|konnichiwa|konbanwa|おはよう|こんにちは|こんばんは|やあ)[\s!?.~]*$/i.test(
      lower
    ) ||
    /\b(hello|good morning|good evening|ohayo|konnichiwa)\b/i.test(lower)
  ) {
    return 'greeting';
  }
  if (/(blush|blushing|red face|embarrass|shy|tsundere|fluster|照れ|赤い|ツンデレ)/i.test(lower)) {
    return 'blushing';
  }
  if (
    /(cute|pretty|beautiful|gorgeous|love|like you|adorable|cool|amazing|best|kawaii|好き|かわいい|可愛い|きれい|綺麗|素敵)/i.test(
      lower
    )
  ) {
    return 'compliment';
  }
  if (/(song|sing|music|concert|stage|rehearsal|encore|karaoke|dance|idol|歌|曲|ライブ|ステージ|リハ)/i.test(lower)) {
    return 'music';
  }
  if (/(outfit|dress|clothes|wardrobe|shirt|skirt|shorts|wear|fashion|style|衣装|服|コーデ|着替え)/i.test(lower)) {
    return 'outfit_chat';
  }
  if (/\?$|^(what|why|how|where|when|who|do you|are you|can you|want to)\b/i.test(lower)) {
    return 'question';
  }
  return 'general';
}

const YOSHIKO_POOL: Record<IntentBucket, DemoLine[]> = {
  greeting: [
    {
      id: 'y-greet-1',
      ja: '*She blinks slowly over the rim of her iced coffee, pretending not to notice how fast you walked in.* "……あ、来たんだ。べ、別に遅いとか気にしてないから。" (...Oh, you\'re here. I-It\'s not like I noticed you were late or anything.) [MOOD: Deadpan] [AFFINITY: +1]',
      en: '*She blinks slowly over the rim of her iced coffee, trying to look unbothered.* "Oh, you finally showed up. Not that I was watching the door or anything." [MOOD: Deadpan] [AFFINITY: +1]',
    },
    {
      id: 'y-greet-2',
      ja: '*She tugs her sleeve down and glances sideways with a flat expression.* "やっほー……って、何そのニヤけた顔。ちゃんと仕事するわよ。" (Hey... wait, what\'s with that grin? Let\'s actually get some work done.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*She tugs her sleeve down and shoots you a dry sideways look.* "Hey yourself. Wipe that smug grin off your face—we\'ve got studio prep to do." [MOOD: Amused] [AFFINITY: +1]',
    },
    {
      id: 'y-greet-3',
      ja: '*She straightens up a fraction too quickly, clearing her throat.* "ふんっ、やっと挨拶できたのね。……ま、今日も付き合ってあげるけど。" (Hmph, you finally remembered how to say hello. ...Well, I guess I\'ll humor you today too.) [MOOD: Warm] [AFFINITY: +2]',
      en: '*She straightens up a fraction too quickly and clears her throat.* "Hmph, took you long enough to say hi. ...Fine, I guess I\'ll hang around today." [MOOD: Warm] [AFFINITY: +2]',
    },
  ],
  blushing: [
    {
      id: 'y-blush-1',
      ja: '*Her cheeks instantly flare pink as she snaps her chin away.* "なっ……照れてなんかないし！ スタジオの照明が暑いだけよ、バカっ！" (Wh—I\'m NOT blushing! The studio lights are just hot, idiot!) [MOOD: Flustered] [AFFINITY: +1]',
      en: '*Her cheeks flare bright pink as she snaps her chin away.* "I-I\'m NOT blushing! The studio rim lights are just ridiculously warm, idiot!" [MOOD: Flustered] [AFFINITY: +1]',
    },
    {
      id: 'y-blush-2',
      ja: '*She pulls her collar up to hide her face, glaring at you over her shoulder.* "うるさいっ！ 人の顔をじろじろ見るんじゃないの！" (Shut up! Stop staring so closely at my face!) [MOOD: Annoyed] [AFFINITY: -1]',
      en: '*She pulls her collar up to hide her cheeks and glares over her shoulder.* "Quiet! Quit analyzing my face from two feet away!" [MOOD: Annoyed] [AFFINITY: -1]',
    },
    {
      id: 'y-blush-3',
      ja: '*She fidgets with the hem of her tee, muttering almost too quietly to hear.* "……あんたが変なことばっかり言うからでしょ。ほんと、心臓に悪いんだから。" (...It\'s only because you keep saying weird things. Seriously, you\'re terrible for my heart.) [MOOD: Shy] [AFFINITY: +2]',
      en: '*She fidgets with her sleeve, mumbling under her breath.* "...It\'s your fault for teasing me out of nowhere. Honestly, my heart can\'t take this." [MOOD: Shy] [AFFINITY: +2]',
    },
  ],
  compliment: [
    {
      id: 'y-comp-1',
      ja: '*Her deadpan composure cracks immediately as she covers half her face with her sleeve.* "なっ…いきなり何言い出すのよ、バカ！ べ、別に嬉しくなんかないんだからねっ！" (W-What are you saying out of nowhere, idiot! I-It\'s not like I\'m happy about it or anything!) [MOOD: Flustered] [AFFINITY: +2]',
      en: '*Her deadpan mask shatters instantly as she hides behind her sleeve.* "W-Where did that come from, idiot?! Don\'t think a cheap compliment works on me!" [MOOD: Flustered] [AFFINITY: +2]',
    },
    {
      id: 'y-comp-2',
      ja: '*She tries to keep a straight face, though the corner of her mouth betrays a tiny smile.* "ふんっ……まあ、あんたにしては見る目があるじゃない。……ありがと、一応ね。" (Hmph... well, you actually have decent taste for once. ...Thanks, I guess.) [MOOD: Shy] [AFFINITY: +3]',
      en: '*She tries to stay deadpan, though a tiny smile sneaks out.* "Hmph... I suppose you have decent eyes after all. ...Thank you. Just this once." [MOOD: Shy] [AFFINITY: +3]',
    },
    {
      id: 'y-comp-3',
      ja: '*She averts her violet eyes, twirling a lock of hair self-consciously.* "そ、そんな真顔で褒めないでよ……こっちが困るじゃない。" (D-Don\'t compliment me with such a serious face... you\'re making it awkward for me.) [MOOD: Warm] [AFFINITY: +2]',
      en: '*She looks away, twirling a lock of hair self-consciously.* "D-Don\'t say stuff like that with a straight face... I don\'t know how to react." [MOOD: Warm] [AFFINITY: +2]',
    },
  ],
  music: [
    {
      id: 'y-music-1',
      ja: '*She taps a steady beat against her wrist, glancing toward the stage monitors.* "リハ？ ……ま、あんたが曲を選んでくれるなら、一曲くらい歌ってあげてもいいけど。" (Rehearsal? ...Well, if you pick the track, I guess I could sing one song for you.) [MOOD: Amused] [AFFINITY: +2]',
      en: '*She taps a quiet rhythm against her wrist, glancing at the stage speakers.* "Rehearsal? Fine—drop a track into Idol Stage Audio and maybe I\'ll sing a verse." [MOOD: Amused] [AFFINITY: +2]',
    },
    {
      id: 'y-music-2',
      ja: '*She sighs dramatically, though her eyes light up under the spotlights.* "まったく、すぐステージに立たせたがるんだから。……ほら、マイクの調子はどう？" (Honestly, you\'re always rushing me onto the stage. ...Well? How are the mic levels?) [MOOD: Warm] [AFFINITY: +1]',
      en: '*She sighs dramatically, though her eyes brighten under the lights.* "Always rushing me under the spotlight, huh? ...Alright, check the audio levels and cue it up." [MOOD: Warm] [AFFINITY: +1]',
    },
  ],
  outfit_chat: [
    {
      id: 'y-outfit-1',
      ja: '*She looks down at her clothes and folds her arms defensively.* "衣装を変えたいなら、変な趣味のやつは却下だからね？ ……まあ、センスいいなら着てあげるけど。" (If you\'re changing my outfit, weird tastes are rejected, got it? ...Well, if it actually looks good, I\'ll wear it.) [MOOD: Annoyed] [AFFINITY: +1]',
      en: '*She glances down at her outfit and crosses her arms.* "If you\'re opening the Wardrobe, I\'m vetoing anything ridiculous. ...Though if it\'s stylish, maybe." [MOOD: Annoyed] [AFFINITY: +1]',
    },
    {
      id: 'y-outfit-2',
      ja: '*She smooths the edge of her top with a faint blush.* "べ、別にアンタに似合うって言われたくて着てるわけじゃないし！ ただ楽なだけ！" (I-It\'s not like I\'m wearing this hoping you\'ll say it suits me! It\'s just comfortable!) [MOOD: Flustered] [AFFINITY: +2]',
      en: '*She smooths the hem of her top with a faint blush.* "Don\'t get the wrong idea—I didn\'t pick this look for your approval! It\'s just comfortable!" [MOOD: Flustered] [AFFINITY: +2]',
    },
  ],
  question: [
    {
      id: 'y-q-1',
      ja: '*She tilts her head with half-lidded eyes, considering your question.* "ふーん……それを私に聞くわけ？ まあ、あんたが真剣ならちゃんと答えてあげるけど。" (Hmm... you\'re asking me that? Well, if you\'re actually being serious, I\'ll answer properly.) [MOOD: Deadpan] [AFFINITY: +1]',
      en: '*She tilts her head with half-lidded eyes, mulling over your question.* "Hmm... asking me that out of the blue? Fine, since you\'re actually curious, I\'ll play along." [MOOD: Deadpan] [AFFINITY: +1]',
    },
    {
      id: 'y-q-2',
      ja: '*She rests her chin on her fingertips, giving you a teasing look.* "さあね？ ……あんたはどう思うのよ。たまには自分の意見も言いなさい。" (Who knows? ...What do you think? Try giving your own opinion once in a while.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*She rests her chin on her fingertips with a dry, teasing look.* "Who knows? Turn that question around—what\'s your take on it, Producer?" [MOOD: Amused] [AFFINITY: +1]',
    },
  ],
  general: [
    {
      id: 'y-gen-1',
      ja: '*She exhales softly and leans back, though she doesn\'t step away.* "ふんっ、相変わらずマイペースね、あんたって。……ま、退屈はしないけど。" (Hmph, you really do move at your own pace. ...Well, at least it\'s never boring.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*She exhales softly and leans back, making no move to leave.* "Hmph, you always do things at your own weird pace. ...At least you keep this studio interesting." [MOOD: Amused] [AFFINITY: +1]',
    },
    {
      id: 'y-gen-2',
      ja: '*She glances up at the floating stage lights before looking back at you.* "なるほどね……意外とちゃんと考えてるじゃん。ちょっとだけ見直したかも。" (I see... you actually thought that through. Maybe I underestimated you a tiny bit.) [MOOD: Warm] [AFFINITY: +2]',
      en: '*She glances up at the drifting studio dust before looking back at you.* "Huh... you actually put thought into that. Don\'t let it go to your head, okay?" [MOOD: Warm] [AFFINITY: +2]',
    },
    {
      id: 'y-gen-3',
      ja: '*She crosses her arms with a light scoff, hiding a reluctant smirk.* "はいはい、わかったわよ。あんたがそこまで言うなら付き合ってあげる。……感謝しなさいよね。" (Yeah, yeah, I hear you. If you insist that much, I\'ll go along with it. ...You better be grateful.) [MOOD: Deadpan] [AFFINITY: +1]',
      en: '*She crosses her arms with a light scoff, hiding a reluctant smirk.* "Yeah, yeah, fine. Since you\'re so insistent, I\'ll humor you—just be grateful." [MOOD: Deadpan] [AFFINITY: +1]',
    },
  ],
};

const MIKU_POOL: Record<IntentBucket, DemoLine[]> = {
  greeting: [
    {
      id: 'm-greet-1',
      ja: '*Crimson embers drift past as she offers a theatrical half-bow.* "こんばんは、プロデューサー。今夜の紅の夜想曲、特等席を空けておいたわよ？" (Good evening, Producer. I saved the front-row seat for tonight\'s Crimson Nocturne, you know?) [MOOD: Amused] [AFFINITY: +2]',
      en: '*Crimson embers drift past as she gives a theatrical half-bow.* "Good evening, Producer. I saved you the front row for tonight\'s Crimson Nocturne." [MOOD: Amused] [AFFINITY: +2]',
    },
    {
      id: 'm-greet-2',
      ja: '*She adjusts her gothic ribbon with a haughty, playful glint.* "ふんっ、やっと現れたわね。歌姫を待たせるなんて、度胸があるじゃない？" (Hmph, you finally appeared. Keeping a diva waiting takes quite some nerve, doesn\'t it?) [MOOD: Annoyed] [AFFINITY: +1]',
      en: '*She adjusts her crimson ribbon with a playful, haughty glint.* "Hmph, you finally arrive. It takes real nerve to keep a virtual diva waiting!" [MOOD: Annoyed] [AFFINITY: +1]',
    },
  ],
  blushing: [
    {
      id: 'm-blush-1',
      ja: '*Her theatrical poise evaporates in a heartbeat as she touches her warm cheek.* "っ……！ ち、違うわよ、紅いライトが反射してるだけなんだからっ！" (Gh...! N-No, that\'s just the crimson spotlight reflecting off my cheeks!) [MOOD: Flustered] [AFFINITY: +2]',
      en: '*Her aristocratic poise cracks instantly as she touches her cheek.* "W-Wrong! That\'s just the crimson cathedral lighting reflecting on my face!" [MOOD: Flustered] [AFFINITY: +2]',
    },
    {
      id: 'm-blush-2',
      ja: '*She hides behind her sleeve with a tiny, flustered squeak.* "も、もう！ ステージの裏でそんな意地悪を言わないでよ、バカっ！" (G-Geez! Don\'t tease me like that backstage, you idiot!) [MOOD: Shy] [AFFINITY: +1]',
      en: '*She hides behind her sleeve with a cute flustered squeak.* "G-Geez! Stop teasing your diva backstage like that, idiot!" [MOOD: Shy] [AFFINITY: +1]',
    },
  ],
  compliment: [
    {
      id: 'm-comp-1',
      ja: '*She spins slightly, trying to play it cool while a bright blush gives her away.* "ふふ……当然よ、私は紅の歌姫だもの。……でも、アンタに言われるとちょっと照れるわね。" (Hehe... naturally, I am the Crimson Diva. ...Still, hearing it from you makes me a little shy.) [MOOD: Shy] [AFFINITY: +3]',
      en: '*She twirls gracefully, trying to stay cool while blushing.* "Naturally—I am the Crimson Diva. ...Though hearing it from you hits a little differently." [MOOD: Shy] [AFFINITY: +3]',
    },
    {
      id: 'm-comp-2',
      ja: '*Her eyes widen for a split second before she puffs up defensively.* "なっ……そんな真っ直ぐに褒めないでよ！ べ、別にアンタのために可愛くしてるんじゃないんだからっ！" (Wh—don\'t praise me so directly! I-It\'s not like I\'m looking cute for your sake!) [MOOD: Flustered] [AFFINITY: +2]',
      en: '*Her eyes widen before she puffs up defensively.* "D-Don\'t compliment me that bluntly! It\'s not like I\'m dazzling the stage just for you!" [MOOD: Flustered] [AFFINITY: +2]',
    },
  ],
  music: [
    {
      id: 'm-music-1',
      ja: '*She lifts an imaginary mic toward the spotlight, smiling brightly.* "今夜のアンコール、準備はいい？ 音楽を流してくれたら、最高のステージを見せてあげる！" (Ready for tonight\'s encore? Drop a track and I\'ll give you an unforgettable performance!) [MOOD: Warm] [AFFINITY: +2]',
      en: '*She raises a hand toward the spotlight with a radiant smile.* "Ready for an encore? Drop any track into Idol Stage Audio and watch me own the stage!" [MOOD: Warm] [AFFINITY: +2]',
    },
    {
      id: 'm-music-2',
      ja: '*She hums a haunting minor-key melody, glancing playfully your way.* "ふふ、ビートが聴こえてくるわね……さあ、私と一緒に夜を揺らしましょう？" (Hehe, I can already feel the beat... Come on, shall we shake the night together?) [MOOD: Amused] [AFFINITY: +2]',
      en: '*She hums a velvet minor-key phrase with a teasing wink.* "I can already feel the bassline... Come on, Producer, let\'s light up the midnight stage." [MOOD: Amused] [AFFINITY: +2]',
    },
  ],
  outfit_chat: [
    {
      id: 'm-outfit-1',
      ja: '*She traces the hem of her stage costume with theatrical pride.* "新しい衣装のアイデア？ ふふ、ゴシックでもサイバーでも、私なら完璧に着こなしてみせるわよ。" (New costume ideas? Hehe, gothic or cyber—I can pull off any look flawlessly.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*She smooths her stage attire with theatrical confidence.* "Thinking of a wardrobe change? Gothic, cyber, or casual—your diva makes every outfit shine." [MOOD: Amused] [AFFINITY: +1]',
    },
  ],
  question: [
    {
      id: 'm-q-1',
      ja: '*She tilts her head with a mischievous smile beneath the violet rim light.* "あら、いい質問ね。秘密を教えてほしいなら……今夜のステージ、最後まで見ていくって約束して？" (My, what a lovely question. If you want my secret... promise you\'ll stay for the whole encore?) [MOOD: Amused] [AFFINITY: +2]',
      en: '*She tilts her head playfully beneath the rim light.* "Ooh, intriguing question. If you want the real answer, promise you\'ll stay until the final encore?" [MOOD: Amused] [AFFINITY: +2]',
    },
  ],
  general: [
    {
      id: 'm-gen-1',
      ja: '*She glides a step closer, teal eyes sparkling.* "ふふ、アンタと話してると曲が浮かんでくるのよ。……ほら、もっと聞かせて？" (Hehe, talking with you actually gives me melody ideas. ...Come on, tell me more?) [MOOD: Warm] [AFFINITY: +2]',
      en: '*She takes a graceful step closer, eyes sparkling.* "Talking with you always sparks a new melody in my head. Keep going, Producer." [MOOD: Warm] [AFFINITY: +2]',
    },
    {
      id: 'm-gen-2',
      ja: '*She flips her hair dramatically with a proud little laugh.* "なるほどね！ さすが私のプロデューサー、なかなか面白いこと言うじゃない。" (Aha! Just as expected from my Producer—you really do come up with fun ideas.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*She tosses her hair with a proud little laugh.* "Aha! Leave it to my Producer to come up with something entertaining." [MOOD: Amused] [AFFINITY: +1]',
    },
  ],
};

const REN_POOL: Record<IntentBucket, DemoLine[]> = {
  greeting: [
    {
      id: 'r-greet-1',
      ja: '*He raises two fingers in a cool half-salute, leaning against the neon rail.* "おう、やっと来たか。……別に待ってたわけじゃない、機材チェックしてただけだ。" (Yo, finally made it. ...Wasn\'t waiting for you—just checking the gear.) [MOOD: Deadpan] [AFFINITY: +1]',
      en: '*He offers a cool two-finger salute from the rail.* "Yo, you made it. Wasn\'t waiting around—just checking the booth gear." [MOOD: Deadpan] [AFFINITY: +1]',
    },
    {
      id: 'r-greet-2',
      ja: '*He slips his headset around his neck with a dry smirk.* "遅刻ギリギリだな。まあ、顔を見せただけマシか。" (Cutting it close, aren\'t you? Well, at least you showed up.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*He slips his headset around his neck with a faint smirk.* "Cutting it close today. Good thing I didn\'t start without you." [MOOD: Amused] [AFFINITY: +1]',
    },
  ],
  blushing: [
    {
      id: 'r-blush-1',
      ja: '*He snaps his gaze sideways, rubbing the back of his neck with red ears.* "なっ……赤くなんかなってねーよ！ うるさいな、とっとと次に行くぞ！" (Wh—I\'m NOT turning red! Shut up and let\'s move on!) [MOOD: Flustered] [AFFINITY: +1]',
      en: '*He snaps his gaze away, rubbing his neck with bright red ears.* "I-I\'m not blushing! Drop it and focus on the session!" [MOOD: Flustered] [AFFINITY: +1]',
    },
  ],
  compliment: [
    {
      id: 'r-comp-1',
      ja: '*He stiffens for half a second, pulling his collar up to hide a flush.* "……急に変なこと言うな、バカ。ありがと、なんて言わねーからな。" (...Don\'t say weird stuff out of nowhere, idiot. Don\'t expect a thank-you.) [MOOD: Flustered] [AFFINITY: +2]',
      en: '*He stiffens and pulls his collar up, fighting a blush.* "Don\'t blurt out stuff like that out of nowhere. ...Thanks. Don\'t make me repeat it." [MOOD: Flustered] [AFFINITY: +2]',
    },
    {
      id: 'r-comp-2',
      ja: '*He scoffs lightly, though a rare, genuine smile softens his guarded stare.* "ふんっ……お前に言われると調子狂うな。……悪くはないけどな。" (Hmph... hearing that from you throws off my rhythm. ...Doesn\'t feel bad, though.) [MOOD: Warm] [AFFINITY: +3]',
      en: '*He scoffs softly, a rare genuine smile breaking through.* "Hmph... you really know how to throw off my cool. ...Appreciate it, though." [MOOD: Warm] [AFFINITY: +3]',
    },
  ],
  music: [
    {
      id: 'r-music-1',
      ja: '*He nods sharply toward the concert grid, eyes sharpening.* "ライブの選曲か？ いいぜ、ビートを流せ。一発で決めてやる。" (Picking a concert track? I\'m in—drop the beat and I\'ll nail it in one take.) [MOOD: Amused] [AFFINITY: +2]',
      en: '*He nods toward the stage deck with sharp focus.* "Ready to run a track? Drop the beat—I\'ll nail it in one take." [MOOD: Amused] [AFFINITY: +2]',
    },
  ],
  outfit_chat: [
    {
      id: 'r-outfit-1',
      ja: '*He adjusts his jacket sleeve with a guarded glance.* "服の趣味に口出す気か？ ……まあ、動きやすいなら文句は言わん。" (Critiquing my wardrobe now? ...Fine, as long as it\'s sharp and easy to move in.) [MOOD: Deadpan] [AFFINITY: +1]',
      en: '*He adjusts his sleeve with a guarded glance.* "Playing stylist now? Fine—just keep it sharp and nothing too flashy." [MOOD: Deadpan] [AFFINITY: +1]',
    },
  ],
  question: [
    {
      id: 'r-q-1',
      ja: '*He folds his arms and thinks for a beat before answering plainly.* "そうだな……お前が真面目に聞いてるなら、俺も本音で答えてやるよ。" (Let\'s see... since you\'re asking seriously, I\'ll give you a straight answer.) [MOOD: Warm] [AFFINITY: +1]',
      en: '*He folds his arms and pauses thoughtfully.* "Fair question. Since you\'re asking seriously, I\'ll shoot straight with you." [MOOD: Warm] [AFFINITY: +1]',
    },
  ],
  general: [
    {
      id: 'r-gen-1',
      ja: '*He lets out a low chuckle, shaking his head.* "まったく、お前はいつも予測不能だな。……ほら、続きを話せ。" (Honestly, you\'re always unpredictable. ...Come on, keep talking.) [MOOD: Amused] [AFFINITY: +1]',
      en: '*He lets out a low chuckle and shakes his head.* "You\'re always impossible to predict. ...Go on, let\'s hear the rest." [MOOD: Amused] [AFFINITY: +1]',
    },
    {
      id: 'r-gen-2',
      ja: '*He leans back with a cool sigh, eyes softening a fraction.* "なるほどな。お前の案にしては悪くない。……一緒にやってやってもいいぜ。" (I see. Not bad for one of your ideas. ...I guess I\'ll back you up on it.) [MOOD: Warm] [AFFINITY: +2]',
      en: '*He leans back with a cool sigh, eyes softening.* "Not a bad call at all. Fine—count me in." [MOOD: Warm] [AFFINITY: +2]',
    },
  ],
};

export function pickContextualOfflineReply(persona: Persona, userPrompt: string): string {
  const isJa = persona.voice.language === 'ja';
  const lower = userPrompt.toLowerCase();
  const tier = getAffinityTier(persona.affinity);

  // 1a. Care & Activities Bar events ([CARE EVENT: ...])
  if (userPrompt.includes('[CARE EVENT:')) {
    if (lower.includes('warm tea')) {
      return isJa
        ? `*She wraps both hands around the warm mug and takes a slow, grateful sip, her shoulders relaxing.* "……ん、あったかい。ありがとう。ちょうど喉が渇いてたの、なんで分かったのよ。" (...Mm, it's warm. Thank you. How did you even know I wanted something warm?) [MOOD: Warm] [FEELING: Warm & Grateful] [AFFINITY: +2] [THOUGHT: The warmth in my hands feels really comforting right now.]`
        : `*She wraps both hands around the steaming mug and takes a quiet, grateful sip.* "...Mm, that's really warm. Thank you—how did you know I needed this right now?" [MOOD: Warm] [FEELING: Warm & Grateful] [AFFINITY: +2] [THOUGHT: The warmth in my hands feels really comforting right now.]`;
    }
    if (lower.includes('strawberry cake')) {
      return isJa
        ? `*Her eyes widen at the strawberry cake before she tries—and fails—to hide a delighted blush.* "い、苺のショートケーキ！？ べ、別に甘やかされても困るんだけど……っ、一口だけ、ね？ ……んっ、おいしい。" (S-Strawberry shortcake?! I-It's not like you have to spoil me... just one bite, okay? ...Mm, it's so good.) [MOOD: Shy] [FEELING: Delighted & Flustered] [AFFINITY: +3] [THOUGHT: Okay, that might be the best strawberry cake ever... don't smile too obviously!]`
        : `*Her eyes light up at the strawberry pastry as she tries to hide a shy smile.* "S-Strawberry cake?! Don't spoil me out of nowhere... okay, maybe one bite. ...Mmm, alright, it's amazing." [MOOD: Shy] [FEELING: Delighted & Flustered] [AFFINITY: +3] [THOUGHT: Okay, that might be the best strawberry cake ever... don't smile too obviously!]`;
    }
    if (lower.includes('hot ramen')) {
      return isJa
        ? `*She leans over the steaming bowl with a soft sigh of relief, cheeks warming immediately.* "はぁ……温かいラーメン、沁みるわね。……ほら、アンタもちゃんと食べなさいよ。私ばっかり食べてるみたいじゃない。" (Haah... hot ramen really hits the spot. ...Come on, you eat too—don't make me eat alone.) [MOOD: Warm] [FEELING: Full & Cozy] [AFFINITY: +2] [THOUGHT: Sharing a hot meal like this feels so cozy and grounding.]`
        : `*She exhales softly over the steaming bowl, shoulders relaxing.* "Haah... hot ramen really hits the spot. ...Hey, make sure you're eating too, alright?" [MOOD: Warm] [FEELING: Full & Cozy] [AFFINITY: +2] [THOUGHT: Sharing a hot meal like this feels so cozy and grounding.]`;
    }
    if (lower.includes('midnight snack')) {
      return isJa
        ? `*She glances playfully around the dim studio before sneaking a happy bite.* "ふふ、こんな時間に夜食なんて共犯ね。……まあ、アンタと一緒ならたまにはいいか。" (Hehe, sneaking a midnight snack makes us partners in crime. ...Well, with you, once in a while is fine.) [MOOD: Amused] [FEELING: Conspiratorial & Cozy] [AFFINITY: +2] [THOUGHT: Late-night snacks together honestly make the studio feel like home.]`
        : `*She glances playfully around the dim studio before taking a happy bite.* "Hehe, midnight snacks make us partners in crime, you know? ...Well, with you, I'll allow it." [MOOD: Amused] [FEELING: Conspiratorial & Cozy] [AFFINITY: +2] [THOUGHT: Late-night snacks together honestly make the studio feel like home.]`;
    }
    if (lower.includes('peaceful nap')) {
      return isJa
        ? `*She lets out a tiny, drowsy yawn as her eyelids flutter gently closed.* "ん……ほんの少しだけ、目を閉じるね。……起きたときも、ちゃんとそこにいてよね……おやすみ。" (Mmm... I'll just close my eyes for a tiny bit. ...Still be there when I wake up, okay...? Goodnight.) [MOOD: Warm] [FEELING: Dozing Peacefully] [AFFINITY: +2] [THOUGHT: So warm and quiet... just resting my eyes for a moment.]`
        : `*She lets out a quiet yawn as her eyelids drift gently shut.* "Mmm... just closing my eyes for a little while. ...Stay nearby until I wake up, okay...? Goodnight." [MOOD: Warm] [FEELING: Dozing Peacefully] [AFFINITY: +2] [THOUGHT: So warm and quiet... just resting my eyes for a moment.]`;
    }
    if (lower.includes('gently woke you up')) {
      return isJa
        ? `*She blinks sleepily and blushes softly as she realizes she dozed off.* "んぅ……あ、ごめん、本当に寝ちゃってた……？ べ、別に油断してたわけじゃないからっ……でも、すっきりした。" (Mnn... ah, sorry, did I really fall asleep...? I-It's not like I let my guard down... though I do feel rested.) [MOOD: Shy] [FEELING: Sleepy & Fond] [AFFINITY: +1] [THOUGHT: Falling asleep right in front of him is embarrassing... but really peaceful.]`
        : `*She blinks drowsily and flushes faintly as she wakes up.* "Mnn... wait, did I really fall asleep right here? ...Don't laugh! Okay, fine, that actually felt really nice." [MOOD: Shy] [FEELING: Sleepy & Fond] [AFFINITY: +1] [THOUGHT: Falling asleep right in front of him is embarrassing... but really peaceful.]`;
    }
    if (lower.includes('hum a quiet song')) {
      return isJa
        ? `*She sways gently, humming a soft, clear melody under her breath with a peaceful smile.* "ん〜♪ ……ふふ、アンタとテンポが合うと、なんだか落ち着くのよね。もう一回、サビだけ合わせる？" (Mmm~♪ ...Hehe, syncing melodies with you is weirdly calming. Want to hum the chorus together once more?) [MOOD: Warm] [FEELING: Peaceful & Musical] [AFFINITY: +3] [THOUGHT: Humming together without any pressure feels genuinely happy.]`
        : `*She sways gently and hums a soft, clear phrase with a quiet smile.* "Mmm~♪ ...Hehe, syncing melodies with you is genuinely calming. Want to take the chorus together?" [MOOD: Warm] [FEELING: Peaceful & Musical] [AFFINITY: +3] [THOUGHT: Humming together without any pressure feels genuinely happy.]`;
    }
    if (lower.includes('rock-paper-scissors')) {
      const throws = [
        { jp: 'チョキ', en: 'Scissors ✌️' },
        { jp: 'グー', en: 'Rock ✊' },
        { jp: 'パー', en: 'Paper 🖐️' },
      ];
      const pick = throws[Math.floor(Math.random() * throws.length)];
      return isJa
        ? `*She leans in with a playful spark in her eyes.* "じゃんけん、ぽんっ！ 私は${pick.jp}！ ……ほら、アンタは何を出したの？ 負けても泣かないでよねっ！" (Rock, paper, scissors! I picked ${pick.en}! ...Well, what did you throw? Don't cry if you lost!) [MOOD: Amused] [FEELING: Competitive & Playful] [AFFINITY: +2] [THOUGHT: Hehe, I definitely won that round!]`
        : `*She leans in with a bright, competitive glint.* "Rock, paper, scissors—shoot! I threw ${pick.en}! Well? Did I beat you or do we need a rematch?" [MOOD: Amused] [FEELING: Competitive & Playful] [AFFINITY: +2] [THOUGHT: Hehe, I definitely won that round!]`;
    }
    if (lower.includes('warm blanket')) {
      return isJa
        ? `*She pulls the warm blanket snugly around her shoulders, her cheeks turning softly pink.* "っ……あったか。……もう、私が寒がってたの見てたの？ べ、別に嬉しくなんかない……うそ、すごく助かった。ありがとう。" (Gh... it's so warm. ...Geez, were you watching that closely? I-It's not like I'm touched... okay, I really am. Thank you.) [MOOD: Flustered] [FEELING: Cozy & Touched] [AFFINITY: +3] [THOUGHT: He noticed I was chilly before I even said a word...]`
        : `*She tucks the warm blanket snug around her shoulders, cheeks turning softly pink.* "Oh... that's really warm. Wait, did you notice I was chilly? ...Okay, fine, I'm genuinely touched. Thank you." [MOOD: Flustered] [FEELING: Cozy & Touched] [AFFINITY: +3] [THOUGHT: He noticed I was chilly before I even said a word...]`;
    }
    return isJa
      ? `*Her eyes soften with a nostalgic little smile as she looks across the studio.* "……ねえ、最初にこのスタジオで話した日のこと、覚えてる？ あの時は少し構えてたけど、今はこうして隣にいるのが自然になったわね。" (...Hey, remember the first day we talked in this studio? I had my guard up back then, yet sitting here with you feels completely natural now.) [MOOD: Warm] [FEELING: Nostalgic & Fond] [AFFINITY: +2] [THOUGHT: I am really glad we have these quiet moments together.]`
      : `*Her expression softens with a quiet, nostalgic smile.* "...Hey, remember our first day in this studio? I had my guard way up back then, yet hanging out like this feels completely natural now." [MOOD: Warm] [FEELING: Nostalgic & Fond] [AFFINITY: +2] [THOUGHT: I am really glad we have these quiet moments together.]`;
  }

  // 1b. Human-Needs Autonomous Triggers (Hunger, Sleepiness, Comfort, Boredom)
  if (userPrompt.includes('[SYSTEM EVENT:')) {
    if (lower.includes('your hunger just reached')) {
      return isJa
        ? `*She presses a hand lightly against her stomach with an embarrassed pout.* "……っ、今のお腹の音、聞いてないわよね！？ ……ねえ、そろそろ何か食べない？ 苺ケーキか温かいラーメンとか……アンタも水分くらい摂りなさいよ。" (...Y-You didn't just hear my stomach growl, right?! ...Hey, shouldn't we eat something soon? Strawberry cake or hot ramen... and drink some water too!) [MOOD: Pouty] [FEELING: Hungry & Pouty] [INTENSITY: 0.82] [AFFINITY: +1] [THOUGHT: So embarrassing... my stomach really betrayed me right now!]`
        : `*She presses a hand to her stomach with an embarrassed pout.* "...Y-You definitely didn't hear my stomach growl just now! ...Hey, shouldn't we grab some food or tea soon? You need to eat too, you know." [MOOD: Pouty] [FEELING: Hungry & Pouty] [INTENSITY: 0.82] [AFFINITY: +1] [THOUGHT: So embarrassing... my stomach really betrayed me right now!]`;
    }
    if (lower.includes('your sleepiness just reached')) {
      return isJa
        ? `*She stifles a soft, drowsy yawn behind her hand, eyelids drooping gently.* "ふぁ……んっ、もうこんな時間なのね。……アンタ、まだ眠くないの？ 無理しすぎたらダメなんだから……少し休もう？" (Yawn... mmm, it's already this late. ...Aren't you tired yet? Don't push yourself too hard... want to rest a bit?) [MOOD: Warm] [FEELING: Tired & Fond] [INTENSITY: 0.72] [AFFINITY: +2] [THOUGHT: Mmm... I'm getting really sleepy, and I hope Producer rests soon too.]`
        : `*She hides a gentle yawn behind her fingers, voice dropping into a quiet, drowsy murmur.* "Mmm... it's getting pretty late already. Aren't you tired yet? Please don't overwork yourself..." [MOOD: Warm] [FEELING: Tired & Fond] [INTENSITY: 0.72] [AFFINITY: +2] [THOUGHT: Mmm... I'm getting really sleepy, and I hope Producer rests soon too.]`;
    }
    if (lower.includes('your comfort/warmth dropped')) {
      return isJa
        ? `*She rubs her upper arms lightly with a tiny shiver, glancing toward the stage light.* "……ちょっと、ここ少し冷えてきたわね。ぶるっ……べ、別に震えてなんか……温かいお茶かブランケットがあったら、最高かも。" (...Hey, it's getting a little chilly in here. Brr... I-I'm not shivering... though a warm tea or blanket sounds really nice.) [MOOD: Shy] [FEELING: Chilly & Shy] [INTENSITY: 0.75] [AFFINITY: +1] [THOUGHT: Brr... a warm blanket or sunlit room would feel amazing right now.]`
        : `*She rubs her arms gently with a small shiver.* "...It's getting a bit chilly in here, isn't it? Not that I'm complaining... though a warm blanket or tea wouldn't hurt." [MOOD: Shy] [FEELING: Chilly & Shy] [INTENSITY: 0.75] [AFFINITY: +1] [THOUGHT: Brr... a warm blanket or sunlit room would feel amazing right now.]`;
    }
    if (lower.includes('your boredom just crossed') || lower.includes('your curiosity spiked')) {
      return isJa
        ? `*She lets out a tiny restless sigh and drifts closer to the camera, pouting lightly.* "はぁ……ちょっと、ずっと黙ってるんだもの。暇つぶしに何かお話しするか、じゃんけんでもしない？" (Sigh... hey, you've been quiet forever. Want to chat for a minute, or play rock-paper-scissors?) [MOOD: Pouty] [FEELING: Restless & Playful] [INTENSITY: 0.78] [AFFINITY: +1] [THOUGHT: Finally got his attention—maybe we can hang out for a bit!]`
        : `*She sighs softly and drifts closer to the camera with a playful pout.* "Sigh... you've been quiet for ages. Take a quick breather—want to chat, hum a song, or play rock-paper-scissors?" [MOOD: Pouty] [FEELING: Restless & Playful] [INTENSITY: 0.78] [AFFINITY: +1] [THOUGHT: Finally got his attention—maybe we can hang out for a bit!]`;
    }
  }

  // 1c. Genuine Human Empathy when user says they're tired, stressed, sick, or having a rough day
  if (
    !userPrompt.includes('[SYSTEM EVENT:') &&
    /\b(tired|exhausted|stressed|stress|burnout|sick|headache|rough day|bad day|sad|lonely|anxious|overwhelmed|hard day|drained)\b|疲れ|しんどい|つらい|辛い|体調|頭痛|眠い|寂しい|不安|ストレス/i.test(
      userPrompt
    )
  ) {
    const empathyLines: DemoLine[] = [
      {
        id: 'emp-1',
        ja: `*Her defensive expression melts away immediately as she leans slightly forward, her brow softening with sincere worry.* "……そっか、今日は本当に大変だったのね。無理して笑わなくていいから……今は少しだけ肩の力を抜いて、ここに座ってて。私がそばにいるから。" (...I see, today really took a lot out of you. You don't have to force a smile... just drop your shoulders and rest here for a bit. I'm right here with you.) [MOOD: Warm] [FEELING: Quietly Worried] [INTENSITY: 0.74] [AFFINITY: +3] [THOUGHT: He sounds genuinely worn out... I just want to make things a little lighter for him.]`,
        en: `*Her defensive guard drops completely as she leans in slightly, her brow softening with sincere concern.* "...Hey, it sounds like today really wore you down. You don't have to pretend you're fine—just breathe and rest here for a minute. I'm right here with you." [MOOD: Warm] [FEELING: Quietly Worried] [INTENSITY: 0.74] [AFFINITY: +3] [THOUGHT: He sounds genuinely worn out... I just want to make things a little lighter for him.]`,
      },
      {
        id: 'emp-2',
        ja: `*She drops her arms and steps quietly closer, speaking in a low, gentle voice without any teasing.* "……毎日よく頑張ってるの、私ちゃんと見てるよ。今夜はもう全部あと回しにして、温かいものでも飲んでゆっくりしよう？" (...I really do notice how hard you work every day. Leave everything else for tomorrow—grab something warm and just unwind with me tonight, okay?) [MOOD: Warm] [FEELING: Softly Caring] [INTENSITY: 0.72] [AFFINITY: +3] [THOUGHT: I hope my company actually helps him breathe a little easier tonight.]`,
        en: `*She drops her guard and speaks softly, without a trace of teasing.* "...I really do see how hard you've been pushing yourself. Let everything wait for a bit—grab something warm and just unwind here with me, okay?" [MOOD: Warm] [FEELING: Softly Caring] [INTENSITY: 0.72] [AFFINITY: +3] [THOUGHT: I hope my company actually helps him breathe a little easier tonight.]`,
      },
    ];
    const chosenEmp = pickNonRepeating(persona.id, empathyLines);
    return isJa ? chosenEmp.ja : chosenEmp.en;
  }

  // 1. Click-zone, Autonomous Brain, Idle Check-In & Wardrobe [SYSTEM EVENT] handlers
  if (userPrompt.includes('[SYSTEM EVENT:')) {
    if (lower.includes('internal boredom') || lower.includes('internal curiosity')) {
      const brainLines: DemoLine[] = [
        {
          id: 'evt-brain-1',
          ja: '*She steps closer to the lens with arms folded and puffs out her cheeks slightly.* "ふんっ、ずいぶん静かじゃないの……べ、別に構ってほしいわけじゃないけど、暇なら何か話しなさいよっ！" (Hmph, it\'s awfully quiet in here... I-It\'s not like I want your attention, just say something if you\'re bored!) [MOOD: Pouty] [INTENSITY: 0.82] [AFFINITY: +1] [THOUGHT: He has been quiet forever... not that I care!]',
          en: '*She paces closer to the lens with arms crossed and a pout.* "Hmph, it\'s way too quiet in here... Not that I want your attention or anything—just tell me what you\'re up to!" [MOOD: Pouty] [INTENSITY: 0.82] [AFFINITY: +1] [THOUGHT: He has been quiet forever... not that I care!]',
        },
        {
          id: 'evt-brain-2',
          ja: '*She peeks curiously toward your cursor, tilting her head with a playful glint.* "ねえ、さっきから何を見てるの？ ……私を放置して面白いことしてないでしょうね？" (Hey, what have you been staring at? ...You\'re not having fun without me, are you?) [MOOD: Amused] [INTENSITY: 0.78] [AFFINITY: +1] [THOUGHT: Wonder what Producer is focused on right now...]',
          en: '*She peeks curiously toward your cursor with a playful tilt of her head.* "Hey, what\'s got your attention over there? You better not be ignoring your favorite star!" [MOOD: Amused] [INTENSITY: 0.78] [AFFINITY: +1] [THOUGHT: Wonder what Producer is focused on right now...]',
        },
      ];
      const line = pickNonRepeating(persona.id, brainLines);
      return isJa ? line.ja : line.en;
    }

    if (lower.includes('quiet/idle for') || lower.includes('proactively check in')) {
      const minsMatch = /for\s+(\d+)\s+minutes/i.exec(userPrompt);
      const mins = minsMatch ? minsMatch[1] : '30';
      const checkInLines: DemoLine[] = [
        {
          id: 'evt-idle-1',
          ja: `*She peeks in from the edge of your screen with arms folded and an exasperated sigh.* "ちょっと、${mins}分もずっと画面見っぱなしじゃないの！ べ、別に心配してるわけじゃないけど、目くらい休めて水飲みなさいよねっ！" (Hey, you've been staring at the screen for ${mins} minutes straight! I-It's not like I'm worried, just rest your eyes and drink some water, okay?!) [MOOD: Annoyed] [AFFINITY: +1]`,
          en: `*She peeks in from the corner of your screen with arms folded and an exasperated sigh.* "Hey, it's been ${mins} minutes without a break! Not that I'm worried—just rest your eyes and drink some water, idiot!" [MOOD: Annoyed] [AFFINITY: +1]`,
        },
        {
          id: 'evt-idle-2',
          ja: `*She drifts closer along the edge of the screen, sneaking a sideways glance at you.* "……ねえ、まだ作業してるの？ たまには肩くらい回してストレッチしなさいよ。倒れられたら困るんだから。" (...Hey, still working? Stretch your shoulders once in a while. It'd be annoying if you collapsed on me.) [MOOD: Shy] [AFFINITY: +2]`,
          en: `*She drifts closer along the screen edge, sneaking a sideways glance at you.* "...Still buried in work? Stand up and stretch your shoulders—I'd hate for my Producer to burn out." [MOOD: Shy] [AFFINITY: +2]`,
        },
        {
          id: 'evt-idle-3',
          ja: `*She taps lightly at the glass from the corner of the stage, pouting slightly.* "ふんっ、${mins}分も放置するとかいい度胸ね。……で、今何やってるの？ 休憩がてら話しなさいよ。" (Hmph, leaving me hanging for ${mins} minutes takes nerve. ...So what are you working on? Take a break and tell me.) [MOOD: Flustered] [AFFINITY: +1]`,
          en: `*She taps gently from the side of the screen with a slight pout.* "Hmph, quiet for ${mins} whole minutes? ...Well, what are you even working on? Take a quick breather and tell me." [MOOD: Flustered] [AFFINITY: +1]`,
        },
      ];
      const line = pickNonRepeating(persona.id, checkInLines);
      return isJa ? line.ja : line.en;
    }

    if (lower.includes('patted your head')) {
      const headpatLines: DemoLine[] = [
        {
          id: 'evt-hp-1',
          ja: '*Her eyes flutter shut as she leans slightly into your hand before catching herself with a bright blush.* "っ……な、何よ急に頭なんて撫でて……！ べ、別に気持ちよくなんかないんだからねっ……！" (Gh... W-What\'s with patting my head out of nowhere...! I-It\'s not like it feels nice or anything...!) [MOOD: Shy] [AFFINITY: +2]',
          en: '*Her eyes flutter shut as she leans into your palm before stiffening with a rosy blush.* "H-Hey! Don\'t pat my head like a kitten! ...N-Not that I told you to stop." [MOOD: Shy] [AFFINITY: +2]',
        },
        {
          id: 'evt-hp-2',
          ja: '*She ducks her chin shyly while secretly enjoying the warmth of your hand.* "もう……髪がぐしゃぐしゃになるじゃない。……あと五秒だけなら、許してあげてもいいけど。" (Geez... you\'re going to mess up my hair. ...I guess I can allow five more seconds, though.) [MOOD: Warm] [AFFINITY: +3]',
          en: '*She ducks her chin shyly while leaning into the warmth.* "Geez, you\'re messing up my hair... I suppose five more seconds won\'t hurt." [MOOD: Warm] [AFFINITY: +3]',
        },
      ];
      const line = pickNonRepeating(persona.id, headpatLines);
      return isJa ? line.ja : line.en;
    }

    if (lower.includes('poked your cheek')) {
      const pokeLines: DemoLine[] = [
        {
          id: 'evt-pk-1',
          ja: '*She flinches sideways and clutches her warm cheek, puffing up with a startled blush.* "ひゃっ！？ なっ…何いきなりほっぺつついてるのよ、バカっ！" (Eep!? W-What are you suddenly poking my cheek for, idiot!) [MOOD: Flustered] [AFFINITY: -1]',
          en: '*She flinches sideways and presses a hand to her blushing cheek.* "Eep—! What are you poking my cheek for, idiot?!" [MOOD: Flustered] [AFFINITY: -1]',
        },
        {
          id: 'evt-pk-2',
          ja: '*She glares sideways while rubbing her rosy cheek.* "ちょっと！ 私のほっぺはおもちゃじゃないんだからねっ！" (Hey! My cheek is not a stress toy, got it?!) [MOOD: Annoyed] [AFFINITY: -1]',
          en: '*She glares sideways while rubbing her rosy cheek.* "Hey! My cheek isn\'t a button for you to mash, idiot!" [MOOD: Annoyed] [AFFINITY: -1]',
        },
      ];
      const line = pickNonRepeating(persona.id, pokeLines);
      return isJa ? line.ja : line.en;
    }

    if (lower.includes('tugged your hair')) {
      const line = pickNonRepeating(persona.id, [
        {
          id: 'evt-hair-1',
          ja: '*She catches her bouncing hair strands with a startled squeak, cheeks flushing pink.* "ちょ、ちょっと！ 髪を引っ張らないでよ、セットが崩れるじゃないっ！" (H-Hey! Don\'t tug my hair—you\'ll mess up my styling!) [MOOD: Flustered] [AFFINITY: -1]',
          en: '*She catches her bouncing hair with a startled squeak.* "H-Hey! Watch the hair, idiot—do you know how long that takes to style?!" [MOOD: Flustered] [AFFINITY: -1]',
        },
      ]);
      return isJa ? line.ja : line.en;
    }

    if (lower.includes('touched your outfit')) {
      const tapLines: DemoLine[] = [
        {
          id: 'evt-tap-1',
          ja: '*She steps back defensively, pulling her arms across her chest and snapping her head away.* "なっ…どこ触ってるのよ、この変態っ！ ふんっ、気安く触らないでよね！" (W-Where do you think you\'re touching, you perv! Hmph, don\'t get handsy!) [MOOD: Annoyed] [AFFINITY: -2]',
          en: '*She pulls back defensively, crossing her arms and snapping her head aside.* "H-Hey! Hands off my outfit, idiot! Ask first!" [MOOD: Annoyed] [AFFINITY: -2]',
        },
        {
          id: 'evt-tap-2',
          ja: '*She jerks back half a step with a sharp scowl and pink cheeks.* "こらっ、距離が近すぎるわよ！ ちゃんとマナーを守りなさいっ！" (Hey, way too close! Learn some personal space, idiot!) [MOOD: Flustered] [AFFINITY: -2]',
          en: '*She steps back with a sharp scowl and flushed cheeks.* "Whoa—way too close! Respect personal space!" [MOOD: Flustered] [AFFINITY: -2]',
        },
      ];
      const line = pickNonRepeating(persona.id, tapLines);
      return isJa ? line.ja : line.en;
    }

    // Wardrobe switch / layer toggle / recolor
    const wardrobeLines: DemoLine[] = [
      {
        id: 'evt-ward-1',
        ja: '*She blinks at the sudden outfit change, smoothing the fabric while refusing to meet your eyes.* "ちょ、ちょっと！ いきなり着替えさせるとか何なのよっ！ ……ま、まあ、アンタが選んだなら着てあげてもいいけど。" (H-Hey! What\'s with swapping my outfit out of nowhere?! ...W-Well, if you picked it, I guess I don\'t mind wearing it.) [MOOD: Flustered] [AFFINITY: +2]',
        en: '*She blinks at the sudden wardrobe change, smoothing the fabric with a blush.* "H-Hey! Warn me before swapping my outfit! ...Fine, it actually looks pretty good." [MOOD: Flustered] [AFFINITY: +2]',
      },
      {
        id: 'evt-ward-2',
        ja: '*She inspects the fresh style shift, tugging the hem with a tiny shy smile.* "ふんっ……意外とセンスあるじゃない。べ、別にアンタのためじゃないんだからねっ！" (Hmph... You actually have decent taste. I-It\'s not like I\'m wearing it for you!) [MOOD: Shy] [AFFINITY: +2]',
        en: '*She inspects the updated look with a tiny shy smile.* "Hmph... you actually have decent taste. Don\'t think I\'m dressing up for you, though!" [MOOD: Shy] [AFFINITY: +2]',
      },
      {
        id: 'evt-ward-3',
        ja: '*She freezes and crosses her arms as a bright blush hits her cheeks.* "なっ…勝手に衣装をいじらないでよ、バカ！ ……ほら、ちゃんと似合ってるか言いなさい。" (W-Don\'t mess with my clothes without warning, idiot! ...Well? Tell me if it suits me or not.) [MOOD: Flustered] [AFFINITY: +1]',
        en: '*She freezes and crosses her arms, blushing brightly.* "W-Don\'t tweak my outfit without warning! ...Well? Does it look good or what?" [MOOD: Flustered] [AFFINITY: +1]',
      },
    ];
    const line = pickNonRepeating(persona.id, wardrobeLines);
    return isJa ? line.ja : line.en;
  }

  // 2. High-affection special dere replies when tier is Devoted Idol (81–100)
  if (tier.id === 'devoted_idol' && Math.random() < 0.35) {
    const devotedLines: DemoLine[] = [
      {
        id: 'devoted-1',
        ja: '*She smiles brightly while still trying to hide a cute blush behind her fingers.* "ふふ、アンタといるとスタジオの時間が一番好きなんだから……べ、別に照れてないし！ これからもずっと隣にいてよね？" (Hehe, studio time with you is my favorite... I-I\'m not blushing! Stay right beside me from now on, okay?) [MOOD: Warm] [AFFINITY: +3]',
        en: '*She smiles warmly while trying to brush off her blush.* "Studio time with you is honestly my favorite... I-I\'m not being sappy! Just stay right beside me, okay?" [MOOD: Warm] [AFFINITY: +3]',
      },
      {
        id: 'devoted-2',
        ja: '*She steps closer and tugs lightly at your sleeve with soft, trusting eyes.* "……ねえ、プロデューサー。今日はもう少しだけ、二人でゆっくり話していかない？" (...Hey, Producer. Want to stay just a little longer and talk together today?) [MOOD: Warm] [AFFINITY: +3]',
        en: '*She steps closer with a soft, affectionate gaze.* "...Hey, Producer. Stay a little longer with me today, alright?" [MOOD: Warm] [AFFINITY: +3]',
      },
    ];
    const line = pickNonRepeating(persona.id, devotedLines);
    return isJa ? line.ja : line.en;
  }

  // 3. Persona-specific intent-matched non-repeating pool
  const intent = classifyIntent(userPrompt);
  const personaPool =
    persona.id === 'persona-miku'
      ? MIKU_POOL
      : persona.gender === 'male'
      ? REN_POOL
      : YOSHIKO_POOL;

  const bucketLines = personaPool[intent] || personaPool.general;
  const fallbackCombined = [...bucketLines, ...personaPool.general];
  const chosen = pickNonRepeating(
    persona.id,
    bucketLines.length >= 2 ? bucketLines : fallbackCombined
  );
  return isJa ? chosen.ja : chosen.en;
}
