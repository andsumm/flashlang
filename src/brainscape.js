/** Accept only public Brainscape flashcard pack URLs. */
export function normalizeBrainscapePackUrl(input) {
  if (typeof input !== 'string' || input.length > 2_048) {
    throw new Error('Paste a valid public Brainscape pack URL.');
  }
  let url;
  try { url = new URL(input.trim()); }
  catch { throw new Error('Paste a valid public Brainscape pack URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.brainscape.com' ||
      url.username || url.password || url.port ||
      !/^\/flashcards\/[a-z0-9][a-z0-9-]*\/packs\/\d+\/?$/i.test(url.pathname)) {
    throw new Error('Use a public Brainscape flashcard pack link, such as brainscape.com/flashcards/.../packs/123.');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.href;
}
