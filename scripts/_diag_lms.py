import json
d = json.load(open('lms-data.json', encoding='utf-8'))
print('source:', d.get('source'), '| fetchedAt:', d.get('fetchedAt'))
print('courses:', len(d.get('courses', [])))
for c in d.get('courses', []):
    v = c.get('vods', [])
    a = c.get('assigns', [])
    q = c.get('quizzes', [])
    att = sum(1 for x in v if x.get('attended'))
    print(f"- [{c.get('id')}] {c.get('title','')[:30]:32} vod {att}/{len(v)} assign {len(a)} quiz {len(q)} err={c.get('errors')}")
    for x in a[:2]:
        print(f"    assign: {x.get('title','')[:30]} due={x.get('due')} sub={x.get('submitted')}")
    for x in q[:2]:
        print(f"    quiz: {x.get('title','')[:30]} due={x.get('due')} sub={x.get('submitted')}")
    for x in v[:3]:
        print(f"    vod: {x.get('title','')[:30]} w={x.get('week')} st={x.get('status')} att={x.get('attended')} rng={x.get('range')}")
