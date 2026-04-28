import { ref, onValue, set, query, limitToLast } from 'firebase/database';
import { rtdb } from '../firebase';
import { Schedule } from '../types';

export function subscribeToSchedule(callback: (schedule: Schedule | null) => void) {
    const schedulesRef = ref(rtdb, 'schedules');
    const q = query(schedulesRef, limitToLast(1));

    return onValue(q, (snapshot) => {
        if (!snapshot.exists()) {
            callback(null);
        } else {
            const data = snapshot.val();
            const id = Object.keys(data)[0];
            callback({ ...data[id], id } as Schedule);
        }
    });
}

export async function saveSchedule(schedule: Schedule) {
    const scheduleRef = ref(rtdb, `schedules/${schedule.id}`);
    return set(scheduleRef, schedule);
}

