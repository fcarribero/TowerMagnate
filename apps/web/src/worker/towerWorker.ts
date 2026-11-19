import { createWorkerHost } from './workerHost';
import type { PageToWorker, WorkerToPage } from './workerMessages';

// The web tsconfig has the DOM lib, not WebWorker, so the worker scope is typed by hand.
const scope = self as unknown as {
  postMessage(message: WorkerToPage): void;
  onmessage: ((event: MessageEvent<PageToWorker>) => void) | null;
};

const host = createWorkerHost((m) => scope.postMessage(m));
scope.onmessage = (e) => void host.handle(e.data);
