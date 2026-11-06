# 성능·자원 관리 감사 — 2026-11-04

기준 코드 `1d17f4ac5fecf3aec130731ded121e6c71c3a8fe`. [설계안](./README.md) / [측정 JSON](./baseline-2026-11-04.json).

후속 계측: [실제 브라우저 플레이 성능](./browser-performance-2026-11-04.md). 아래 headless 기준선은 당시 구조 측정으로 유지하며 브라우저 결과와 구분한다.

이 문서는 **현재 코드에서 확인한 비용, headless 측정, 아직 검증하지 않은 추정**을 구분한다. 이번 작업은 런타임 성능을 개선한 변경이 아니라, 개선을 시작할 구조와 검증 기준을 만드는 작업이다.

## 1. 재현

저장소 루트에서 실행한다. 별도 서버·브라우저·사용자 저장 데이터는 사용하지 않는다.

```sh
bun run audit:game
# 새 측정은 기존 기준선을 덮어쓰지 않고 별도 파일로 보관한다.
bun run audit:game > /tmp/wild-atlas-audit.json
bun run build
```

측정 도구: [scripts/audit-game.ts](../../scripts/audit-game.ts).

- 환경: Apple M1 Pro / macOS arm64 / Bun 1.3.14.
- 기본 시드 2704, 새 월드, 909개 자원. 사용자의 localStorage에 접근하지 않는다.
- 장면 생성 후 객체와 typed-array buffer를 집계한다.
- CPU 시나리오는 12틱 warm-up 후 각각 180틱을 측정한다.
- GPU, 실제 WebGLRenderer, HUD DOM, 저장, canvas 지도 그리기, 네트워크는 이 벤치마크에 포함하지 않는다.
- 따라서 아래 시간은 **브라우저 FPS나 실제 프레임 시간, VRAM 사용량이 아니다.** 다른 기기·엔진·경로에서는 달라진다. 실제 브라우저의 성능 trace는 P0에서 별도로 수집해야 한다.

## 2. 현재 장면의 구조 측정

| 측정 항목 | 값 | 해석 |
| --- | ---: | --- |
| 자원 데이터 | 909개 | 나무·돌·수정 엔티티 |
| Scene 안의 Mesh 노드 | 1,279개 | 실제 draw call 수와 다름 |
| Scene에 연결된 서로 다른 Geometry | 1,276개 | 공유가 가능한 반복 도형도 각각 생성되는 부분이 많음 |
| Scene에 연결된 서로 다른 Material | 433개 | shader program 수와 다름 |
| InstancedMesh | 10개 | 자원·풀 등의 기존 배치 최적화가 있음 |
| 인스턴스 슬롯 합계 | 7,359개 | 풀·0-scale 흔적 등을 포함. 화면에 보이는 수가 아님 |
| 선언된 삼각형×인스턴스 합계 | 270,816개 | 숨김·0-scale 포함. 실제 GPU 렌더 삼각형 수가 아님 |
| 지형 단일 메시 삼각형 | 135,200개 | 260×260 격자, LOD 없는 전체 섬 메시 |
| castShadow=true인 Mesh 노드 | 1,181개 | frustum/light culling 전 후보 수 |
| 선언 CPU attribute/index/instance buffer | 7,999,684 bytes, 약 7.63 MiB | JS 객체·오디오·shader·texture·render target·GPU 복사본 제외 |
| 카메라 정적 충돌 프록시 후보 | 745개 | 현재 단순한 근거리 broad phase 없이 등록 |

Geometry/Material 수는 Scene에 연결된 객체의 identity 기준이다. DropView가 보관하지만 아직 Scene에 붙이지 않은 도형이나 카메라의 전용 프록시 Material 등은 포함하지 않는다. Three.js 내부 GPU 캐시와도 다르다.

### 주요 소유 영역

| 영역 | Mesh | Geometry | Material |
| --- | ---: | ---: | ---: |
| 하늘 월드 | 343 | 343 | 257 |
| 도로·다리 | 227 | 227 | 20 |
| 차량·운전자 리그 | 171 | 171 | 36 |
| 도보 캐릭터 | 139 | 139 | 28 |
| 관측소·캠프 | 128 | 128 | 29 |
| 발견 장소 | 55 | 55 | 5 |

이 표는 일부 영역이며 전체 합계와 동일하지 않다. Terrain, 환경, 자원·풀 등은 전체 Scene 집계에 포함되어 있다. 각 영역에 공유 자원이 있다면 영역별 집계 합산도 전역 고유 수와 다를 수 있다.

하늘 계단에서는 각 판자마다 `new BoxGeometry`와 같은 색의 `mat(0xb7b6a1)`를 반복 생성한다. 기둥·장식도 반복 생성한다. 이 부분이 **하늘 월드 Material 257개**라는 수치의 구체적인 개선 지점이다. [SkyView](../../src/game/sky/sky-view.ts), 기준 코드 78~128행.

## 3. CPU 구조 기준선

| 작업 | 측정값 | 범위 |
| --- | ---: | --- |
| 자원 생성 | 16.546ms | 1회 측정 |
| WorldScene 생성 | 189.319ms | 1회 측정, renderer 생성·shader compile 제외 |
| 지도 높이 계산 524,288회 | 249.268ms | 512² 픽셀마다 높이 두 번, 색상·canvas 쓰기 제외 |
| 정지 상태 view+camera | 평균 0.585ms / p95 0.838ms | GPU render를 뺀 180틱 |
| 걷기 simulation+view+camera | 평균 0.630ms / p95 0.817ms | 동일 |
| 주행 simulation+view+camera | 평균 0.853ms / p95 1.142ms | 다리 구간, 동일 |

정지 상태 비용이 0이 아니라는 점과 지도 계산이 동기로 수행된다는 점은 확인할 수 있다. 그러나 이 수치로 “실제 프레임이 1ms”라거나 “GPU가 주범”이라고 결론 내릴 수는 없다. 디바이스·브라우저·GPU·레이아웃·GC·실제 렌더 패스가 제외되어 있기 때문이다.

지도 샘플링은 실제 `MapView` 생성자의 두 높이 조회와 같은 좌표를 사용하지만 전체 생성자를 실행한 것은 아니다. 전체 최초 로딩 시간의 하한을 엄밀하게 측정한 결과로도 사용하지 않는다. 순수 계산량을 비교하는 독립된 기준선이다.

## 4. 코드에서 확인한 비용과 관리 공백

### A. 불필요한 반복 프레임 — 우선도 P0

- 근거: [Game.frame](../../src/game/app/game.ts), 287행 이후. `if (!this.paused)` 바깥의 395~418행에서 camera, world, vehicle, sky, renderer와 다음 RAF가 계속 실행된다.
- `dt=0`은 업데이트 호출·객체 생성·카메라 raycast·WebGL render를 제거하지 않는다.
- [WorldScene.update](../../src/game/world/world-scene.ts)는 도보 캐릭터를 업데이트한 뒤, Game에서 그 노드를 숨긴다. 운전 중에도 보이지 않는 보행 리그의 업데이트가 실행될 수 있다.
- [VehicleView.update](../../src/game/vehicles/vehicle-view.ts)는 미탑승 상태에도 네 바퀴 지면 조회와 운전자 포즈 계산을 수행한다.
- 개선: 게임 모드별 scheduler, 활성 actor만 animation, 정지 화면은 invalidation 렌더.
- 확인할 것: 실제 메뉴/배경 탭에서 render 횟수, WebGL GPU 시간, preview 동시 렌더 유무.

브라우저가 숨겨진 탭의 RAF를 제한할 수 있으므로 백그라운드에서 항상 60번 실행된다는 뜻은 아니다. 앱 자체의 정지 계약이 없다는 뜻이다.

### B. 초기 전체 월드 생성과 지도 계산 — P0 계측 / P2 분리

- 근거: [WorldScene 생성자](../../src/game/world/world-scene.ts), [MapView 생성자](../../src/game/expedition/map-view.ts), [Game 필드 초기화](../../src/game/app/game.ts).
- 지형·도로·구조물·지상/하늘 월드·두 캐릭터 리그를 한꺼번에 만든다. MapView는 512² 픽셀을 동기 계산한다.
- 영역이 멀다는 이유로 CPU 데이터와 장면 자원이 해제되는 체계는 없다. Three.js frustum culling은 화면 바깥 draw를 줄일 수 있지만 생성·보유 자체를 없애지는 않는다.
- 개선: 첫 플레이 영역 우선, 원경 저해상도 표현, 청크별 활성/상주/해제, 지도·지형 Worker. 시작 로더의 timer가 아니라 실제 준비 단계로 진행률을 계산한다.

### C. 충돌 조회와 반복 할당 — P1

- [VehicleController.canOccupy](../../src/game/vehicles/vehicle-controller.ts), 31~67행: 9개 차체 지점 각각에서 전체 자원 목록을 검사한다. 후보 필터 전 명목상 909×9 = 8,181회의 자원 검사 경로가 한 세분화 스텝마다 존재한다. 실제로는 조기 return 여부에 따라 줄어든다.
- [PlayerController](../../src/game/player/player-controller.ts)와 [cameraClearance](../../src/game/player/camera-collision.ts)도 전체 자원 목록을 조회한다.
- [CameraController.update](../../src/game/player/camera-controller.ts)는 MeshCameraCollision을 두 번 호출한다. [MeshCameraCollision](../../src/game/player/mesh-camera-collision.ts)은 각 호출마다 모든 프록시 matrix를 갱신하고 filter/map 배열을 만든다. 745개가 전부 실제 삼각형 검사까지 간다는 뜻은 아니다.
- [groundSurface](../../src/game/world/ground-surface.ts)에서 도로 관련 조회를 반복하고, [landSurface](../../src/game/world/routes.ts)는 매번 Map과 projection 객체를 만든다. 도로 자체에는 이미 32m 공간 인덱스가 있다.
- 개선: 이웃 자원/정적 collider 질의, 캐시된 변하지 않는 월드 matrix, scratch 벡터·배열 재사용, 연속 지면 캐시. 정확한 계단·다리 overlay는 유지한다.

### D. 자원 생성·소유·해제 정책 — P1

이미 있는 관리:

- 자원은 InstancedMesh, 파편은 고정 160개 인스턴스 풀.
- [DropView](../../src/game/items/drop-view.ts)는 80m 근처 화면 노드만 만들고 공용 Geometry/Material을 보유한다.
- [disposeScene](../../src/game/shared/dispose.ts)은 Geometry/Material을 Set으로 모아 해제하고 InstancedMesh.dispose도 호출한다.
- [Game.dispose](../../src/game/app/game.ts)는 RAF·timer·입력·패널·오디오·renderer·world 정리를 호출한다.
- 캐릭터 미리보기는 닫을 때 RAF, Observer, shadow, 장면과 renderer/context를 정리한다.

공백:

- 공유 asset cache와 owner/refcount, 청크별 eviction, 상주량 상한이 없다.
- 공통 disposeScene은 texture, render target, light shadow를 직접 다루지 않는다. 실제로 이들을 소유하는 대상이 별도로 해제해야 한다.
- 주 카메라의 프록시 객체와 전용 material에는 명시적인 dispose 계약이 없다. 프록시 material은 렌더되지 않을 수 있으므로 이것만으로 GPU 누수를 단정하지 않는다.
- [main.ts](../../src/main.ts)에서 `new Game()` 도중 실패하면 완성된 game 변수에 할당되기 전이라 현재의 `game?.dispose()` 경로만으로는 부분 생성된 자원의 정리를 보장하기 어렵다.
- DropView는 근거리 노드만 유지하지만 모든 드롭에 대해 높이를 먼저 계산한 뒤 거리를 판별한다. 데이터 조회 비용은 여전히 전체 드롭 수에 비례한다.

이는 **수명 관리가 부분별로 구현되어 있으나 통합 계약과 측정이 부족하다는 관찰**이다. 사용자의 실제 GPU 메모리가 계속 증가한다는 누수 재현 결과는 아니다.

### E. 기본 품질과 그림자 — P0 계측 / P1 조정

- [GameRenderer](../../src/game/app/renderer.ts)는 기본 high, antialias=true, DPR 최대 1.7, PCFSoftShadowMap을 사용한다.
- [EnvironmentView](../../src/game/world/environment-view.ts)는 2048² 태양 shadow와 플레이어를 따라가는 광원을 둔다.
- [shared/meshes.ts](../../src/game/shared/meshes.ts)의 기본 helper는 castShadow와 receiveShadow를 켠다. 프레임마다 그림자에 실제 참여하는 수는 추가로 측정해야 한다.
- 품질 전환은 Scene 모든 Material을 needsUpdate 처리한다. 전환 프레임의 shader 재컴파일/끊김 가능성은 아직 측정하지 않았다.
- 개선: 기기별 초기 품질, 동적 해상도, 근처 필요한 물체만 shadow caster로 사용, 안정적인 품질 변경 간격.

### F. 미리보기·HUD·저장 — P1~P3

- [CharacterPreview](../../src/game/ui/character-preview.ts)는 별도 WebGLRenderer, 1024² shadow, RAF를 만든다. 기본 월드의 정지 렌더와 합쳐지면 두 장면 비용이 생길 수 있다.
- [Hud.update](../../src/game/ui/hud.ts)는 100ms 간격으로 DOM과 미니맵을 재계산한다. 변경된 값/레이어만 갱신하도록 분리할 여지가 있다.
- [ExpeditionStorage.save](../../src/game/persistence/expedition-storage.ts), 29~36행은 JSON.stringify와 localStorage.setItem을 동기로 실행한다. 현재 작은 저장이 큰 지연을 유발한다고 측정한 것은 아니다.
- 개선: preview 동안 월드 렌더 중단, dirty selector, 지도 layer 캐시, 단일 저장 큐와 IndexedDB.

## 5. 현재 빌드와 배포

2026-11-04 `bun run build` 성공. 아래는 빌드 도구가 출력한 gzip 예상치이며 실제 네트워크 압축·캐시 결과와 다르다.

| 산출물 | 원본 kB | gzip kB |
| --- | ---: | ---: |
| 앱 JS | 163.54 | 58.78 |
| Three.js JS | 524.53 | 133.06 |
| CSS | 31.62 | 7.79 |

Three.js chunk에 500kB 경고가 있다. 이 경고 하나만으로 플레이 중 느린 원인을 판단하지 않는다. 초기 전송·파싱·shader 준비와 지속적인 렌더링 비용은 서로 다른 측정 대상이다.

[배포 workflow](../../.github/workflows/deploy.yml)는 GitHub Actions에서 검사·테스트·빌드 후 dist를 GitHub Pages로 배포한다. 저장 API·계정·게임 서버는 현재 코드에 없다. 그러므로 서버 사양을 늘리는 제안은 현 단계의 주행 프레임 문제에 대한 직접적인 처방이 아니다.

## 6. 다음 실측에서 답해야 할 질문

| 질문 | 수집 방법 | 결정 |
| --- | --- | --- |
| 느림이 CPU인가 GPU인가? | Chrome Performance trace + renderer.info + 지원 기기 GPU timer | CPU query/animation과 render 품질의 우선순위 |
| 지도·메뉴가 로딩을 막는가? | constructor/worker/first-interactive performance marks | 지도 지연 생성과 청크 초기 로드 범위 |
| 반복 플레이에서 메모리가 증가하는가? | 동일 세션 20~30회 반복, GC 후 heap, owner별 asset 수 | 정상 cache와 해제 누락 구분 |
| 무엇이 렌더 호출을 많이 만드는가? | 기본 pass와 shadow pass 분리, actor/sky/road visibility 비교 | material 공유·merge·instancing·LOD 선택 |
| 이동 중 GC가 보이는가? | allocation sampling, CPU 단계별 p95와 long task 연관 | scratch 객체/typed array 최적화 범위 |
| 기기 품질 차이가 큰가? | 고정 viewport/DPR에서 M1 Pro와 중급 Android 실기기 비교 | 60/30 FPS 품질 등급과 기본 DPR |

성능 trace가 수집되기 전에는 FPS 개선율, 실제 VRAM 사용량, 최종 모바일 성능을 약속하지 않는다. 우선 구현은 [아키텍처의 P0/P1 단계](./README.md#10-구현-순서와-완료-조건)를 따른다.
