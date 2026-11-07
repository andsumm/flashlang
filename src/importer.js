const MAX_CARDS = 10_000;
const MAX_FIELD_LENGTH = 20_000;
const QUESTION_HEADERS = new Set(['question', 'front', 'term', 'prompt']);
const ANSWER_HEADERS = new Set(['answer', 'back', 'definition', 'response']);
const DELIMITERS = { csv: ',', tsv: '\t', semicolon: ';', pipe: '|' };

/** Parse delimited text without losing quoted commas, newlines, or escaped quotes. */
function readDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else field += char;
      continue;
    }
    if (char === delimiter || char === '\n' || char === '\r') {
      row.push(field.trim());
      field = '';
      closedQuote = false;
      if (char !== delimiter) {
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        if (char === '\r' && text[index + 1] === '\n') index += 1;
      }
    } else if (char === '"' && !field.trim() && !closedQuote) {
      quoted = true;
      field = '';
    } else if (closedQuote && !/\s/.test(char)) {
      throw new Error('There is text after a closing quote. Put the whole field inside quotes.');
    } else if (!closedQuote) field += char;
  }
  if (quoted) throw new Error('A quoted field is missing its closing quote.');
  row.push(field.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function headerColumns(row) {
  const labels = row.map(value => value.toLowerCase().trim());
  const questions = labels.flatMap((label, index) => QUESTION_HEADERS.has(label) ? [index] : []);
  const answers = labels.flatMap((label, index) => ANSWER_HEADERS.has(label) ? [index] : []);
  return questions.length === 1 && answers.length === 1
    ? { question: questions[0], answer: answers[0] } : null;
}

function validateCards(cards) {
  if (!cards.length) throw new Error('No cards found. Add a question and an answer to get started.');
  if (cards.length > MAX_CARDS) throw new Error('Import up to 10,000 cards at a time. Split this file into smaller files.');
  return cards.map((card, index) => {
    if (typeof card.question !== 'string' || typeof card.answer !== 'string') {
      throw new Error(`Card ${index + 1}: the question and answer must both be text.`);
    }
    const question = card.question.trim();
    const answer = card.answer.trim();
    if (!question || !answer) throw new Error(`Card ${index + 1} has an empty ${!question ? 'question' : 'answer'}. Fill in both sides before importing.`);
    if (question.length > MAX_FIELD_LENGTH || answer.length > MAX_FIELD_LENGTH) {
      throw new Error(`Card ${index + 1} is too long. Each side can contain up to 20,000 characters.`);
    }
    return { question, answer };
  });
}

function parseJson(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('This JSON is not valid. Check commas, quotes, and brackets.'); }
  const items = Array.isArray(value) ? value : value?.cards;
  if (!Array.isArray(items)) throw new Error('Use a JSON array of cards, or an object with a "cards" array.');
  return items.map((item, index) => {
    if (Array.isArray(item) && item.length === 2) return { question: item[0], answer: item[1] };
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Card ${index + 1} must have a question and an answer.`);
    return {
      question: item.question ?? item.front ?? item.term ?? item.prompt,
      answer: item.answer ?? item.back ?? item.definition ?? item.response,
    };
  });
}

function parseQuestionAnswer(text) {
  const starts = [...text.matchAll(/^(?:Q|Question):[ \t]*/gmi)];
  if (!starts.length || text.slice(0, starts[0].index).trim()) {
    throw new Error('Start each card with "Q:" and put "A:" before its answer.');
  }
  return starts.map((start, index) => {
    const block = text.slice(start.index + start[0].length, starts[index + 1]?.index ?? text.length);
    const answer = /^(?:A|Answer):[ \t]*/mi.exec(block);
    if (!answer) throw new Error(`Card ${index + 1} is missing an "A:" answer.`);
    return { question: block.slice(0, answer.index), answer: block.slice(answer.index + answer[0].length) };
  });
}

/** Import CSV, TSV, semicolon/pipe lists, JSON, or Q:/A: blocks. Throws on invalid rows. */
export function parseImport(input, format = 'auto') {
  if (typeof input !== 'string') throw new Error('Choose a text file or paste your cards.');
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('Your import is empty. Add a question and an answer to get started.');
  if (text.length > 10 * 1024 * 1024) throw new Error('This import is larger than 10 MB. Split it into smaller files.');
  format = String(format).toLowerCase();
  if (format === 'txt') format = 'auto';
  if (format === 'auto' && /^[\[{]/.test(text)) format = 'json';
  if (format === 'auto' && /^(?:Q|Question):/i.test(text) && /^(?:A|Answer):/mi.test(text)) format = 'qa';
  let cards;
  const warnings = [];
  if (format === 'json') cards = parseJson(text);
  else if (format === 'qa') cards = parseQuestionAnswer(text);
  else {
    let rows;
    if (format === 'auto') {
      const candidates = Object.entries(DELIMITERS).flatMap(([name, delimiter]) => {
        try {
          const candidate = readDelimited(text, delimiter);
          if (!candidate.length) return [];
          const header = headerColumns(candidate[0]);
          const useful = candidate.filter(row => row.length === 2).length;
          const score = header ? candidate.length + 1 : useful === candidate.length ? useful : 0;
          return score ? [{ name, rows: candidate, score, header: Boolean(header) }] : [];
        } catch { return []; }
      });
      candidates.sort((a, b) => b.score - a.score || Number(b.name === 'tsv') - Number(a.name === 'tsv'));
      if (!candidates.length) throw new Error('We could not find two columns. Separate the question and answer with a tab, comma, semicolon, or |. Quote fields that contain the separator.');
      if (candidates.length > 1 && candidates[0].name !== 'tsv' && !candidates[0].header && candidates[0].score === candidates[1].score) {
        throw new Error('More than one separator could fit these cards. Choose the file format explicitly, or paste two tab-separated columns.');
      }
      format = candidates[0].name;
      rows = candidates[0].rows;
    } else {
      if (!(format in DELIMITERS)) throw new Error('Choose CSV, TSV, JSON, or automatic format detection.');
      rows = readDelimited(text, DELIMITERS[format]);
    }
    const header = rows.length ? headerColumns(rows[0]) : null;
    if (header) {
      if (rows[0].length > 2) warnings.push('Extra columns will be ignored. Only the question and answer are imported.');
      rows = rows.slice(1);
    }
    cards = rows.map((row, index) => {
      if (!header && row.length !== 2) throw new Error(`Row ${index + 1} has ${row.length} columns. Use exactly two columns, or add a question/answer header.`);
      if (header && row.length <= Math.max(header.question, header.answer)) throw new Error(`Row ${index + 2} is missing a question or answer column.`);
      if (header && row.length > Math.max(header.question, header.answer) + 1 && row.length > 2 && !warnings.length) {
        warnings.push('Extra columns will be ignored. Only the question and answer are imported.');
      }
      return { question: row[header?.question ?? 0], answer: row[header?.answer ?? 1] };
    });
  }
  cards = validateCards(cards);
  const seen = new Set();
  let duplicates = 0;
  for (const card of cards) {
    const key = JSON.stringify([card.question, card.answer]);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  if (duplicates) warnings.push(`${duplicates} duplicate ${duplicates === 1 ? 'card was' : 'cards were'} found. All cards will be kept.`);
  return { cards, warnings, format };
}

/** Escape a value as an RFC 4180 field while preserving its exact text. */
export function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(cards) {
  return ['question,answer', ...cards.map(card => `${escapeCsv(card.question)},${escapeCsv(card.answer)}`)].join('\r\n');
}
