import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, toCsv } from '../src/importer.js';

test('CSV handles BOM, CRLF, quotes, commas, and multiline fields', () => {
  const text = '\uFEFFquestion,answer\r\n"A question, with comma","A ""quoted"" answer\r\nnext line"\r\n';
  assert.deepEqual(parseImport(text).cards, [{ question: 'A question, with comma', answer: 'A "quoted" answer\r\nnext line' }]);
});

test('detects TSV and preserves quotes inside an ordinary sentence', () => {
  assert.deepEqual(parseImport('What does "ciao" mean?\tHello, or goodbye.').cards, [{ question: 'What does "ciao" mean?', answer: 'Hello, or goodbye.' }]);
  assert.equal(parseImport('One\tTwo').format, 'tsv');
});

test('detects semicolon and pipe formats', () => {
  assert.equal(parseImport('Front;Back\nFirst;Second').format, 'semicolon');
  assert.equal(parseImport('First|Second').format, 'pipe');
});

test('ambiguous separators require a choice instead of silently splitting the wrong text', () => {
  assert.throws(() => parseImport('Question|Answer, with comma'), /More than one separator/);
  assert.deepEqual(parseImport('Question|Answer, with comma', 'pipe').cards, [{ question: 'Question', answer: 'Answer, with comma' }]);
});

test('header matching is exact and supports metadata columns', () => {
  assert.deepEqual(parseImport('What is the front?,A question').cards, [{ question: 'What is the front?', answer: 'A question' }]);
  const result = parseImport('id,back,front\n42,An answer,A question');
  assert.deepEqual(result.cards, [{ question: 'A question', answer: 'An answer' }]);
  assert.equal(result.warnings.length, 1);
});

test('JSON accepts supported field names and wrappers', () => {
  assert.deepEqual(parseImport('{"cards":[{"front":"Hello","back":"Ciao"},{"term":"Bye","definition":"Arrivederci"}]}').cards,
    [{ question: 'Hello', answer: 'Ciao' }, { question: 'Bye', answer: 'Arrivederci' }]);
  assert.deepEqual(parseImport('[["Front", "Back"]]').cards, [{ question: 'Front', answer: 'Back' }]);
});

test('Q/A blocks allow multiline content', () => {
  assert.deepEqual(parseImport('Q: First question\nmore question\nA: First answer\n\nQ: Second question\nA: Second answer').cards,
    [{ question: 'First question\nmore question', answer: 'First answer' }, { question: 'Second question', answer: 'Second answer' }]);
  assert.deepEqual(parseImport('Q: hello\tA: ciao').cards, [{ question: 'Q: hello', answer: 'A: ciao' }]);
});

test('invalid input fails as a whole instead of silently skipping cards', () => {
  assert.throws(() => parseImport('question,answer\nHello,'), /empty answer/);
  assert.throws(() => parseImport('Hello,Ciao,Bonjour', 'csv'), /3 columns/);
  assert.throws(() => parseImport('"Hello,Ciao', 'csv'), /closing quote/);
  assert.throws(() => parseImport('[{"question":"Hello","answer":42}]'), /must both be text/);
  assert.throws(() => parseImport('{"cards":42}'), /cards.*array/);
  assert.throws(() => parseImport('Q: missing answer', 'qa'), /missing an "A:"/);
});

test('limits are enforced before importing', () => {
  assert.throws(() => parseImport('a'.repeat(20001) + ',b'), /too long/);
  assert.throws(() => parseImport(Array.from({ length: 10001 }, () => 'a,b').join('\n')), /10,000/);
});

test('duplicate cards are kept with a warning', () => {
  const result = parseImport('a,b\na,b');
  assert.equal(result.cards.length, 2);
  assert.match(result.warnings[0], /1 duplicate card/);
});

test('CSV export roundtrips Unicode, quotes, commas and newlines', () => {
  const cards = [{ question: 'Caffè, per favore?', answer: '"Yes"\nCertamente.' }, { question: '=example', answer: '日本語' }];
  assert.deepEqual(parseImport(toCsv(cards)).cards, cards);
});
