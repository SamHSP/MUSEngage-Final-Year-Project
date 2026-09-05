const SERVICE_WORKER_PATH = '/service-worker.js';
const SERVICE_WORKER_SCOPE = '/';

const isLocalhost = () => {
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
};

const canUseServiceWorker = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.isSecureContext || isLocalhost());

async function waitForActivation(registration: ServiceWorkerRegistration) {
  if (registration.active) {
    return;
  }

  const worker = registration.installing || registration.waiting;
  if (!worker) {
    return;
  }

  await new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', handleStateChange);
        resolve();
      }
    };

    worker.addEventListener('statechange', handleStateChange);
  });
}

async function register() {
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
      scope: SERVICE_WORKER_SCOPE,
    });

    if (import.meta.env.DEV) {
      console.info('Service worker registered:', registration.scope);
    }

    await waitForActivation(registration);

    if (import.meta.env.DEV) {
      console.info('Service worker ready');
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Service worker registration failed:', error);
    }
  }
}

function onWindowLoad() {
  window.removeEventListener('load', onWindowLoad);
  void register();
}

const FLAG = '__muse_sw_registration_started__';

export function registerServiceWorker() {
  if (!canUseServiceWorker()) {
    return;
  }

  const globalScope = window as typeof window & Record<string, unknown>;
  if (globalScope[FLAG]) {
    return;
  }

  globalScope[FLAG] = true;

  if (document.readyState === 'complete') {
    void register();
    return;
  }

  window.addEventListener('load', onWindowLoad);
}
