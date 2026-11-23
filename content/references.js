const viral = id => ['ViralAnatomy · archived counters and breakdown', `https://viralanatomy.com/video/tiktok-${id}/?brand=plugai`];
const reels = ['reels.chat · TikHub snapshot, Aug 24, 2026', 'https://reels.chat/diagnose/why-datingwithmads-median-outlier-slideshow-worked'];
const handler = ['Handler · independent breakdown', 'https://gethandler.ai/outliers/online-dating-tiktok-slideshow-308ad7/'];
const ttanon = (handle,id) => ['TT Anon · archived post', `https://ttanon.com/@${handle}/video/${id}`];
const chrome = ['TikTok · observed Nov 23, 2026'];
const research = ['Production research · post visually checked; public counters not captured'];
const post = (id,handle,format,title,role,mechanic,date,metrics,source) => ({id,handle,format,title,role,mechanic,date,metrics,source,url:`https://www.tiktok.com/@${handle}/${format}/${id}`});
const v = (id,h,t,r,m,d,n) => post(id,h,'video',t,r,m,d,n,viral(id));
const a = (id,h,t,r,m,d,n,s=ttanon(h,id)) => post(id,h,'video',t,r,m,d,n,s);
const m = (id,t,r,m,d,n) => post(id,'datingwithmads','photo',t,r,m,d,n,reels);
const h = (id,t,r,m,d,n,s=chrome) => post(id,'dating.advice67','photo',t,r,m,d,n,s);

export const referenceArchive = {
  video: [
    a('7704270106838191391','animalchaos281','Engaged for one time','Premise reference for Flashcards','An immediate fake-date ask turns into clipped banter over moving close-up footage; a Plug suggestion appears inside the ongoing conversation.','Nov 4, 2026',{Views:'1.1M',Likes:'46.9K',Comments:'1.7K',Shares:'7.1K',Saves:'5.8K'}),
    a('7709278517531381022','animalchaos281','Second original Plug texting story','Adjacent production research','Moving close-up footage under a spoken texting story. Originally inspected for background treatment; no evidence it directly drove Flashcards.',null,{},research),
    v('7640652226779811094','rizzingchats','How to text the huzz','Close benchmark','A take-notes hook and staged chat build to an on-screen Plug suggestion, then a reaction supplies the payoff.','May 17, 2026',{Views:'709.3K',Likes:'46K'}),
    v('7643229128749010198','rizzingchats','Texting huzz','Close benchmark','Same take-notes opening, staged exchange, product assist and reaction; 24 seconds.','May 23, 2026',{Views:'633.7K',Likes:'61.1K'}),
    v('7666930880706792725','jay.rizzing','How to Text the huzz, part 52','Close benchmark','Another creator repeats the chat → assist → reaction progression at a longer runtime.','Jul 26, 2026',{Views:'164.1K',Likes:'8K'}),
    v('7646484003138145558','loyaltytester404','Plug AI Loyalty Test','Adjacent inspiration','A commissioned loyalty test drives an escalating DM investigation; the app writes the next probe. Not the same opening or runtime.','Jun 1, 2026',{Views:'197.3K',Likes:'7K'}),
    post('7698527792601795842','textingtostories','video','That free mechanic😭','User-selected long-form reference','1:32.459. Opens on a car photo and a theft demand, then reframes him as an unwitting repairman. A hard refusal closes the loop. Dark iMessage over moving macro food footage; audio not verified. Separate long-form reference, not the Wingman benchmark.','Oct 19, 2026',{Views:'198.4K',Likes:'3,119',Comments:'11',Saves:'183',Shares:'48'},['TikTok · exact post counters observed Nov 23, 2026']),
    v('7672159840705236246','rizzingchats','Same-creator take-notes control','Performance control','Same take-notes, chat, assist and reaction pattern at 22 seconds, but 3.1K views versus the creator’s usual 18.9K. Public breakdown, not independently watched.','Aug 9, 2026',{Views:'3.1K',Likes:'242'}),
    v('7660202751204363551','herrizztalk','Texting older baddies','Performance control','A take-notes and product-turn variation with weak reach. Matching the structure alone did not make it a winner.','Jul 8, 2026',{Views:'717',Likes:'46'}),
    a('7709246198569291040','speakingtexts','She tried to set him up','Adjacent inspiration','RIZZ APP example: a ridiculous relationship hypothetical escalates through practical objections, with active cooking footage. Not a Plug AI original.','Nov 17, 2026',{Views:'182K',Likes:'7.6K',Comments:'96',Shares:'323',Saves:'816'}),
    post("7706571518045719839","animalchaos281","video","Divorced-parents complication","Adjacent inspiration","Divorced-parents family complication. Earlier alternate writing reference.","Nov 10, 2026",{"Views": "140K", "Likes": "3.7K", "Comments": "111", "Shares": "488", "Saves": "509"},["TT Anon · performance snapshot, Nov 23, 2026", "https://ttanon.com/@animalchaos281/video/7706571518045719839"]),
    post("7704002254986120480","speakingtexts","video","The excuse unravels","Adjacent inspiration","Third-party messages and envelope/photo undermine the excuse.","Nov 3, 2026",{"Views": "1.1M", "Likes": "75.2K", "Comments": "958", "Shares": "2.6K", "Saves": "10.9K"},["TT Anon · performance snapshot, Nov 23, 2026", "https://ttanon.com/@speakingtexts/video/7704002254986120480"]),
    post("7710370374327749910","speakingtexts","video","Why is the living room empty?","Adjacent inspiration","Empty living room leads to breakup and financial reversal. Butter swirl, single meatball, full pan by six seconds.","Nov 20, 2026",{"Views": "284K", "Likes": "18.6K", "Comments": "134", "Shares": "371", "Saves": "2.5K"},["TT Anon · performance snapshot, Nov 23, 2026", "https://ttanon.com/@speakingtexts/video/7710370374327749910"]),
    post("7699631117946621214","textiify","video","Parkour beneath the chat","Adjacent inspiration","Fixed dark chat pane above full-bleed POV. Camera clears blue ledges, orange stairs, gray corridor.","Oct 22, 2026",{"Views": "75.2K", "Likes": "3.2K", "Comments": "17", "Shares": "66", "Saves": "383"},["TT Anon · performance snapshot, Nov 23, 2026", "https://ttanon.com/@textiify/video/7699631117946621214"]),
    post("7704034338647674134","pixeltales45","video","Late-night request","Adjacent inspiration","A late-night request begins with checking whether Ethan is awake. Transcript/catalog evidence only.","Nov 3, 2026",{"Views": "476K", "Likes": "17.7K", "Comments": "115", "Shares": "363", "Saves": "1.7K"},["TT Anon · performance snapshot, Nov 23, 2026", "https://ttanon.com/@pixeltales45/video/7704034338647674134"]),
    post("7337652954406718753","texty.stories.daily","video","Parkour-tagged text story A","Adjacent inspiration","Music-only transcript. Caption labels Minecraft parkour.",null,{"Views": "12.0M", "Likes": "1.3M"},["Tokscribe · secondary listing read Nov 23, 2026", "https://tokscribe.com/author/texty.stories.daily"]),
    post("7379687264051416353","texty.stories.daily","video","Parkour-tagged text story B","Adjacent inspiration","Conversation opens on a phone search. Parkour is tagged in caption.",null,{"Views": "12.2M", "Likes": "1.4M"},["Tokscribe · secondary listing read Nov 23, 2026", "https://tokscribe.com/author/texty.stories.daily"]),
  ],
  michaela: [
    m('7606903470699891990','Read the text and go about your day','Close benchmark','A composed selfie makes a promise. The withheld chat screenshot pays it off with a deadpan reversal.','Feb 15, 2026',{Views:'17.1M',Likes:'3.35M',Comments:'6.2K',Shares:'348.3K',Saves:'149.8K'}),
    m('7610965086215195926','Traumatise these men back','Close benchmark','The selfie opens a curiosity gap; the chat screenshot supplies the comeback.',null,{Views:'16.7M',Engagement:'19.2%'}),
    m('7632467125839383830','Same opening, ordinary result','Performance control','Same first-slide premise and two-frame format as the 17.1M post, but a different chat reveal.',null,{Views:'462.6K',Engagement:'10.3%'}),
    m('7629926592097078550','Repeated comeback hook A','Performance control','The alternate comeback hook and two-frame structure land close to the account median.',null,{Views:'673.3K',Engagement:'16.7%'}),
    m('7628532553569389846','Repeated comeback hook B','Performance control','The same alternative hook and two-frame delivery did not replicate the breakout.',null,{Views:'288.6K',Engagement:'15.2%'}),
    m('7625357754525437206','Repeated comeback hook C','Performance control','A third matched ordinary example shows that the hook and slide count are not sufficient.',null,{Views:'452.3K',Engagement:'12.7%'}),
  ],
  hinge: [
    h('7708554077088550157','Part 67','Selected original','One seemingly personal dating-app exchange is undermined by an inbox of matching lines. This is the user-selected structural reference.',null,{Likes:'54',Comments:'1'}),
    h('7707056162402766094','My first match','Close benchmark','A flattering first-match claim gives way to nearly every inbox row carrying the same line.','Nov 11, 2026',{Views:'743K',Likes:'62K'}),
    h('7708211340501961997','Only attractive guy','Close benchmark','Dark-mode chat offers exclusive flattery; the inbox shows the exact compliment sent repeatedly.',null,{Views:'396.3K'}),
    h('7708132586874244366','You and only you','Close benchmark','A dramatic line about destiny gets repeated across visible inbox rows.','Nov 14, 2026',{Views:'343.8K',Likes:'40.1K'}),
    h('7708833034446851342','Another perfect woman','Close benchmark','A sweet Tinder exchange is reinterpreted when an inbox reveals a copy-paste opener.','Nov 16, 2026',{Views:'1M',Likes:'194K',Comments:'620',Shares:'21K',Saves:'4.4K'},[handler[0], 'https://gethandler.ai/blog/grow-dating-app-tiktok/#teardown-2-one-smooth-dm-sent-to-ten-matches-357x']),
    h('7710849308383382797','GTA 6 chat','Performance control','Dark Hinge conversation followed by a repeated-message inbox reveal. The same structural mechanic did not guarantee reach.',null,{Views:'6,027',Likes:'102',Comments:'0'}),
    h('7711372773574069535','My Soul has Dream','Performance control','Visible inbox rows repeat a poetry opener. The complete sequence was not verified, so this is not a second-format benchmark.',null,{Views:'2,606',Likes:'96',Comments:'1'}),
    h('7705229880211836173','Poetry-led carousel','Second format benchmark','Three beats: a paper-texture poetry quote, the same quote sent in Hinge with a positive response, and a Hinge inbox that repeats it across matches. Distinct from the direct two-slide format.','Nov 6, 2026',{Views:'800.2K',Likes:'134.6K',Comments:'349'}),
  ],
};

// Creator handoff: review method is separate from where performance was recorded.
const creatorEvidence = {
  "7640652226779811094": {
    "review": "Downloaded player plus independent breakdown",
    "duration": "0:20.63",
    "metrics": {
      "Views": "709.3K",
      "Likes": "46K"
    },
    "source": [
      "ViralAnatomy · performance snapshot, Nov 23, 2026",
      "https://viralanatomy.com/video/tiktok-7640652226779811094/?brand=plugai"
    ],
    "mechanic": "Animated basketball tutorial meme to dark purple chat. Sports and animal reaction inserts, app flash, sent line and blocked-account reveal.",
    "secondSnapshot": {
      "label": "TT Anon · separate snapshot, Nov 23, 2026",
      "url": "https://ttanon.com/@rizzingchats/video/7640652226779811094",
      "metrics": {
        "Views": "712K",
        "Likes": "46K",
        "Comments": "265",
        "Shares": "5.3K",
        "Saves": "5.7K"
      }
    }
  },
  "7704270106838191391": {
    "review": "Downloaded player and transcript",
    "duration": "4:51",
    "metrics": {
      "Views": "1.1M",
      "Likes": "46.9K",
      "Comments": "1.7K",
      "Shares": "7.1K",
      "Saves": "5.8K"
    },
    "source": [
      "TT Anon · performance snapshot, Nov 23, 2026",
      "https://ttanon.com/@animalchaos281/video/7704270106838191391"
    ],
    "date": "Nov 4, 2026",
    "mechanic": "Fake relationship favor. Detached pale chat over real pasta shaping. Product enters when a compliment is risky."
  },
  "7709278517531381022": {
    "review": "Downloaded player and transcript",
    "duration": "2:55",
    "metrics": {
      "Views": "214K",
      "Likes": "5.3K",
      "Comments": "38",
      "Shares": "904",
      "Saves": "410"
    },
    "source": [
      "TT Anon · performance snapshot, Nov 23, 2026",
      "https://ttanon.com/@animalchaos281/video/7709278517531381022"
    ],
    "date": "Nov 17, 2026",
    "mechanic": "Ex texts despite asking for distance. Gold applicator builds a circle on dark material. Reviewed for footage; no evidence it directly drove Flashcards."
  },
  "7706571518045719839": {
    "review": "Post record",
    "duration": "4:13"
  },
  "7709246198569291040": {
    "review": "Downloaded player and transcript",
    "duration": "7:06",
    "metrics": {
      "Views": "186K",
      "Likes": "7.8K",
      "Comments": "98",
      "Shares": "330",
      "Saves": "842"
    },
    "source": [
      "TT Anon · performance snapshot, Nov 23, 2026",
      "https://ttanon.com/@speakingtexts/video/7709246198569291040"
    ],
    "date": "Nov 17, 2026",
    "mechanic": "Worm hypothetical becomes loyalty test and confession. First object returns at end. This is a RIZZ APP example, not a Plug AI original."
  },
  "7704002254986120480": {
    "review": "Transcript",
    "duration": "7:09"
  },
  "7710370374327749910": {
    "review": "Downloaded player and transcript",
    "duration": "8:39"
  },
  "7699631117946621214": {
    "review": "Downloaded player",
    "duration": "10:14"
  },
  "7704034338647674134": {
    "review": "New related post record",
    "duration": "4:53"
  },
  "7337652954406718753": {
    "review": "Secondary listing and caption only",
    "duration": "2:38"
  },
  "7379687264051416353": {
    "review": "Secondary listing and caption only",
    "duration": "1:23"
  }
};
for (const entry of referenceArchive.video) Object.assign(entry, creatorEvidence[entry.id]);
