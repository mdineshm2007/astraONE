import { ref, push, set, onValue, remove } from 'firebase/database';
import { rtdb } from '../firebase';
import { Document as DocsType } from '../types';

export function subscribeToDocuments(subsystemId: string | null, callback: (docs: DocsType[]) => void) {
    const docsRef = ref(rtdb, 'documents');

    return onValue(docsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }
        let docs = Object.entries(data).map(([id, val]: [string, any]) => ({ ...val, id } as DocsType));
        if (subsystemId) {
            docs = docs.filter(d => d.subsystem === subsystemId);
        }
        docs.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
        callback(docs);
    });
}

export async function addDocument(docData: Omit<DocsType, 'id' | 'createdAt'>) {
    const docsRef = ref(rtdb, 'documents');
    const newDocRef = push(docsRef);
    return set(newDocRef, {
        ...docData,
        createdAt: new Date().toISOString()
    });
}

export async function deleteDocument(docId: string) {
    return remove(ref(rtdb, `documents/${docId}`));
}

