import { ref as rtdbRef, onValue, update } from 'firebase/database';
import { ref as storageRef, listAll, getDownloadURL } from 'firebase/storage';
import { rtdb, storage } from '../firebase';

export interface StorageReport {
  name: string;
  path: string;
  url: string;
  timeCreated: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'SUCCESS' | 'ERROR' | 'INFO';
  timestamp: string;
  read: boolean;
  link?: string;
}

export async function getArchivedReports(year: string, monthRange: string): Promise<StorageReport[]> {
  const folderRef = storageRef(storage, `captain_reports/${year}/${monthRange}`);
  try {
    const res = await listAll(folderRef);
    const reports = await Promise.all(res.items.map(async (itemRef) => {
      const url = await getDownloadURL(itemRef);
      return {
        name: itemRef.name,
        path: itemRef.fullPath,
        url,
        timeCreated: new Date().toISOString()
      };
    }));
    return reports;
  } catch (error) {
    console.error("Error fetching reports:", error);
    return [];
  }
}

export function subscribeToNotifications(uid: string, callback: (notifications: Notification[]) => void) {
  const notifRef = rtdbRef(rtdb, `notifications/${uid}`);
  
  return onValue(notifRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const notifs = Object.entries(data)
      .map(([id, val]: [string, any]) => ({ id, ...val } as Notification))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(notifs);
  });
}

export async function markNotificationRead(uid: string, notifId: string) {
  const notifPath = `notifications/${uid}/${notifId}`;
  await update(rtdbRef(rtdb), { [`${notifPath}/read`]: true });
}
