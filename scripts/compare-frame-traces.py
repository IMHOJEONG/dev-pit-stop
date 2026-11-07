"""Compare Chrome Performance exports using elapsed and thread CPU clocks."""
import argparse
import collections
import gzip
import json
import math
import statistics
from pathlib import Path


def stats(values):
    values = sorted(values)
    return {
        'count': len(values),
        'mean': statistics.mean(values) if values else None,
        'p95': values[math.ceil(len(values) * .95) - 1] if values else None,
        'max': values[-1] if values else None,
    }


def outer_tasks(events):
    """Use outer, non-overlapping RunTask slices so nested work is counted once."""
    end = -math.inf
    for event in sorted(events, key=lambda e: (e['ts'], -e['dur'])):
        if event['ts'] >= end:
            yield event
            end = event['ts'] + event['dur']


def cpu_bounds(tasks, start, end):
    low = high = covered = 0
    for event in tasks:
        if event['ts'] >= end:
            break
        clip = min(end, event['ts'] + event['dur']) - max(start, event['ts'])
        if clip <= 0:
            continue
        covered += clip
        if 'tdur' in event:
            cpu = min(event['dur'], max(0, event['tdur']))
            low += max(0, cpu - (event['dur'] - clip))
            high += min(clip, cpu)
        else:
            high += clip
    uncovered = max(0, end - start - covered)
    return {'cpuLowerMs': low / 1000, 'cpuUpperMs': (high + uncovered) / 1000,
            'outsideTracedTasksMs': uncovered / 1000}


def analyze(path, offset, seconds):
    reader = gzip.open if path.endswith('.gz') else open
    with reader(path, 'rt') as file:
        events = json.load(file)['traceEvents']
    marker = next(e for e in events if e['name'] == 'TracingStartedInBrowser')
    frame = next(f for f in marker['args']['data']['frames'] if f.get('isInPrimaryMainFrame'))
    pid, origin = frame['processId'], marker['ts']
    tid = next(e['tid'] for e in events if e['name'] == 'thread_name' and
               e['pid'] == pid and e['args']['name'] == 'CrRendererMain')
    main = [e for e in events if e['pid'] == pid and e['tid'] == tid and
            e['ph'] == 'X' and 'dur' in e]
    rafs = sorted((e for e in main if e['name'] == 'FireAnimationFrame' and
                   e.get('args', {}).get('data', {}).get('frame') == frame['frame']),
                  key=lambda e: e['ts'])
    tasks = list(outer_tasks(e for e in main if e['name'] == 'RunTask'))
    start, end = origin + offset * 1e6, origin + (offset + seconds) * 1e6
    window = [e for e in rafs if start <= e['ts'] < end]
    pairs = list(zip(window, window[1:]))
    gaps = [(b['ts'] - a['ts']) / 1000 for a, b in pairs]
    counts = collections.Counter(int((e['ts'] - origin) // 5e6) for e in rafs if e['ts'] >= origin)
    spikes = []
    for (a, b), gap in zip(pairs, gaps):
        if gap <= 100:
            continue
        cpu = cpu_bounds(tasks, a['ts'], b['ts'])
        callback_cpu = a.get('tdur')
        overlaps = []
        for e in main:
            if e['name'] == 'RunTask' or e['dur'] < 5000:
                continue
            overlap = min(b['ts'], e['ts'] + e['dur']) - max(a['ts'], e['ts'])
            if overlap >= 5000:
                overlaps.append((overlap, e))
        overlaps.sort(key=lambda pair: pair[0], reverse=True)
        spikes.append({
            'offsetMs': (a['ts'] - origin) / 1000, 'intervalMs': gap,
            'callbackWallMs': a['dur'] / 1000,
            'callbackCpuMs': callback_cpu / 1000 if callback_cpu is not None else None,
            'afterCallbackMs': max(0, b['ts'] - a['ts'] - a['dur']) / 1000,
            **cpu,
            'longSlices': [{'name': e['name'], 'overlapMs': overlap / 1000, 'wallMs': e['dur'] / 1000,
                            'cpuMs': e['tdur'] / 1000 if 'tdur' in e else None}
                           for overlap, e in overlaps[:8]],
        })
    return {
        'source': Path(path).name, 'windowSeconds': [offset, offset + seconds],
        'firstCallbackSeconds': (rafs[0]['ts'] - origin) / 1e6 if rafs else None,
        'lastCallbackSeconds': (rafs[-1]['ts'] - origin) / 1e6 if rafs else None,
        'callbacksPer5Seconds': dict(sorted(counts.items())),
        'fps': 1000 / statistics.mean(gaps) if gaps else None,
        'intervalMs': stats(gaps), 'callbackWallMs': stats(e['dur'] / 1000 for e in window),
        'callbackCpuMs': stats(e['tdur'] / 1000 for e in window if 'tdur' in e),
        'over100ms': len(spikes),
        'over100msMainCpuUpperBelowHalf': sum(
            s['cpuUpperMs'] < s['intervalMs'] / 2 for s in spikes),
        'spikes': spikes,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('traces', nargs='+')
    parser.add_argument('--offset', type=float, default=3)
    parser.add_argument('--seconds', type=float, default=30)
    args = parser.parse_args()
    print(json.dumps([analyze(p, args.offset, args.seconds) for p in args.traces], indent=2))
