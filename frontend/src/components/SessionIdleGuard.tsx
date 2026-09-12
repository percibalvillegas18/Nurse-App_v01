import React, { useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { useAuth } from '../hooks/useAuth';

/**
 * Session idle guard (HIPAA: automatic idle logoff <= 15 minutes).
 *
 * Tracks local activity (mouse/keyboard/scroll/touch) and signs the user out
 * after inactivity. It is a UX convenience only - the backend JwtStrategy is
 * the authoritative enforcement (session idle/expiry/absolute windows), so a
 * missed client timer can never extend a session.
 *
 * The threshold mirrors the backend SESSION_IDLE_TIMEOUT (default 900s);
 * override with VITE_SESSION_IDLE_TIMEOUT (seconds) if the backend differs.
 */
const DEFAULT_IDLE_SECONDS = 15 * 60;
const WARN_BEFORE_SECONDS = 60;

function idleSeconds(): number {
  const raw = (import.meta as any).env?.VITE_SESSION_IDLE_TIMEOUT;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_SECONDS;
}

export const SessionIdleGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const idleMs = idleSeconds() * 1000;
    const warnAtMs = idleMs - WARN_BEFORE_SECONDS * 1000;
    lastActivityRef.current = Date.now();
    loggingOutRef.current = false;
    setWarningOpen(false);

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      setWarningOpen(false);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      if (loggingOutRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleMs) {
        loggingOutRef.current = true;
        void logout();
      } else if (warnAtMs > 0 && elapsed >= warnAtMs) {
        setWarningOpen(true);
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [isAuthenticated, logout]);

  return (
    <>
      {children}
      <Modal
        title="You are about to be signed out"
        open={warningOpen}
        closable={false}
        maskClosable={false}
        okText="Stay signed in"
        cancelButtonProps={{ style: { display: 'none' } }}
        onOk={() => {
          lastActivityRef.current = Date.now();
          setWarningOpen(false);
        }}
      >
        <p>
          You have been inactive. For your security you will be signed out automatically unless
          you continue using the application.
        </p>
      </Modal>
    </>
  );
};
