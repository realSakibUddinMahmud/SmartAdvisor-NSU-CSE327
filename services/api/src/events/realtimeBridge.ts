import { notifierService } from '../services/notifier';
import { backendStore } from '../store/backendStore';
import { redisBus } from './redisBus';
import { broadcastSseEvent } from './sseHub';
import { broadcastWsEvent } from './wsHub';

let bridgeInitialized = false;

export function initRealtimeBridge(): void {
  if (bridgeInitialized) {
    return;
  }
  bridgeInitialized = true;

  redisBus.subscribeSyncEvents((event) => {
    broadcastSseEvent(event);
    broadcastWsEvent(event);
  });

  backendStore.subscribe((state) => {
    void redisBus.publishSyncEvent({
      type: 'SYNC_UPDATE',
      studentId: state.student.id,
      state,
      timestamp: Date.now()
    });

    if (state.rdsFallbackPrompt && !state.rdsFallbackPrompt.resolved) {
      void redisBus.publishSyncEvent({
        type: 'RDS_FALLBACK',
        studentId: state.student.id,
        state,
        payload: state.rdsFallbackPrompt,
        timestamp: Date.now()
      });
    }
  });

  // Never query PG synchronously inside setOnLogRecorded because PG TX may still be open.
  notifierService.setOnLogRecorded((item) => {
    void redisBus.publishSyncEvent({
      type: 'NOTIFICATION',
      studentId: item.studentId,
      payload: item,
      timestamp: Date.now()
    });
  });
}
