import { useState, type DragEvent } from 'react';
import { objectCatalog, type CatalogItem } from '../../data/objectCatalog';
import type { LayoutObjectType } from '../../types/layout';
import { useLayoutStore } from '../../store/layoutStore';
import { Icon } from '../icons/Icon';
import { PlanSymbolPreview } from './PlanSymbol';
import { formatMillimeters } from '../../utils/coordinates';

function LibrarySection({
  title,
  items,
}: {
  title: string;
  items: CatalogItem[];
}) {
  const addObject = useLayoutStore((state) => state.addObject);
  const unit = useLayoutStore((state) => state.project.settings.unit);
  const beginDrag = (event: DragEvent<HTMLButtonElement>, type: LayoutObjectType) => {
    event.dataTransfer.setData('application/x-aiad-object', type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <section className="library-section">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="panel-hint">{items.length}개 · 클릭 또는 드래그</span>
      </div>
      <div className="library-grid">
        {items.map((item) => (
            <button
              className="library-item"
              draggable
              key={item.type}
              onDragStart={(event) => beginDrag(event, item.type)}
              onClick={() => addObject(item.type)}
              data-object-type={item.type}
            >
              <span className="library-item__icon"><PlanSymbolPreview type={item.type} width={item.width} depth={item.depth} /></span>
              <span className="library-item__text">
                <strong>{item.label}</strong>
                <small>{formatMillimeters(item.width, unit)} × {formatMillimeters(item.depth, unit)}</small>
              </span>
            </button>
          ))}
      </div>
    </section>
  );
}

export function ObjectLibrary() {
  const [category, setCategory] = useState<'all' | 'space' | 'furniture' | 'facility'>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const visibleItems = objectCatalog.filter((item) =>
    (category === 'all' || item.category === category)
    && (!normalizedQuery || item.label.toLocaleLowerCase('ko-KR').includes(normalizedQuery)),
  );
  const sections = ([['space', '공간 요소'], ['facility', '시설'], ['furniture', '가구']] as const)
    .map(([value, label]) => ({ value, label, items: visibleItems.filter((item) => item.category === value) }))
    .filter((section) => section.items.length > 0);
  const categoryTabs = ([['all', '전체'], ['space', '공간'], ['furniture', '가구'], ['facility', '시설']] as const);
  const moveCategoryFocus = (current: typeof category, direction: -1 | 1) => {
    const currentIndex = categoryTabs.findIndex(([value]) => value === current);
    const next = categoryTabs[(currentIndex + direction + categoryTabs.length) % categoryTabs.length][0];
    setCategory(next);
    window.requestAnimationFrame(() => document.getElementById(`library-tab-${next}`)?.focus());
  };
  return (
    <aside id="object-library-panel" className="side-panel side-panel--left" aria-label="객체 라이브러리">
      <div className="side-panel-header side-panel-header--left">
        <div><h2>객체 라이브러리</h2><span>공간에 추가할 항목을 선택합니다.</span></div>
      </div>
      <div className="library-search" role="search">
        <Icon name="search" size={16} />
        <input aria-label="객체 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름으로 객체 검색" autoComplete="off" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기"><Icon name="close" size={14} /></button>}
      </div>
      <div className="library-category-tabs" role="tablist" aria-label="객체 종류 필터">{categoryTabs.map(([value, label]) => <button id={`library-tab-${value}`} key={value} type="button" role="tab" tabIndex={category === value ? 0 : -1} aria-selected={category === value} aria-controls="object-library-results" className={category === value ? 'is-active' : ''} onClick={() => setCategory(value)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') moveCategoryFocus(value, -1); if (event.key === 'ArrowRight') moveCategoryFocus(value, 1); }}>{label}</button>)}</div>
      <div id="object-library-results" role="tabpanel" aria-live="polite" aria-label={`${visibleItems.length}개 객체`}>
        {sections.map((section) => <LibrarySection key={section.value} title={section.label} items={section.items} />)}
        {visibleItems.length === 0 && <div className="library-empty" role="status"><strong>검색 결과가 없습니다.</strong><p>다른 이름이나 종류를 확인해 주세요.</p><button type="button" onClick={() => { setQuery(''); setCategory('all'); }}>전체 객체 보기</button></div>}
      </div>
    </aside>
  );
}
