import type { LayoutObject, LayoutWarning } from '../../types/layout';
import { Icon } from '../icons/Icon';
import { DialogHeader, ModalFrame } from './ModalFrame';

export function WarningsDialog({
  open,
  warnings,
  objects,
  onClose,
  onSelect,
}: {
  open: boolean;
  warnings: LayoutWarning[];
  objects: LayoutObject[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <ModalFrame open={open} onClose={onClose} labelledBy="warnings-title" className="app-dialog warnings-dialog">
      <DialogHeader titleId="warnings-title" title={`배치 경고 ${warnings.length}건`} description="문제가 있는 객체를 선택하면 캔버스 중앙으로 이동합니다." onClose={onClose} autofocusClose />
      <div className="dialog-body warning-dialog-body">
        {warnings.length === 0 ? (
          <div className="dialog-empty"><span><Icon name="brand" size={28} /></span><strong>현재 배치에 문제가 없습니다.</strong><p>객체를 이동하면 충돌 상태가 실시간으로 갱신됩니다.</p></div>
        ) : (
          <ul className="global-warning-list">
            {warnings.map((warning) => {
              const target = objects.find((object) => warning.objectIds.includes(object.id));
              const related = warning.objectIds.map((id) => objects.find((object) => object.id === id)).filter((object): object is LayoutObject => Boolean(object));
              return <li key={warning.id}><button className="warning-main-button" onClick={() => target && onSelect(target.id)} disabled={!target}><span className="warning-list-icon"><Icon name="warning" /></span><span><strong>{warning.message}</strong><small>{warning.kind === 'outside' ? '외곽 경계' : warning.kind === 'column-overlap' ? '구조물 충돌' : warning.kind === 'aisle' ? '통로 폭 부족' : '가구 충돌'}</small></span><Icon name="chevron-right" /></button>{related.length > 1 && <div className="warning-related-targets">{related.map((object) => <button key={object.id} onClick={() => onSelect(object.id)}>{object.name} 선택</button>)}</div>}</li>;
            })}
          </ul>
        )}
      </div>
    </ModalFrame>
  );
}
