"""Read a Chrome DevTools export offline. No browser control or network access."""
import collections
import gzip
import json
import statistics
import sys

path = sys.argv[1]
with gzip.open(path, 'rt') if path.endswith('.gz') else open(path) as source:
    events = json.load(source)['traceEvents']
frames = next(e for e in events if e['name'] == 'TracingStartedInBrowser')['args']['data']['frames']
frame = next(f for f in frames if f.get('isInPrimaryMainFrame'))
pid = frame['processId']
tid = next(e['tid'] for e in events if e['name'] == 'thread_name' and
           e['pid'] == pid and e['args']['name'] == 'CrRendererMain')
main = [e for e in events if e['pid'] == pid and e['tid'] == tid and e['ph'] == 'X']


def timings(items):
    values = sorted(e['dur'] / 1000 for e in items if 'dur' in e)
    return {'count': len(values), 'totalMs': sum(values),
            'meanMs': statistics.mean(values) if values else 0,
            'p95Ms': values[max(0, (len(values) * 95 + 99) // 100 - 1)] if values else 0,
            'maxMs': max(values, default=0),
            'over100ms': sum(v > 100 for v in values)}


nodes = {}
weights = collections.Counter()
for event in events:
    if event['name'] != 'ProfileChunk' or event['pid'] != pid:
        continue
    data = event['args']['data']
    profile = data.get('cpuProfile', {})
    for node in profile.get('nodes', []):
        nodes[node['id']] = node['callFrame']
    for sample, delta in zip(profile.get('samples', []), data.get('timeDeltas', [])):
        weights[sample] += delta / 1000
functions = []
for node, ms in weights.most_common():
    call = nodes.get(node, {})
    functions.append({'sampledSelfMs': ms, 'functionName': call.get('functionName'),
                      'url': call.get('url'), 'lineNumber': call.get('lineNumber'),
                      'columnNumber': call.get('columnNumber')})

report = {
    'source': path, 'url': frame['url'], 'rendererPid': pid,
    'notes': 'Separate visible Chrome recording; not the fixed-viewport A/B capture. '
             'Nested timings must not be added. GPUTask is a trace task, not a per-frame GPU timer. '
             'Sampled JS self times are statistical attribution, not exact elapsed spans.',
    'mainThread': {name: timings([e for e in main if e['name'] == name]) for name in
                   ['RunTask', 'FireAnimationFrame', 'MinorGC', 'MajorGC', 'UpdateLayoutTree',
                    'Layout', 'Paint', 'FunctionCall']},
    'gpuTasks': timings([e for e in events if e['name'] == 'GPUTask' and
                        e.get('args', {}).get('data', {}).get('renderer_pid') == pid]),
    'shaderCompileEvents': timings([e for e in events if
                                   'shader' in e['name'].lower() and 'compil' in e['name'].lower()]),
    'topSampledFunctions': functions[:30],
    'longestMainTasks': [{k: e[k] for k in ['name', 'ts', 'dur']} for e in
                         sorted([e for e in main if e['name'] == 'RunTask'],
                                key=lambda e: e['dur'], reverse=True)[:10]],
}
print(json.dumps(report, indent=2))
