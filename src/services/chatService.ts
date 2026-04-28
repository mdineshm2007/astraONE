import { ref, push, set, onValue, query, limitToLast, remove } from 'firebase/database';
import { rtdb } from '../firebase';

export interface ChatMessage {
  id: string;
  channel: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  createdAt: any;
}

export function subscribeToChat(channel: string, callback: (messages: ChatMessage[]) => void) {
  const chatRef = ref(rtdb, 'chats');
  const q = query(chatRef, limitToLast(50));

  return onValue(q, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const messages = Object.entries(data)
      .map(([id, val]: [string, any]) => ({ id, ...val } as ChatMessage))
      .filter(m => m.channel === channel)
      .sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime());
    
    callback(messages);
  });
}

export async function sendMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>) {
  const chatRef = ref(rtdb, 'chats');
  const newMsgRef = push(chatRef);
  return set(newMsgRef, {
    ...msg,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteMessage(id: string) {
  const msgRef = ref(rtdb, `chats/${id}`);
  return remove(msgRef);
}

