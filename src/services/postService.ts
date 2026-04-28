import { ref, push, set, remove, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { Post } from '../types';

const LOCAL_POSTS_KEY = 'astra_posts_cache';

export function subscribeToPosts(type: 'GENERAL' | 'TEAM', teamId: string | null, callback: (posts: Post[]) => void) {
  const postsRef = ref(rtdb, 'posts');
  
  // Cache first
  const cached = localStorage.getItem(LOCAL_POSTS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      let filtered = parsed;
      if (type === 'GENERAL') {
        filtered = parsed.filter((p: any) => p.type === 'GENERAL');
      } else {
        filtered = parsed.filter((p: any) => p.type === 'TEAM' && p.teamId === teamId);
      }
      callback(filtered);
    } catch (e) {}
  }

  return onValue(postsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify([]));
      return;
    }
    const posts = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val } as Post));
    
    // Save to cache
    localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
    
    let filtered = posts;
    if (type === 'GENERAL') {
      filtered = posts.filter(p => p.type === 'GENERAL');
    } else {
      filtered = posts.filter(p => p.type === 'TEAM' && p.teamId === teamId);
    }
    callback(filtered.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()));
  });
}

export async function createPost(post: Omit<Post, 'id' | 'createdAt'>) {
  const postsRef = ref(rtdb, 'posts');
  const newPostRef = push(postsRef);
  const cleanPost = JSON.parse(JSON.stringify(post));
  return set(newPostRef, {
    ...cleanPost,
    createdAt: new Date().toISOString()
  });
}

export async function deletePost(id: string) {
  const postRef = ref(rtdb, `posts/${id}`);
  return remove(postRef);
}

