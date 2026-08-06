# v1 → v2 데이터 마이그레이션

## 자동 마이그레이션

orientation 필드가 없는 JSON 또는 `aiad-lab-layout-v1` LocalStorage 데이터는 구버전으로 인식합니다.

1. 원본 JSON 문자열을 `aiad-import-backup-*` 또는 `aiad-lab-layout-v1-backup-*` LocalStorage 키로 백업합니다.
2. 사용자에게 세로형 데이터를 왼쪽으로 90도 회전할지 묻습니다.
3. 동의하면 모든 외곽선 꼭짓점, 유리벽 끝점, 문, 구조물, 가구 중심점을 동일한 회전 행렬로 변환합니다.
4. 변환된 전체 좌표의 최소 X/Y를 빼 원점을 정규화합니다.
5. 객체 회전각을 함께 변경하고 `orientation`, `spaces`, `glassWalls`, `targetCounts`, v2 설정을 채웁니다.

## 타입 대응

- `desk` → `underDesk`
- `desk2` → `gradDesk`
- `chair` → `underChair`
- `table` → `meetingTable`

알 수 없는 사용자 정의 타입은 삭제하지 않고 원래 타입을 유지합니다.

## 주의사항

- v1의 문 열림 방향 문자열은 보존되며, 회전각 데이터가 없으면 기본값이 적용됩니다.
- 마이그레이션 뒤 실제 현장 치수와 문 열림 방향을 반드시 확인하세요.
- 브라우저 개발자 도구에서 백업 LocalStorage 키를 삭제하기 전, v2 JSON 내보내기로 별도 파일 백업을 권장합니다.
