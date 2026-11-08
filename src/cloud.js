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
