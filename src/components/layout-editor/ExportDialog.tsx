import { useEffect, useState } from 'react';
import type { ExportOptions } from '../../types/layout';
import { Icon } from '../icons/Icon';
import { DialogHeader, ModalFrame } from './ModalFrame';

export function ExportDialog({
  open,
  onClose,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
}) {
  const [options, setOptions] = useState<ExportOptions>({
    showGrid: true,
    showLabels: true,
    showDimensions: false,
    includeBackground: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  if (!open) return null;
  const toggle = (key: keyof ExportOptions) =>
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onExport(options);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PNG 내보내기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame open={open} onClose={onClose} labelledBy="export-title" className="app-dialog export-dialog">
        <DialogHeader titleId="export-title" title="PNG 내보내기" description="저장할 도면 요소를 선택합니다." />
        <div className="dialog-body"><div className="export-preview"><Icon name="image" size={34} /><span>배치 영역만 고해상도로 저장합니다.</span></div>
        <div className="export-options">
          {([
            ['showGrid', '격자 포함', '실제 mm 간격의 보조 격자를 표시합니다.'],
            ['showLabels', '객체 이름 포함', '각 가구와 공간 요소의 이름을 표시합니다.'],
            ['showDimensions', '치수 포함', '각 객체의 너비와 깊이를 표시합니다.'],
            ['includeBackground', '배경 포함', '캔버스 바깥 배경색을 포함합니다.'],
          ] as const).map(([key, label, description]) => (
            <label className="export-option" key={key}>
              <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
              <span><strong>{label}</strong><small>{description}</small></span>
            </label>
          ))}
        </div>{error && <p className="dialog-error" role="alert">{error}</p>}</div>
        <footer className="dialog-footer"><button data-autofocus onClick={onClose}>취소</button><button className="button-primary" onClick={submit} disabled={busy}>{busy ? <span className="button-loader" aria-hidden="true" /> : <Icon name="download" />}{busy ? '생성 중…' : 'PNG 저장'}</button></footer>
    </ModalFrame>
  );
}
