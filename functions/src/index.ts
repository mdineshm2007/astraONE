import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { processArchiveJob } from './archiveEngine';

admin.initializeApp();

// 1. Scheduled function every 60 days
export const scheduledArchiveExport = functions.pubsub.schedule('every 60 days').onRun(async (context) => {
    try {
        const timestamp = new Date();
        const jobId = `auto_${timestamp.getTime()}`;
        console.log(`Starting scheduled archive job: ${jobId}`);
        await processArchiveJob(jobId, timestamp);
    } catch (error: any) {
        console.error("Scheduled Archive Failed:", error);
        await admin.firestore().collection('failed_exports').add({
            timestamp: new Date().toISOString(),
            error: error.message || String(error),
            type: 'scheduled'
        });
    }
});

// 2. Retry failed exports
export const retryExport = functions.firestore.document('failed_exports/{jobId}').onCreate(async (snap, context) => {
    // Wait 10 minutes then retry (simulated by delaying execution or simpler: just process immediately for demo)
    console.log(`Retrying job from failure: ${context.params.jobId}`);
    try {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Simulating delay
        const timestamp = new Date();
        await processArchiveJob(`retry_${context.params.jobId}`, timestamp);
        // Delete failure record if success
        await snap.ref.delete();
    } catch (error: any) {
        console.error("Retry also failed:", error);
        // Alert captain
        const usersSnap = await admin.firestore().collection('users').where('role', '==', 'CAPTAIN').get();
        const batch = admin.firestore().batch();
        usersSnap.docs.forEach(userDoc => {
            batch.set(admin.firestore().collection(`notifications/${userDoc.id}/items`).doc(), {
                title: "Archive Retry Failed",
                message: "Archive export failed after retry. Manual review required.",
                type: "ERROR",
                timestamp: new Date().toISOString(),
                read: false,
                link: "storage"
            });
        });
        await batch.commit();
    }
});

// 3. Manual Callable Function
export const manualArchiveExport = functions.https.onCall(async (data, context) => {
    // Note: In firebase-functions v1, `context.auth` holds user info.
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'CAPTAIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only Captains can trigger manual export.');
    }

    try {
        const timestamp = new Date();
        const jobId = `manual_${timestamp.getTime()}`;
        const result = await processArchiveJob(jobId, timestamp);
        return result;
    } catch (error: any) {
        console.error("Manual Archive Failed:", error);
        throw new functions.https.HttpsError('internal', error.message || 'Export failed');
    }
});
