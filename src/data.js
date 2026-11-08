export const newId = () => crypto.randomUUID();
export const newCard = (question, answer) => ({id:newId(), question, answer, confidence:0, dueAt:null, reviewedAt:null, reviewCount:0, starred:false});
const makeDeck = (title, pairs) => ({id:newId(),title,createdAt:new Date().toISOString(),cards:pairs.map(([q,a])=>newCard(q,a))});
export const emptyLibrary = () => ({version:1,classes:[],activity:[],settings:{dailyGoal:20,language:'en'}});
export function exampleLibrary() {
  const library = emptyLibrary();
  const classes = [
    {
      title:'Italian essentials', description:'A little Italian. A whole new world.', color:'blue', icon:'globe',
      decks:[
        makeDeck('Everyday expressions', [['How do you say “good morning” in Italian?','Buongiorno'],['How do you say “thank you”?','Grazie'],['What does “per favore” mean?','Please'],['How do you say “see you soon”?','A presto'],['What does “come stai?” mean?','How are you?'],['How do you say “you’re welcome”?','Prego'],['What does “mi chiamo” mean?','My name is'],['How do you say “nice to meet you”?','Piacere']]),
        makeDeck('At the café', [['How do you order a coffee politely?','Un caffè, per favore.'],['What does “il conto, per favore” mean?','The bill, please.'],['How do you say “a glass of water”?','Un bicchiere d’acqua'],['What is a “cornetto”?','An Italian pastry, similar to a croissant.'],['How do you ask “how much is it?”','Quanto costa?'],['What does “da portare via” mean?','To take away']]),
        makeDeck('Getting around', [['How do you ask “where is the station?”','Dov’è la stazione?'],['What does “a destra” mean?','To the right'],['What does “a sinistra” mean?','To the left'],['How do you say “one ticket”?','Un biglietto'],['What does “sempre dritto” mean?','Straight ahead'],['How do you say “excuse me” to get someone’s attention?','Mi scusi']])
      ]
    },
    {
      title:'World geography',description:'Get to know the world, one card at a time.',color:'green',icon:'globe',
      decks:[
        makeDeck('Places & capitals', [['What is the capital of Portugal?','Lisbon'],['Which country has the largest land area?','Russia'],['What is the capital of Japan?','Tokyo'],['Which continent is home to the Sahara?','Africa'],['What is the capital of Canada?','Ottawa'],['Which country is home to Machu Picchu?','Peru']]),
        makeDeck('The natural world', [['What is the largest ocean on Earth?','The Pacific Ocean'],['Which mountain is the highest above sea level?','Mount Everest'],['Which river flows through Paris?','The Seine'],['What is the largest island in the world?','Greenland (Australia is classified as a continent).'],['Which ocean lies between Africa and Australia?','The Indian Ocean'],['What is the world’s largest hot desert?','The Sahara']])
      ]
    },
    {
      title:'Design fundamentals',description:'Build an eye for the things that work.',color:'purple',icon:'palette',
      decks:[
        makeDeck('Principles of design', [['What is visual hierarchy?','The arrangement of elements to guide attention in order of importance.'],['What is white space?','The empty space between and around elements in a composition.'],['What does contrast help establish?','Visual interest, readability, and emphasis.'],['What is the purpose of alignment?','To create order and visual relationships between elements.'],['What is proximity in design?','Placing related elements close together so they are perceived as a group.'],['What is repetition used for?','Creating consistency and strengthening a visual identity.']]),
        makeDeck('Color & typography', [['What are complementary colors?','Colors opposite one another on the color wheel.'],['What is kerning?','Adjusting the space between individual pairs of letters.'],['What is leading?','The vertical space between lines of text.'],['What is a serif?','A small stroke attached to the end of a larger stroke in a letter.'],['What does a color’s saturation describe?','The intensity or purity of the color.'],['What is a typeface’s x-height?','The height of lowercase letters, measured using the lowercase x.']])
      ]
    }
  ];
  library.classes = classes.map(cls=>({id:newId(),createdAt:new Date().toISOString(),...cls}));
  return library;
}

// Validate imported backups before they reach rendering or cloud persistence.
export function validateLibrary(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.classes) || value.classes.length > 500) throw new Error('This is not a valid Flashlang backup.');
  const ids = new Set(); let cardCount=0;
  const uniqueId = value => { if (typeof value !== 'string' || !value || value.length>100 || ids.has(value)) throw new Error('The backup contains invalid or duplicate IDs.'); ids.add(value); return value; };
  const text = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.length>max) throw new Error('The backup contains invalid text.'); return value; };
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const classes = value.classes.map(cls=>{
    if (!Array.isArray(cls.decks) || cls.decks.length>1000) throw new Error('Invalid decks in backup.');
    return { id:uniqueId(cls.id),title:text(cls.title,200),description:typeof cls.description==='string'?cls.description.slice(0,1000):'',color:['blue','green','purple','orange','pink'].includes(cls.color)?cls.color:'blue',icon:['globe','palette','book','bulb','leaf','folder'].includes(cls.icon)?cls.icon:'book',createdAt:time(cls.createdAt)||new Date().toISOString(),decks:cls.decks.map(deck=>{
      if (!Array.isArray(deck.cards) || (cardCount+=deck.cards.length)>100000) throw new Error('This backup has too many cards (maximum 100,000).');
      return {id:uniqueId(deck.id),title:text(deck.title,200),createdAt:time(deck.createdAt)||new Date().toISOString(),cards:deck.cards.map(card=>({id:uniqueId(card.id),question:text(card.question,20000),answer:text(card.answer,20000),confidence:Math.max(0,Math.min(5,Math.floor(Number(card.confidence)||0))),reviewCount:Math.max(0,Math.min(1000000,Math.floor(Number(card.reviewCount)||0))),dueAt:time(card.dueAt),reviewedAt:time(card.reviewedAt),starred:Boolean(card.starred)}))};
    })};
  });
  const activity=Array.isArray(value.activity)?value.activity.filter(a=>a&&typeof a.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)&&Number.isFinite(Date.parse(a.date))&&new Date(a.date).toISOString().slice(0,10)===a.date).slice(-5000).map(a=>({id:typeof a.id==='string'?a.id:newId(),date:a.date,cards:Math.max(0,Math.min(1000000,Math.floor(Number(a.cards)||0))),seconds:Math.max(0,Math.min(86400,Math.floor(Number(a.seconds)||0)))})):[];
  return {version:1,classes,activity,settings:{dailyGoal:Math.max(5,Math.min(500,Math.floor(Number(value.settings?.dailyGoal)||20))),language:value.settings?.language==='it'?'it':'en'}};
}
