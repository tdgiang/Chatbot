"use client";

import * as React from "react";

type ToastVariant = "default" | "destructive";

interface ToastProps {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ToastState {
  toasts: ToastProps[];
}

type Action =
  | { type: "ADD_TOAST"; toast: ToastProps }
  | { type: "REMOVE_TOAST"; toastId: string }
  | { type: "UPDATE_TOAST"; toast: Partial<ToastProps> & { id: string } };

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 3000;

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
}

function reducer(state: ToastState, action: Action): ToastState {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "REMOVE_TOAST":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
  }
}

const listeners: Array<React.Dispatch<Action>> = [];
let memoryState: ToastState = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(action));
}

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

function toast(opts: ToastOptions) {
  const id = genId();
  const newToast: ToastProps = {
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        dispatch({ type: "REMOVE_TOAST", toastId: id });
      }
    },
    ...opts,
  };
  dispatch({ type: "ADD_TOAST", toast: newToast });
  // auto remove
  setTimeout(() => {
    dispatch({ type: "REMOVE_TOAST", toastId: id });
  }, TOAST_REMOVE_DELAY);
  return id;
}

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    const listener: React.Dispatch<Action> = () => {
      setState({ ...memoryState });
    };
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId: string) =>
      dispatch({ type: "REMOVE_TOAST", toastId }),
  };
}

export { useToast, toast };
export type { ToastProps };
