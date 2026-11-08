import { englishVerbDecks } from './english-course.js';

export const newId = () => crypto.randomUUID();
export const newCard = (question, answer) => ({id:newId(), question, answer, confidence:0, dueAt:null, reviewedAt:null, reviewCount:0, starred:false});
export const normalizeClassIcon = (icon,title) => {
  if (title==='Italian essentials') return 'flags-en-it';
  if (title==='Inglese') return 'flags-it-en';
  return ['globe','palette','book','bulb','leaf','folder','flag-it','flag-en','flags-en-it','flags-it-en'].includes(icon)?icon:'book';
};
const makeDeck = (title, pairs) => ({id:newId(),title:title.replace(/^([A-C][12] — )\d+ /,'$1'),createdAt:new Date().toISOString(),cards:pairs.map(([q,a])=>newCard(q,a))});
const makeVerbDeck = ({title,verbs}) => makeDeck(title,verbs.flatMap(([italian,base,past,participle,ing,thirdPerson])=>[
  [`Come si dice “${italian}” in inglese?`,`to ${base}`],
  [`Qual è il past simple di “${base}”?`,past],
  [`Qual è il past participle di “${base}”?`,participle],
  [`Qual è la forma in -ing di “${base}”?`,ing],
  [`Qual è la forma he/she/it di “${base}”?`,thirdPerson]
]));
export const emptyLibrary = () => ({version:1,classes:[],activity:[],settings:{dailyGoal:20,language:'en'}});
export function exampleLibrary() {
  const library = emptyLibrary();
  const classes = [
    {
      title:'Italian essentials', description:'A little Italian. A whole new world.', color:'blue', icon:'flags-en-it',
      decks:[
        makeDeck('Everyday expressions', [['How do you say “good morning” in Italian?','Buongiorno'],['How do you say “thank you”?','Grazie'],['What does “per favore” mean?','Please'],['How do you say “see you soon”?','A presto'],['What does “come stai?” mean?','How are you?'],['How do you say “you’re welcome”?','Prego'],['What does “mi chiamo” mean?','My name is'],['How do you say “nice to meet you”?','Piacere']]),
        makeDeck('At the café', [['How do you order a coffee politely?','Un caffè, per favore.'],['What does “il conto, per favore” mean?','The bill, please.'],['How do you say “a glass of water”?','Un bicchiere d’acqua'],['What is a “cornetto”?','An Italian pastry, similar to a croissant.'],['How do you ask “how much is it?”','Quanto costa?'],['What does “da portare via” mean?','To take away']]),
        makeDeck('Getting around', [['How do you ask “where is the station?”','Dov’è la stazione?'],['What does “a destra” mean?','To the right'],['What does “a sinistra” mean?','To the left'],['How do you say “one ticket”?','Un biglietto'],['What does “sempre dritto” mean?','Straight ahead'],['How do you say “excuse me” to get someone’s attention?','Mi scusi']])
      ]
    },
    {
      title:'Inglese', description:'A progressive English course from A1 through C1 with clear CEFR checkpoints.', color:'blue', icon:'flags-it-en',
      decks:[
        makeDeck('A1 — 01 Greetings', [['Salve!','Hello! (polite or neutral greeting)'],['Buona serata!','Have a good evening!'],['A domani.','See you tomorrow.'],['Come si chiama?','What is your name? (formal)'],['Sono canadese.','I am Canadian.'],['Di dove sei?','Where are you from? (informal)'],['Non capisco.',"I don't understand."],['Può ripetere?','Could you repeat that? (formal)']]),
        makeDeck('A1 — 02 Nouns and articles', [['il tavolo','the table'],['la finestra','the window'],["un amico / un'amica",'a male friend / a female friend'],['lo studente','the male student'],['gli studenti','the students (masculine or mixed group)'],['le chiavi','the keys'],["dell'acqua",'some water; of the water'],["un'arancia",'an orange']]),
        makeDeck('A1 — 03 Adjectives', [['un biglietto rosso','a red ticket'],['una borsa rossa','a red bag'],['due libri nuovi','two new books'],['due case nuove','two new houses'],['Il caffè è caldo.','The coffee is hot.'],['La stanza è piccola.','The room is small.'],['un ragazzo simpatico','a friendly young man'],['una città antica','an ancient city']]),
        makeDeck('A2 — 04 Basic conversation', [['Va tutto bene?','Is everything all right?'],['Benissimo.','Very well.'],['Mi dispiace.',"I'm sorry."],['Non lo so.',"I don't know."],["D'accordo.",'All right; agreed.'],['Che cosa significa questa parola?','What does this word mean?'],['Parla inglese?','Do you speak English? (formal)'],['Un momento.','One moment.']]),
        makeDeck('A2 — 05 Pronouns and origins', [['Io sono di Roma.','I am from Rome.'],['Tu sei di Napoli.','You are from Naples. (informal)'],['Lui è italiano.','He is Italian.'],['Lei è argentina.','She is Argentinian.'],['Lei è la signora Bianchi.','You are Mrs. Bianchi. (formal)'],['Noi siamo vicini.','We are neighbors.'],['Voi siete studenti.','You are students. (plural)'],['Loro sono in Italia.','They are in Italy.']]),
        makeDeck('A2 — 06 Possession', [['il mio passaporto','my passport'],['la tua valigia','your suitcase (informal singular)'],['suo fratello','his brother; her brother'],['i nostri biglietti','our tickets'],['le vostre camere','your rooms (plural)'],['La penna è di Marco.','The pen belongs to Marco.'],['È la loro macchina.','It is their car.']]),
        makeDeck('A2 — 07 Family and friends', [['mia madre','my mother'],['mio padre','my father'],['i miei genitori','my parents'],['una sorella maggiore','an older sister'],['un figlio unico','an only son; an only child (male)'],['mia cugina','my female cousin'],['i nonni','the grandparents'],['il compagno di classe','the classmate']]),
        makeDeck('B1 — 08 Numbers and money', [['zero','zero'],['sedici','sixteen'],['ventidue','twenty-two'],['trentuno','thirty-one'],['cento','one hundred'],['centocinquanta euro','one hundred and fifty euros'],['Quanto costa questo?','How much does this cost?'],['Costa otto euro.','It costs eight euros.'],['Avete il resto?','Do you have change?'],['Pago in contanti.',"I'll pay in cash."]]),
        makeDeck('B1 — 09 Days', [['lunedì','Monday'],['martedì','Tuesday'],['mercoledì','Wednesday'],['giovedì','Thursday'],['venerdì','Friday'],['sabato','Saturday'],['domenica','Sunday'],['il fine settimana','the weekend'],['oggi è martedì','today is Tuesday'],['dopodomani','the day after tomorrow']]),
        makeDeck('B1 — 10 Time', [['Che ore sono?','What time is it?'],["È l'una.",'It is one o’clock.'],['Sono le tre e un quarto.','It is quarter past three.'],['Sono le sei meno dieci.','It is ten to six.'],['a mezzogiorno','at noon'],['a mezzanotte','at midnight'],['per due ore','for two hours'],['tra cinque minuti','in five minutes'],['in questo momento','right now'],['in anticipo','ahead of time']]),
        makeDeck('B2 — 11 Food and drink', [['Vorrei un tavolo per due.','I would like a table for two.'],['il menù del giorno','the menu of the day'],["un'acqua frizzante",'a sparkling water'],['senza formaggio','without cheese'],['Sono vegetariano / vegetariana.','I am vegetarian. (masculine / feminine)'],['un piatto di pasta','a plate of pasta'],['È molto piccante?','Is it very spicy?'],['Posso assaggiare?','May I try a taste?'],['un gelato alla fragola','a strawberry ice cream'],['Buon appetito!','Enjoy your meal!']]),
        makeDeck('B2 — 12 Getting around', [["Dov'è la fermata dell'autobus?",'Where is the bus stop?'],['un biglietto di sola andata','a one-way ticket'],['Il treno parte alle nove.','The train leaves at nine.'],['Scenda alla prossima fermata.','Get off at the next stop. (formal command)'],['a nord della piazza','north of the square'],['Continui fino al ponte.','Continue as far as the bridge. (formal command)'],['È lontano da qui?','Is it far from here?'],['Ho perso la strada.',"I've lost my way."],["l'ingresso principale",'the main entrance'],['un taxi libero','an available taxi']]),
        makeDeck('C1 — 13 Pronunciation tips', [['che / chi','The letters ch sound like k before e or i, as in che and chi.'],['ce / ci','The letter c sounds like English "ch" before e or i, as in cena and cinema.'],['ge / gi','The letter g sounds like English "j" before e or i, as in gelato and giro.'],['ghe / ghi','The h keeps g hard before e or i, as in spaghetti and laghi.'],['gli','In many words (for example famiglia), gli is a palatal sound with no exact English equivalent.'],['gn','In words such as gnocchi, gn sounds roughly like "ny" in canyon.'],['sci / sce','The letters sc sound like English "sh" before i or e, as in sciare and scena.'],['h in ho / hai','The h is silent; ho and hai sound like o and ai.'],['double consonants','Hold a double consonant slightly longer than a single one; it can distinguish word meanings.']]),
        makeDeck('A1 — Everyday conversation', [
          ['Ciao, come va?','Hi, how are you? (informal)'],
          ['Come ti chiami?','What is your name? (informal)'],
          ['Mi chiamo Luca.','My name is Luca.'],
          ['Piacere di conoscerti.','Nice to meet you. (informal)'],
          ['Che cosa fai?','What do you do?'],
          ['Abito vicino al centro.','I live near the city center.'],
          ['Studio inglese la sera.','I study English in the evening.'],
          ['A che ora comincia?','What time does it start?'],
          ['Possiamo sederci qui?','Can we sit here?'],
          ['Scusa, dov’è il bagno?','Excuse me, where is the bathroom? (informal)'],
          ['Puoi parlare più lentamente?','Can you speak more slowly? (informal)'],
          ['Ci vediamo dopo.','See you later.']
        ]),
        makeDeck('A2 — Making plans and chatting', [
          ['Ti va di prendere un caffè?','Would you like to get a coffee? (informal)'],
          ['Che ne dici di sabato?','How about Saturday?'],
          ['A che ora ci vediamo?','What time shall we meet?'],
          ['Facciamo alle sette.','Let’s make it seven.'],
          ['Ci vediamo davanti al cinema.','I’ll meet you in front of the cinema.'],
          ['Mi dispiace, sono in ritardo.','Sorry, I’m running late.'],
          ['Ti mando un messaggio quando arrivo.','I’ll text you when I arrive.'],
          ['Puoi tenermi un posto?','Can you save me a seat?'],
          ['Non ho ancora deciso.','I haven’t decided yet.'],
          ['Preferisco qualcosa di tranquillo.','I’d prefer something quiet.'],
          ['Devo andare, ci sentiamo domani.','I have to go; I’ll talk to you tomorrow.'],
          ['È stato bello rivederti.','It was nice to see you again.']
        ]),
        makeDeck('B1 — Keeping a conversation going', [
          ['Da quanto tempo vivi qui?','How long have you lived here?'],
          ['Non ci avevo pensato.','I hadn’t thought of that.'],
          ['Capisco cosa intendi, però…','I see what you mean, but…'],
          ['In realtà, la vedo diversamente.','Actually, I see it differently.'],
          ['Potresti spiegarmi cosa intendi?','Could you explain what you mean?'],
          ['Mi sono perso l’ultima parte.','I missed the last part.'],
          ['Per quanto ne so…','As far as I know…'],
          ['Non è proprio quello che intendevo.','That’s not quite what I meant.'],
          ['Fammi sapere come va.','Let me know how it goes.'],
          ['Non vedo l’ora di vederti.','I’m looking forward to seeing you.'],
          ['Ho avuto una giornata pienissima.','I’ve had a really busy day.'],
          ['Mi ha fatto piacere parlare con te.','It was nice talking with you.']
        ]),
        ...englishVerbDecks.map(makeVerbDeck)
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
  const normalizeCourseTitle = value => {
    if (value === 'Italian A1 — Italian to English' || value === 'Inglese (A1)') return 'Inglese';
    return value;
  };
  const normalizeDeckTitle = value => {
    const map = {
      '01 Greetings': 'A1 — 01 Greetings',
      '02 Nouns and articles': 'A1 — 02 Nouns and articles',
      '03 Adjectives': 'A1 — 03 Adjectives',
      '04 Basic conversation': 'A2 — 04 Basic conversation',
      '05 Pronouns and origins': 'A2 — 05 Pronouns and origins',
      '06 Possession': 'A2 — 06 Possession',
      '07 Family and friends': 'A2 — 07 Family and friends',
      '08 Numbers and money': 'B1 — 08 Numbers and money',
      '09 Days': 'B1 — 09 Days',
      '10 Time': 'B1 — 10 Time',
      '11 Food and drink': 'B2 — 11 Food and drink',
      '12 Getting around': 'B2 — 12 Getting around',
      '13 Pronunciation tips': 'C1 — 13 Pronunciation tips',
    };
    return (map[value] || value).replace(/^([A-C][12] — )\d+ /,'$1');
  };
  const classes = value.classes.map(cls=>{
    if (!Array.isArray(cls.decks) || cls.decks.length>1000) throw new Error('Invalid decks in backup.');
    return { id:uniqueId(cls.id),title:text(normalizeCourseTitle(cls.title),200),description:typeof cls.description==='string'?cls.description.slice(0,1000):'',color:['blue','green','purple','orange','pink'].includes(cls.color)?cls.color:'blue',icon:normalizeClassIcon(cls.icon,cls.title),visibility:cls.visibility==='public'?'public':'private',createdAt:time(cls.createdAt)||new Date().toISOString(),decks:cls.decks.map(deck=>{
      if (!Array.isArray(deck.cards) || (cardCount+=deck.cards.length)>100000) throw new Error('This backup has too many cards (maximum 100,000).');
      return {id:uniqueId(deck.id),title:text(normalizeDeckTitle(deck.title),200),createdAt:time(deck.createdAt)||new Date().toISOString(),cards:deck.cards.map(card=>({id:uniqueId(card.id),question:text(card.question,20000),answer:text(card.answer,20000),confidence:Math.max(0,Math.min(5,Math.floor(Number(card.confidence)||0))),reviewCount:Math.max(0,Math.min(1000000,Math.floor(Number(card.reviewCount)||0))),dueAt:time(card.dueAt),reviewedAt:time(card.reviewedAt),starred:Boolean(card.starred)}))};
    })};
  });
  const activity=Array.isArray(value.activity)?value.activity.filter(a=>a&&typeof a.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)&&Number.isFinite(Date.parse(a.date))&&new Date(a.date).toISOString().slice(0,10)===a.date).slice(-5000).map(a=>({id:typeof a.id==='string'?a.id:newId(),date:a.date,cards:Math.max(0,Math.min(1000000,Math.floor(Number(a.cards)||0))),seconds:Math.max(0,Math.min(86400,Math.floor(Number(a.seconds)||0)))})):[];
  return {version:1,classes,activity,settings:{dailyGoal:Math.max(5,Math.min(500,Math.floor(Number(value.settings?.dailyGoal)||20))),language:value.settings?.language==='it'?'it':'en'}};
}
