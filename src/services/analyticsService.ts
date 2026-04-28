import { ref, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { PerformanceMetric } from '../types';

const LOCAL_METRICS_KEY = 'astra_metrics_cache';

export function subscribeToMetrics(callback: (metrics: PerformanceMetric[]) => void) {
    const metricsRef = ref(rtdb, 'performance_metrics');
    
    // Cache first
    const cached = localStorage.getItem(LOCAL_METRICS_KEY);
    if (cached) {
      try { callback(JSON.parse(cached)); } catch(e) {}
    }

    return onValue(metricsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            localStorage.setItem(LOCAL_METRICS_KEY, JSON.stringify([]));
            return;
        }
        const metrics = Object.entries(data).map(([id, val]: [string, any]) => ({ ...val, id } as PerformanceMetric));
        const sorted = metrics.sort((a, b) => a.date.localeCompare(b.date));
        
        localStorage.setItem(LOCAL_METRICS_KEY, JSON.stringify(sorted));
        callback(sorted);
    });
}

import { set } from 'firebase/database';

export async function updatePerformanceMetric(subsystemId: string, efficiency: number, riskScore: number) {
    const date = new Date().toISOString().split('T')[0]; // Daily metric
    const metricRef = ref(rtdb, `performance_metrics/${subsystemId}_${date}`);
    await set(metricRef, {
        subsystemId,
        efficiency,
        riskScore,
        date,
        timestamp: new Date().toISOString()
    });
}

