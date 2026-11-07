# 계단 왕복 중 Chrome과 macOS 스레드 상태 — 2026-11-07

Chrome의 로컬 미리보기에서 바람의 언덕 관측소 계단을 W/S로 왕복했다. 첫 녹화에서는 하단 `Z 95~97m, 해발 18m`와 상단 `Z 79~80m, 해발 20m`를 오가는 14회를 확인했다. 두 번째 녹화에서는 같은 경로를 다시 시도했으며 일부 왕복은 중간에서 방향을 전환했다. 그림자를 켜고 성능 패널과 GPU 타이머를 끈 상태로, 1440×900 캔버스와 DPR 1을 사용했다. 두 기록 모두 시티 뷰 변경 전 같은 섬 빌드를 사용했다.

| 분석 구간 | 콜백 간격 p95 | 최대 간격 | 100ms 초과 |
| --- | ---: | ---: | ---: |
| 첫 녹화 3~168초 | 9.28ms | 2,132.56ms | 1 |
| 첫 녹화 중 탭 숨김 간격 제외 | 9.28ms | 40.85ms | 0 |
| 추가 녹화 3~105초 | 92.58ms | 667.90ms | 168 |

간격은 같은 게임의 `requestAnimationFrame` 콜백 시작 사이를 뜻한다. 첫 녹화의 2,132.56ms 간격 시작 약 8ms 뒤에 게임 페이지의 `visibilitychange`와 RAF 취소가 기록됐다. 두 번째 `visibilitychange`가 발생하고 약 0.65ms 뒤 콜백이 이어졌다. 앱은 페이지가 숨겨지면 월드 프레임 루프를 정지한다. 이 구간에는 브라우저와 GPU 스레드 샘플이 있었지만 게임 렌더러의 PID가 수집 대상에 없었다.

## 지연을 재현한 추가 녹화

추가 녹화는 첫 트레이스에서 확인한 게임 렌더러 PID와 TID를 직접 지정했다. Chrome Performance의 마이크로초 타임스탬프와 macOS `mach_absolute_time`을 같은 시간축에 정렬했다. 분석 구간에는 게임 페이지의 `visibilitychange`가 없었다. 100ms를 초과한 168개 간격 중 시작과 끝이 모두 macOS 샘플 시간 범위에 들어온 것은 167개였다. 스레드 상태 샘플 간격 중앙값은 5.01ms였다.

- 최장 **667.90ms** 구간에서 렌더러 메인은 구간 내부 샘플 사이에 **18.32ms**의 CPU를 사용했다. 127개 상태 샘플 중 **125개가 `TH_STATE_RUNNING`**이었다. 직전 RAF 콜백도 416.93ms 경과하는 동안 Chrome이 기록한 스레드 CPU는 10.92ms였다.
- 겹치는 167개 모두에서 macOS 누적 CPU 시간의 증가는 구간 길이의 20% 미만이었다. 162개에서 렌더러 메인 상태 샘플의 90% 초과가 `TH_STATE_RUNNING`이었다. 161개에서는 인접한 두 샘플이 모두 `TH_STATE_RUNNING`이고 CPU가 샘플 간격의 20% 이하인 짧은 구간들(15ms 이하)이 전체 간격의 절반을 넘었다.
- XNU는 코어에서 실행 중이거나 실행 큐에 있는 스레드를 모두 `TH_RUN`으로 나타낸다. 대부분의 샘플이 이 상태인 동안 CPU 시간이 거의 늘지 않았다는 점은 이번에 재현된 지연에서 **macOS의 CPU 실행 대기**가 주된 몫이었다는 해석을 지지한다. 최장 간격에도 Chrome GPU 메인은 `GPUTask`를 22개 시작했고, 가장 긴 작업은 3.45ms였다. GPU 프로세스의 작업은 다른 탭의 명령도 포함할 수 있다. [XNU 상태 변환](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/thread.c#L1913), [XNU 실행 큐 정의](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/thread.h#L483), [Apple의 blocked/runnable 설명](https://developer.apple.com/videos/play/wwdc2026/268/)

스냅샷 사이의 상태 전환과 어떤 프로세스·우선순위 정책이 실행을 지연시켰는지는 이 계측으로 특정할 수 없다. 결과는 이번 재현 구간에 한정된다. 이전 날짜의 긴 구간은 해당 시점의 macOS 스레드 기록이 없어 동일한 원인으로 확정할 수 없다.

Chrome 원본과 macOS 샘플은 각각 `/private/tmp/wild-atlas-stairs-{walk,exact}-2026-11-07.json.gz`와 `/private/tmp/wild-atlas-stairs-{walk,exact}-2026-11-07.csv`에 로컬 보관했다.
