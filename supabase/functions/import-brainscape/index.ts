import { parseHTML } from 'npm:linkedom@0.18.12';
import { normalizeBrainscapePackUrl } from '../../../src/brainscape.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_CARDS = 10_000;
const MAX_FIELD_LENGTH = 20_000;
const BLOCK_TAGS = new Set(['article', 'blockquote', 'div', 'li', 'p', 'section', 'table', 'tr']);

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function readLimitedBody(response: Response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_PAGE_BYTES) {
    throw new Error('The Brainscape pack page is too large to import.');
  }
  if (!response.body) throw new Error('Brainscape returned an empty pack page.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAGE_BYTES) {
        await reader.cancel();
        throw new Error('The Brainscape pack page is too large to import.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function readableText(node: Node): string {
  let text = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      text += child.textContent || '';
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const tag = element.localName.toLowerCase();
    if (tag === 'br') {
      text += '\n';
      continue;
    }
    if (tag === 'img') {
      text += element.getAttribute('alt') || '';
      continue;
    }
    if (tag === 'script' || tag === 'style') continue;
    const block = BLOCK_TAGS.has(tag);
    if (block && text && !text.endsWith('\n')) text += '\n';
    text += readableText(element);
    if (block && !text.endsWith('\n')) text += '\n';
  }
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsePack(html: string) {
  const { document } = parseHTML(html);
  const rows = [...document.querySelectorAll('.flashcard-row')];
  if (!rows.length) throw new Error('No public text flashcards were found at that link.');
  if (rows.length > MAX_CARDS) throw new Error('This pack has more than 10,000 cards. Import a smaller pack.');
  let hasMedia = false;
  const cards = rows.map((row, index) => {
    const questionField = row.querySelector('.question-contents .preview-html');
    const answerField = row.querySelector('.answer-contents .preview-html');
    if (!questionField || !answerField) {
      throw new Error(`Card ${index + 1} could not be read from this pack.`);
    }
    if (questionField.querySelector('img, audio, video') || answerField.querySelector('img, audio, video')) {
      hasMedia = true;
    }
    const question = readableText(questionField);
    const answer = readableText(answerField);
    if (!question || !answer) {
      throw new Error(`Card ${index + 1} has no readable text on one side. Image and audio content cannot be imported.`);
    }
    if (question.length > MAX_FIELD_LENGTH || answer.length > MAX_FIELD_LENGTH) {
      throw new Error(`Card ${index + 1} is too long to import.`);
    }
    return { question, answer };
  });
  const title = readableText(document.querySelector('h1') || document.querySelector('title') || document.body)
    .replace(/\s+Flashcards\s*$/i, '')
    .slice(0, 200);
  return {
    title: title || 'Brainscape pack',
    cards,
    warnings: hasMedia ? ['Images and audio are not imported; only card text is included.'] : [],
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Use POST to import a Brainscape pack.' }, 405);
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return respond({ error: 'The import request is too large.' }, 413);
  }

  let url: string;
  try {
    const body = await request.json();
    url = normalizeBrainscapePackUrl(body?.url);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : 'The pack URL is invalid.' }, 400);
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
      return respond({ error: 'Brainscape did not return a public pack page. Check the link and try again.' }, 422);
    }
    const imported = parsePack(await readLimitedBody(response));
    return respond(imported);
  } catch (error) {
    if (error instanceof Error && /too large|No public|more than 10,000|could not be read|no readable text|too long/.test(error.message)) {
      return respond({ error: error.message }, 422);
    }
    console.error('Brainscape pack import failed:', error);
    return respond({ error: 'Could not load that Brainscape pack. Check the link and your connection, then try again.' }, 502);
  }
});
