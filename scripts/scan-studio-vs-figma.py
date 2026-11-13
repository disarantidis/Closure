#!/usr/bin/env python3
"""
scan-studio-vs-figma.py — what differs between a Resolved export of the Figma file
and a Resolved JSON that came back from Tokens Studio, sorted into kinds.

  python3 scripts/scan-studio-vs-figma.py figma-resolved.json studio-resolved.json

Read-only. Prints: aliases that became literals, aliases that now point elsewhere,
changed literals, tokens on one side only, type differences, holes (a token with
no value in some breakpoint), broken references, and which literal colours a core
colour could be relinked to.
"""
import json,collections,re
import sys
if len(sys.argv)<3: sys.exit('usage: scan-studio-vs-figma.py figma-resolved.json studio-resolved.json')
F=json.load(open(sys.argv[1])); S=json.load(open(sys.argv[2]))
def flat(n,p=(),out=None):
    out={} if out is None else out
    if isinstance(n,dict):
        if '$value' in n: out['.'.join(p)]=n; return out
        for k,v in n.items():
            if not k.startswith('$'): flat(v,p+(k,),out)
    return out
FF,SS=flat(F),flat(S)
isref=lambda v:isinstance(v,str) and v.startswith('{') and v.endswith('}')
def kind(v): return 'ref' if isref(v) else ('composite' if isinstance(v,dict) and 'hex' not in v and ('fontFamily' in v or 'offsetX' in v or 'color' in v) else 'literal')
def hexof(T,v,d=0):
    if isinstance(v,dict): return v.get('hex') or None
    if isref(v) and d<10:
        t=T.get(v[1:-1]); return hexof(T,t['$value'],d+1) if t else None
    return v
def resolve(T,v,d=0):
    if isref(v) and d<10:
        t=T.get(v[1:-1]); return resolve(T,t['$value'],d+1) if t else None
    return v.get('hex') if isinstance(v,dict) and 'hex' in v else v
common=set(FF)&set(SS); onlyF=set(FF)-set(SS); onlyS=set(SS)-set(FF)
cat=collections.defaultdict(list)
for k in sorted(common):
    a,b=FF[k]['$value'],SS[k]['$value']
    if FF[k].get('$type')!=SS[k].get('$type'): cat['D type differs'].append((k,FF[k].get('$type'),SS[k].get('$type')))
    ka,kb=kind(a),kind(b)
    if ka=='composite' or kb=='composite': continue
    if a==b: continue
    if ka=='ref' and kb=='literal': cat['A alias in Figma, literal in Studio'].append((k,a,resolve(SS,b) if False else (b.get('hex') if isinstance(b,dict) else b)))
    elif ka=='literal' and kb=='ref': cat['A2 literal in Figma, alias in Studio'].append((k,a,b))
    elif ka=='ref' and kb=='ref': cat['B alias points elsewhere'].append((k,a,b))
    else: cat['E literal value changed'].append((k,a if not isinstance(a,dict) else a.get('hex'),b if not isinstance(b,dict) else b.get('hex')))
# same resolved colour but different target (drift without visual change?)
B_same=[x for x in cat['B alias points elsewhere'] if resolve(FF,'{'+x[1][1:-1]+'}')==resolve(SS,x[2])]
print('totals: figma',len(FF),'studio',len(SS),'common',len(common),'onlyF',len(onlyF),'onlyS',len(onlyS))
for k,v in sorted(cat.items()):
    print('\n##',k,len(v)); 
    byroot=collections.Counter('.'.join(x[0].split('.')[:3]) if x[0].startswith('mode') else '.'.join(x[0].split('.')[:2]) for x in v)
    print('   by area',dict(byroot.most_common(8)))
    for x in v[:5]: print('   ',x)
print('\nB alias differs but resolves to same value:',len(B_same))
# structure
def group(keys):
    c=collections.Counter()
    for k in keys:
        s=k.split('.'); c[(s[0], '.'.join(s[2:4]) if s[0] in('breakpoint',) else ('.'.join(s[3:5]) if s[0]=='mode' else '.'.join(s[1:3])))]+=1
    return c
print('\nonly Figma:',group(onlyF).most_common(12)); print('only Studio:',group(onlyS).most_common(12))
# literal count per scheme in studio vs figma for mode tokens
for name,T in (('figma',FF),('studio',SS)):
    c=collections.Counter()
    for k,t in T.items():
        if k.startswith('mode.') and t.get('$type')=='color':
            c[k.split('.')[2]+(' literal' if kind(t['$value'])=='literal' else ' alias')]+=1
    print(name,{k:v for k,v in sorted(c.items()) if 'literal' in k})
# mode cells that exist for some schemes but not all (holes)
def holes(T):
    paths=collections.defaultdict(set)
    for k in T:
        if k.startswith('mode.'):
            s=k.split('.'); paths['.'.join(s[3:])].add(s[1]+'.'+s[2])
    allcells=set(); [allcells.update(v) for v in paths.values()]
    return {p:len(allcells-c) for p,c in paths.items() if len(allcells-c)}
hf,hs=holes(FF),holes(SS); print('\nholes (token missing in some scheme/mode):',len(hf),'figma /',len(hs),'studio'); print(list(hf.items())[:5],list(hs.items())[:5])
# breakpoint holes
def bph(T):
    p=collections.defaultdict(set)
    for k in T:
        if k.startswith('breakpoint.'): s=k.split('.'); p['.'.join(s[2:])].add(s[1])
    allb={x for v in p.values() for x in v}; return {k:sorted(allb-v) for k,v in p.items() if allb-v}
print('breakpoint holes figma',bph(FF),'\nstudio',bph(SS))

print('\n=========== extra checks ===========')
# broken references per doc
def refs(T):
    out=[]
    for k,t in T.items():
        v=t['$value']
        vals=[v] if not isinstance(v,dict) or 'hex' in v else list(v.values())
        for x in vals:
            if isref(x) and x[1:-1] not in T: out.append((k,x))
    return out
for n,T in (('figma',FF),('studio',SS)):
    b=refs(T); print(n,'broken references:',len(b), b[:4])
# classify B by family transition
def fam(p):
    s=p.split('.'); 
    if s[0]=='core': return '.'.join(s[:3])
    return '.'.join(s[:2])
tr=collections.Counter()
ex={}
for k,a,b in cat['B alias points elsewhere']:
    fa,fb=fam(a[1:-1]),fam(b[1:-1]); key=(fa,fb); tr[key]+=1; ex.setdefault(key,(k,a,b))
print('\nB alias points elsewhere: top family transitions')
for (fa,fb),n in tr.most_common(14): print(' ',n,fa,'->',fb,'  e.g.',ex[(fa,fb)][0])
# brand literals: relinkable or not
core_hex=collections.defaultdict(list)
for k,t in SS.items():
    if k.startswith('core.') and t.get('$type')=='color' and isinstance(t['$value'],dict): core_hex[(t['$value']['hex'],t['$value'].get('alpha',1))].append(k)
lit=[(k,t['$value']) for k,t in SS.items() if k.startswith('mode.') and t.get('$type')=='color' and isinstance(t['$value'],dict)]
uniq=sum(1 for k,v in lit if len(core_hex.get((v['hex'],v.get('alpha',1)),[]))==1); amb=sum(1 for k,v in lit if len(core_hex.get((v['hex'],v.get('alpha',1)),[]))>1); none=[k for k,v in lit if not core_hex.get((v['hex'],v.get('alpha',1)))]
print('\nstudio literal colour cells',len(lit),': one core match',uniq,'| ambiguous',amb,'| no core colour',len(none))
g=collections.Counter(k.split('.')[3]+'.'+k.split('.')[4] if k.split('.')[3]!='elevation' else 'elevation' for k in none); print(' no-core by group',dict(g))
# does figma have an alias for each of those, and to what family
fig_alias=[(k,FF[k]['$value']) for k in none if k in FF and isref(FF[k]['$value'])]; print(' of those, alias in Figma:',len(fig_alias),'not in Figma:',len(none)-len(fig_alias))
# non-brand schemes in studio: any alias to token that resolves to literal in studio brand? skip
# same-hex different alias between light brand and figma resolved? skip
# Figma-side: tokens the Figma export lacks vs studio (functional destructive text-on-subtle)
print('\nfigma lacks',[k for k in onlyS if 'brand.functional.destructive' in k and k.startswith('mode.light')][:6])

print('\n=========== appendix data ===========')
amb_cells=[(k,v['hex']) for k,v in lit if len(core_hex.get((v['hex'],v.get('alpha',1)),[]))>1]
print('AMBIG',amb_cells)
print('NOCORE')
for k in sorted(none): print(' ',k, SS[k]['$value']['hex'], '| figma:', FF[k]['$value'] if k in FF else '— (not in Figma export)')
print('NUMFLAT')
for k,a,b in cat['A alias in Figma, literal in Studio']:
    if k.startswith('breakpoint'): print(' ',k,a,'->',b, '| core in studio:',[c for c,t in SS.items() if c.startswith('core.font-sizes') and t['$value']==b][:2])
