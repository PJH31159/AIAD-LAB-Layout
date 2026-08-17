import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';

export function DialogHeader({
  titleId,
  title,
  description,
  onClose,
  autofocusClose = false,
}: {
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  autofocusClose?: boolean;
}) {
  return (
    <header className="dialog-header">
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {onClose && (
        <button
          className="dialog-close-button"
          type="button"
          onClick={onClose}
          title="닫기"
          aria-label="닫기"
          {...(autofocusClose ? { 'data-autofocus': true } : {})}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </header>
  );
}

export function ModalFrame({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (dialog && !dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (dialog?.open) dialog.close();
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-labelledby={labelledBy}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}
