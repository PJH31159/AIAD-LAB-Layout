# AIAD 연구실 공용 배치 플래너

실측 연구실 도면 위에 가구를 배치하고 2D/3D로 검토하는 GitHub Pages 웹 앱입니다. 프로젝트 목록과 배치 데이터는 Supabase에 저장되므로 서로 다른 컴퓨터에서도 같은 배치안을 조회·복제·수정할 수 있습니다.

## 저장 구조

- Supabase `layouts`: 공용 프로젝트의 공식 저장소
- LocalStorage: 사용자 이름, 최근 프로젝트 ID, 네트워크 장애 시 임시 초안, 기존 버전 마이그레이션 원본
- `src/data/default-floorplan.js`: 새 프로젝트마다 복사되는 공식 빈 연구실 구조
- JSON: 별도 백업·이동·장애 복구 수단

LocalStorage만 사용하던 이전 배치안은 왼쪽 패널의 **공용 저장소로 가져오기**로 복사합니다. 가져온 뒤에도 원본 LocalStorage는 자동 삭제하지 않습니다.

## 박지훈이 최초 한 번 해야 하는 설정

### 1. Supabase 프로젝트 만들기

1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인합니다.
2. **New project**를 누릅니다.
3. Organization, 프로젝트 이름, 데이터베이스 비밀번호, Region을 선택하고 **Create new project**를 누릅니다.
4. 프로젝트 준비가 끝날 때까지 기다립니다.

### 2. 데이터베이스 생성하기

1. 왼쪽 메뉴에서 **SQL Editor**를 엽니다.
2. **New query**를 누릅니다.
3. 이 저장소의 `supabase/schema.sql` 전체 내용을 붙여 넣습니다.
4. **Run**을 눌러 실행합니다.
5. **Table Editor**에서 `layouts` 테이블이 보이는지 확인합니다.
6. **Database → Replication** 또는 프로젝트 버전에 따른 **Realtime** 설정에서 `layouts`가 활성화됐는지 확인합니다. SQL이 자동으로 활성화하지만 권한에 따라 수동 확인이 필요할 수 있습니다.

### 3. 공개 API 값 연결하기

1. Supabase의 **Project Settings → API**를 엽니다.
2. **Project URL**과 **anon / public key**를 복사합니다. 새 UI에서는 **Publishable key**로 표시될 수 있습니다.
3. `src/config/supabase.js`를 열어 다음 두 값을 교체합니다.

```js
window.AIAD_SUPABASE_CONFIG = Object.freeze({
  url: 'https://프로젝트참조.supabase.co',
  anonKey: '공개_ANON_또는_PUBLISHABLE_KEY'
});
```

`service_role` 또는 secret key는 절대 넣지 마세요. GitHub Pages 소스와 브라우저 네트워크 요청은 누구나 볼 수 있습니다.

### 4. GitHub Pages에 배포하기

```powershell
git add index.html style.css ui.css script.js README.md migration-guide.md src supabase
git commit -m "Add shared Supabase layout storage"
git push origin main
```

GitHub 저장소의 **Settings → Pages**에서 기존 배포 브랜치와 루트 폴더 설정을 유지합니다. Actions가 끝난 뒤 아래 주소를 강력 새로고침합니다.

<https://pjh31159.github.io/AIAD-LAB-Layout/>

브라우저 개발자 도구의 **Network**에서 `supabase.co` 요청이 200 응답인지 확인합니다. 별도 서버 CORS 설정은 일반적인 Supabase 브라우저 API 사용에는 필요하지 않습니다. 실패하면 URL/key 오타, SQL 실행 여부, RLS 정책을 먼저 확인합니다.

## 공용 배치안 사용법

1. 최초 접속 시 작성자 표시용 사용자 이름을 입력합니다. 이는 로그인이 아니며 같은 브라우저에 저장됩니다.
2. **+ 새 배치안**에서 이름, 작성자, 설명을 입력합니다.
3. 가구를 배치하면 1.6초 debounce 후 선택된 프로젝트에 자동 저장됩니다.
4. 상단 상태에서 저장 중, 저장 완료, 미저장, 서버 오류를 확인합니다.
5. 다른 사람의 안은 **복제**해서 독립 UUID의 새 안으로 수정하는 것을 권장합니다.
6. 같은 버전을 두 사람이 수정하면 먼저 저장된 쪽만 갱신됩니다. 나중 저장한 사용자에게 최신 버전 열기 또는 내 작업을 복사본으로 저장하는 모달이 표시됩니다.
7. 삭제는 확인 후 `is_archived = true`로 처리되어 공용 목록에서만 숨겨집니다.

인터넷 연결이 끊겨 서버 저장에 실패하면 현재 데이터가 `aiad-lab-draft-v3`에 임시 보관됩니다. 연결 복구 후 상단 **재시도**를 누릅니다.

## 데이터 모델

`layouts.layout_data`에는 현재 프로젝트 전체 데이터가 JSONB로 저장됩니다.

```text
Project
├─ room                         공식 구조의 직렬화 묶음
│  ├─ boundary / walls
│  ├─ glassWalls / doors / windows
│  └─ fixedFacilities
├─ roomBoundary, walls, ...     기존 편집기 호환 필드
├─ furniture                    사용자 이동 가구
├─ settings                     격자·스냅·도면 설정
└─ version
```

`layouts` 테이블은 `id`, `name`, `author_name`, `description`, `layout_data`, `thumbnail`, `version`, `is_archived`, `created_at`, `updated_at`을 가집니다. 이름·작성자·room·furniture 배열·version은 클라이언트와 DB 제약조건에서 검증합니다. Thumbnail과 별도 버전 이력 테이블은 이번 1차 구현 범위에서 제외했습니다.

## RLS와 보안 한계

RLS는 활성화되어 있고 anon 역할에 활성 목록 조회, 생성, 갱신, archive 함수 실행만 허용합니다. archived 행은 일반 조회 정책에서 제외됩니다.

다만 인증 없는 공개 GitHub Pages이므로 anon key를 가진 방문자는 허용된 CRUD를 호출할 수 있습니다. 사용자 이름은 작성자 식별용일 뿐 권한 증명이 아닙니다. 연구실 구성원만 쓰기, 관리자 삭제, 읽기 전용 교수 계정 같은 실질적인 권한이 필요하면 Supabase Auth를 추가하고 `admin`, `member`, `viewer` 역할 기반 정책으로 교체해야 합니다.

## 로컬 실행과 검사

```powershell
python -m http.server 4173
```

`http://127.0.0.1:4173/`을 열며, `?selftest`를 붙이면 공식 도면·데이터 마이그레이션·JSON 왕복 자체 검사를 표시합니다. Supabase CRUD는 실제 URL/key와 `schema.sql` 실행이 완료된 프로젝트에서 두 개의 독립 브라우저 프로필로 확인해야 합니다.

필수 수동 시나리오:

1. 브라우저 A에서 박지훈 / `지훈 테스트`를 만들고 책상을 추가해 저장합니다.
2. 시크릿 브라우저 B에서 허규진으로 접속해 목록·책상 위치를 확인합니다.
3. B에서 이를 `규진 수정안`으로 복제해 저장합니다.
4. A의 목록에 Realtime으로 새 항목이 나타나는지 확인합니다.
5. 두 창에서 같은 버전을 열고 각각 수정해 충돌 모달을 확인합니다.
6. 삭제, JSON 가져오기 후 새 공용 저장, 네트워크 오프라인 저장 실패와 재시도를 확인합니다.

## 유지되는 편집 기능

실제 연구실 도면, Drag & Drop, 영역/Shift 다중 선택, 정렬, Grid/Object/Wall Snap, 거리 표시, 2D/3D, 공간 분석, 실행 취소/다시 실행, JSON, PNG, PDF, 초기화, 벽 편집, 콘센트/LAN 범례를 유지합니다.

## 주요 파일

```text
index.html                       공용 프로젝트 패널과 모달
style.css / ui.css               기존 UI와 공용 저장 상태 UI
script.js                        2D 편집기와 앱 브리지, 임시 백업
src/api/layouts-api.js           Supabase CRUD와 Realtime
src/config/supabase.js           공개 URL/anon key 설정
src/ui/project-manager.js        목록·모달·저장·충돌·마이그레이션
src/data/default-floorplan.js    공식 연구실 구조
src/3d/scene-manager.js          Three.js Viewer
supabase/schema.sql              테이블·인덱스·trigger·RLS·archive 함수
```

## 알려진 제한사항

- 완전한 실시간 공동 편집이 아니라 공용 목록과 프로젝트 단위 저장입니다.
- 인증이 없어 작성자 위조와 허용된 데이터 변경을 막을 수 없습니다.
- 임시 초안은 장애 시 보존되지만 자동 복구 UI는 아직 제공하지 않습니다.
- Thumbnail과 상세 버전 이력은 후속 기능입니다.
