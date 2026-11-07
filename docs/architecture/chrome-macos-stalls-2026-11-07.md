# 계단 장면의 Chrome·macOS 대기 원인 조사 — 2026-11-07

[이전 Chrome 분석](./chrome-thread-trace-2026-11-06.md)을 `b9c55d7`로 커밋해 `origin/deploy_page`에 푸시했다. 이번에는 이전 트레이스의 GPU 프로세스·컴포지터를 추가 분석하고, 현재 빌드에서 Chrome과 macOS를 동시에 기록했다.

## 이전 지연에서 좁힌 범위

이전 관리 탭의 100ms 초과 콜백 간격 45개에서 동일 게임 레이어의 Chrome 컴포지터는 간격마다 `BeginFrame`을 11~33번 기록했다. 각 구간에 시작한 `CrGpuMain`의 `GPUTask` 중 가장 긴 작업은 5.04ms였다. 가장 긴 275.91ms 간격에도 `BeginFrame` 33번과 `GPUTask` 16개가 있었고, 이때 가장 긴 `GPUTask`는 1.21ms였다. `GPUTask`는 같은 GPU 프로세스의 다른 탭 작업도 포함할 수 있다.

따라서 이 지연은 컴포지터 프레임 신호가 통째로 끊기거나 Chrome GPU 메인 스레드의 계측된 작업 하나가 구간 전체를 점유한 경우와 맞지 않는다. 브라우저 내부 동기화, WebGL 명령 큐·드라이버 응답 대기, 렌더러 메인 스레드의 OS 실행 대기는 여전히 가능하다. 컴포지터 신호는 화면 표시 완료가 아니며, `GPUTask`는 GPU 하드웨어의 실행 기록이 아니다. [Chromium 컴포지터 파이프라인 정의](https://chromium.googlesource.com/chromium/src/+/824b4e6489c9ae526b3a8c723580f5f3805148b4/cc/metrics/compositor_frame_reporter.h)

## Chrome과 macOS 동시 기록

- 같은 Chrome 비교 탭의 계단 중간 `(-66.3, 18.8, 88.8)`, 기본 카메라, 13:08 정지, 높은 품질·그림자 켬, 패널·GPU 타이머 끔. 실제 캔버스 1440×900, DPR 1. 렌더링 코드는 세 번 모두 동일했다.
- Chrome Performance의 PID/TID를 사용해 macOS `PROC_PIDTHREADID64INFO`로 렌더러 메인, 렌더러 컴포지터, GPU 메인의 상태와 누적 CPU 시간을 샘플링했다. 세 번째 기록에는 브라우저 메인과 Viz 컴포지터도 포함했다. `mach_absolute_time`을 마이크로초로 변환해 Chrome 타임스탬프와 맞췄다. [Chromium 시간 기준](https://chromium.googlesource.com/chromium/src/+/bf34def0e76d2c8581f107759b0ec607a89fe2a6/base/time/time.h), [XNU 스레드 CPU 계측](https://github.com/apple-oss-distributions/xnu/blob/main/doc/observability/recount.md)
- 스레드 샘플 간격 중앙값은 약 5ms였다. 분석 구간의 최대 샘플 간격은 조건에 따라 13~69ms로, 연속적인 스케줄러 전환 기록보다 해상도가 낮다. Xcode System Trace는 이 Mac에 설치되어 있지 않았고, 네이티브 호출 스택을 얻는 `sample`과 `spindump`는 현재 계정 권한으로 실행할 수 없었다. [Apple Thread State Trace 설명](https://developer.apple.com/documentation/audiotoolbox/analyzing-audio-performance-with-instruments)

| 녹화 조건 | 분석 구간 | 콜백 FPS | 간격 p95 | 최대 간격 | 100ms 초과 |
| --- | --- | ---: | ---: | ---: | ---: |
| 이전 관리 탭, 지형 분리 후 | 3~28초 | 52.34 | 42.97ms | 203.70ms | 21 |
| 이번, DevTools 도킹 | 3~28초 | 120.00 | 9.27ms | 11.48ms | 0 |
| 이번, 별도 DevTools 창 | 3~28초 | 120.00 | 9.23ms | 10.88ms | 0 |
| 이번, 별도 빈 Chrome 창에 초점 | 6~31초 | 120.01 | 9.24ms | 10.01ms | 0 |

표의 간격은 동일 게임의 `requestAnimationFrame` 콜백 시작 사이를 뜻한다. 마지막 녹화는 창 전환 뒤 25초를 사용했다. 세 번 모두 100ms 초과가 재현되지 않아 macOS 상태를 기존 지연에 대응시킬 수 없었다. 브라우저·드라이버 대기와 OS 실행 대기를 구분하려면 재현된 구간의 blocked/runnable 전환과 대기 스택이 필요하다. 이번 수치는 이전 기록과의 재현성 비교이며, 개선 효과로 해석할 수 없어 게임 코드 변경은 적용하지 않았다. [Apple System Trace의 blocked/runnable 구분](https://developer.apple.com/videos/play/wwdc2026/268/)

Chrome 원본과 macOS CSV는 각각 `/private/tmp/wild-atlas-thread-state-{baseline,undocked,unfocused}.json.gz`, `/private/tmp/wild-atlas-thread-state-{baseline,undocked,unfocused}.csv`에 로컬 보관했다. Chrome 트레이스에는 다른 탭·확장 메타데이터가 들어갈 수 있어 Git에는 요약만 남겼다.
