import { normalizeBrainscapePackUrl } from './brainscape.js';
import { validateLibrary } from './data.js';

// The library is only downloaded when cloud accounts are configured.
// Local study, imports, and editing work without any third-party JavaScript.
const SUPABASE_SDK_URL = 'https://esm.sh/@supabase/supabase-js@2.57.4';
let clientPromise;

function cloudConfig() {
  const config = globalThis.APP_CONFIG || {};
  return {
    url: String(config.supabaseUrl || '').trim().replace(/\/$/, ''),
    key: String(config.supabaseAnonKey || '').trim(),
  };
}

function normalizeCourseProgress(progress) {
  if (!progress || typeof progress !== 'object' ||
      !Number.isInteger(progress.confidence) || progress.confidence < 0 || progress.confidence > 5 ||
      !Number.isInteger(progress.reviewCount) || progress.reviewCount < 0 || progress.reviewCount > 1_000_000 ||
      typeof progress.starred !== 'boolean') return null;
  const validTime = value => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (!validTime(progress.dueAt) || !validTime(progress.reviewedAt)) return null;
  return {
    confidence: progress.confidence,
    dueAt: progress.dueAt ? new Date(progress.dueAt).toISOString() : null,
    reviewedAt: progress.reviewedAt ? new Date(progress.reviewedAt).toISOString() : null,
    reviewCount: progress.reviewCount,
    starred: progress.starred,
  };
}

export function isCloudConfigured() {
  const { url, key } = cloudConfig();
  if (!url || !key) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export async function importBrainscapePack(input) {
  const packUrl = normalizeBrainscapePackUrl(input);
  const { url, key } = cloudConfig();
  if (!url || !key) {
    throw new Error('Brainscape URL import needs the Supabase Edge Function. See the setup instructions in the README.');
  }
  let response;
  try {
    response = await fetch(`${url}/functions/v1/import-brainscape`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: packUrl }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach the Brainscape import service. Check your connection and try again.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The Brainscape import service returned an invalid response.'); }
  if (!response.ok) {
    throw new Error(typeof result?.error === 'string' ? result.error : 'Could not import that Brainscape pack.');
  }
  if (!result || typeof result.title !== 'string' || !Array.isArray(result.cards) ||
      result.cards.some(card => !card || typeof card.question !== 'string' || typeof card.answer !== 'string')) {
    throw new Error('The Brainscape import service returned invalid card data.');
  }
  return {
    title: result.title,
    cards: result.cards,
    warnings: Array.isArray(result.warnings) && result.warnings.every(warning => typeof warning === 'string')
      ? result.warnings : [],
  };
}

export async function getCloudClient() {
  if (!isCloudConfigured()) {
    throw new Error('Cloud accounts are not configured yet. Add your Supabase project URL and public key in config.js.');
  }
  if (!clientPromise) {
    clientPromise = import(SUPABASE_SDK_URL)
      .then(({ createClient }) => {
        const { url, key } = cloudConfig();
        return createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'implicit',
          },
        });
      })
      .catch(() => {
        clientPromise = undefined;
        throw new Error('Could not connect to the account service. Check your connection and try again.');
      });
  }
  return clientPromise;
}

// Preserve the repository path on GitHub Pages, e.g. /flashcards/.
export function getAuthRedirectUrl() {
  const redirect = new URL('./', globalThis.location.href);
  redirect.search = '';
  redirect.hash = '';
  return redirect.href;
}

export async function loadCloudLibrary(userId) {
  if (!userId) throw new Error('Sign in before loading your library.');
  const client = await getCloudClient();
  const { data, error } = await client
    .from('libraries')
    .select('data')
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load your library: ${error.message}`);
  return data?.data ?? null;
}

export async function loadPublicCourses() {
  const client = await getCloudClient();
  const { data, error } = await client
    .from('public_courses')
    .select('owner_id,course_id,data')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load public courses: ${error.message}`);
  return (data || []).map(row => {
    const library = validateLibrary({
      version: 1,
      classes: [row.data],
      activity: [],
      settings: { dailyGoal: 20 },
    });
    const course = library.classes[0];
    course.id = `${row.owner_id}:${row.course_id}`;
    return { ownerId: row.owner_id, course };
  });
}

export async function syncPublicCourseProgress(userId, courseId, localProgress) {
  if (!userId) throw new Error('Sign in before syncing public course progress.');
  if (typeof courseId !== 'string' || !courseId || !Array.isArray(localProgress)) {
    throw new Error('Public course progress is invalid and could not be synced.');
  }
  const client = await getCloudClient();
  const { data, error } = await client
    .from('course_progress')
    .select('card_id,progress,updated_at')
    .eq('user_id', userId)
    .eq('course_id', courseId);
  if (error) throw new Error(`Could not load your course progress: ${error.message}`);
  const merged = new Map();
  for (const row of data || []) {
    const progress = normalizeCourseProgress(row.progress);
    if (typeof row.card_id !== 'string' || !row.card_id || !progress || !Number.isFinite(Date.parse(row.updated_at))) {
      throw new Error('Your saved course progress has invalid data and was not changed.');
    }
    merged.set(row.card_id, { cardId: row.card_id, progress, updatedAt: new Date(row.updated_at).toISOString() });
  }
  const uploads = [];
  for (const item of localProgress) {
    if (!item || typeof item.cardId !== 'string' || !item.cardId ||
        !item.progress || typeof item.progress !== 'object' ||
        !Number.isFinite(Date.parse(item.updatedAt))) {
      throw new Error('Public course progress is invalid and could not be synced.');
    }
    const progress = normalizeCourseProgress(item.progress);
    if (!progress) throw new Error('Public course progress is invalid and could not be synced.');
    const saved = merged.get(item.cardId);
    const updatedAt = new Date(item.updatedAt).toISOString();
    if (!saved || Date.parse(updatedAt) > Date.parse(saved.updatedAt) ||
        (Date.parse(updatedAt) === Date.parse(saved.updatedAt) &&
            JSON.stringify(progress) !== JSON.stringify(saved.progress))) {
      uploads.push({
        user_id: userId,
        course_id: courseId,
        card_id: item.cardId,
        progress,
        updated_at: updatedAt,
      });
      merged.set(item.cardId, { cardId: item.cardId, progress, updatedAt });
    }
  }
  if (uploads.length) {
    const { error: saveError } = await client
      .from('course_progress')
      .upsert(uploads, { onConflict: 'user_id,course_id,card_id' });
    if (saveError) throw new Error(`Could not save your course progress: ${saveError.message}`);
  }
  return [...merged.values()];
}

export async function saveCloudLibrary(userId, library) {
  if (!userId) throw new Error('Sign in before saving your library.');
  if (!library || typeof library !== 'object' || !Array.isArray(library.classes)) {
    throw new Error('Your library could not be saved because its format is invalid.');
  }
  const client = await getCloudClient();
  const { error } = await client
    .from('libraries')
    .upsert({ owner_id: userId, data: library }, { onConflict: 'owner_id' });
  if (error) throw new Error(`Could not save your library: ${error.message}`);
}
