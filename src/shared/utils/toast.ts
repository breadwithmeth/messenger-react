const TOAST_EVENT = 'app-toast';

type ToastDetail = {
  message: string;
};

export const emitToast = (message: string) => {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message } });
  window.dispatchEvent(event);
};

export const toastEvents = {
  name: TOAST_EVENT,
};
