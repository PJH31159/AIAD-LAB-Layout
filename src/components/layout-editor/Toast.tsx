import { useEffect } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { Icon } from '../icons/Icon';

export function Toast() {
  const toast = useLayoutStore((state) => state.toast);
  const showToast = useLayoutStore((state) => state.showToast);
  const requiresAttention = Boolean(toast && /실패|부족|올바르지|지원하지|못했습니다/.test(toast));
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => showToast(null), requiresAttention ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [requiresAttention, showToast, toast]);
  return (
    <div className={`toast ${toast ? 'is-visible' : ''} ${requiresAttention ? 'is-error' : ''}`} role={requiresAttention ? 'alert' : 'status'} aria-live={requiresAttention ? 'assertive' : 'polite'} aria-atomic="true">
      <span>{toast}</span>
      {toast && <button type="button" onClick={() => showToast(null)} title="알림 닫기" aria-label="알림 닫기"><Icon name="close" size={15} /></button>}
    </div>
  );
}
