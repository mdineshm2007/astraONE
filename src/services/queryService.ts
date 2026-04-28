import { ref, push, set, update, remove, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { Query, UserProfile } from '../types';

// Per spec: ONLY CAPTAIN can see all queries + who raised them.
// Non-captains can only see their own queries.
const LOCAL_QUERIES_KEY = 'astra_queries_cache';

export function subscribeToQueries(profile: UserProfile, callback: (queries: Query[]) => void) {
  const queriesRef = ref(rtdb, 'queries');
  
  // Cache first
  const cached = localStorage.getItem(LOCAL_QUERIES_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      let filtered = parsed;
      if (profile.role !== 'CAPTAIN') {
        filtered = parsed.filter((q: any) => q.authorId === profile.uid);
      }
      callback(filtered);
    } catch (e) {}
  }

  return onValue(queriesRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      localStorage.setItem(LOCAL_QUERIES_KEY, JSON.stringify([]));
      return;
    }
    const queries = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val } as Query));
    
    // Save to cache
    localStorage.setItem(LOCAL_QUERIES_KEY, JSON.stringify(queries));
    
    // Filtering
    let filtered = queries;
    if (profile.role !== 'CAPTAIN') {
      filtered = queries.filter(q => q.authorId === profile.uid);
    }

    callback(filtered.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()));
  }, (err) => {
    console.error('subscribeToQueries error:', err);
  });
}

export async function createQuery(queryData: Omit<Query, 'id' | 'createdAt'>) {
  const queriesRef = ref(rtdb, 'queries');
  const newQueryRef = push(queriesRef);
  const cleanQuery = JSON.parse(JSON.stringify(queryData));
  return set(newQueryRef, {
    ...cleanQuery,
    createdAt: new Date().toISOString(),
  });
}

export async function resolveQuery(id: string) {
  const queryRef = ref(rtdb, `queries/${id}`);
  return update(queryRef, { status: 'RESOLVED' });
}

export async function deleteQuery(id: string) {
  const queryRef = ref(rtdb, `queries/${id}`);
  return remove(queryRef);
}

