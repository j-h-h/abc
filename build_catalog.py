"""Build separately cacheable GTFS route JSON assets from the official Israeli transit feed.
Usage: python build_catalog.py /path/to/israel-public-transportation.zip ./data
Requires standard library only. Excludes routes other than buses.
"""
from pathlib import Path
import collections,csv,datetime,io,json,sys,zipfile
src=Path(sys.argv[1]) if len(sys.argv)>1 else Path('israel-public-transportation.zip')
out=Path(sys.argv[2]) if len(sys.argv)>2 else Path('data')
out.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(src) as z:
 def rows(name):
  with z.open(name) as f:
   yield from csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig',newline=''))
 routes={r['route_id']:(r['route_short_name'],r['agency_id'],r.get('route_desc','')) for r in rows('routes.txt') if r.get('route_type')=='3'}
 trips={r['trip_id']:(r['route_id'],r['shape_id'],r.get('direction_id',''),r.get('trip_headsign','')) for r in rows('trips.txt') if r['route_id'] in routes and r.get('shape_id')}
 stops={r['stop_id']:(r['stop_code'],round(float(r['stop_lat']),6),round(float(r['stop_lon']),6),r.get('stop_name','')) for r in rows('stops.txt') if r.get('stop_code') and r.get('stop_lat') and r.get('stop_lon')}
 patterns=collections.defaultdict(collections.Counter);current=None;seq=[]
 def finish(tid,entries):
  t=trips.get(tid)
  if t and len(entries)>=2 and all(e in stops for e in entries):patterns[(t[0],t[1])][tuple(entries)]+=1
 with z.open('stop_times.txt') as f:
  next(f)
  for raw in f:
   parts=raw.decode('utf-8-sig').rstrip('\r\n').split(',',5)
   if len(parts)<4:continue
   tid=parts[0]
   if tid!=current:
    if current is not None:finish(current,seq)
    seq=[];current=tid
   if tid in trips:seq.append(parts[3])
  if current is not None:finish(current,seq)
 selected={key:cnt.most_common(1)[0] for key,cnt in patterns.items() if cnt}
 want={sid for (_,sid) in selected}
 chars=collections.defaultdict(list);previous={};length=collections.Counter()
 with z.open('shapes.txt') as f:
  next(f)
  for raw in f:
   parts=raw.rstrip(b'\r\n').split(b',')
   if len(parts)!=4:continue
   sid=parts[0].decode('utf-8','ignore')
   if sid not in want:continue
   try:lat=int(round(float(parts[1])*1000000));lon=int(round(float(parts[2])*1000000));seqnum=int(parts[3])
   except ValueError:continue
   prev=previous.get(sid,(0,0,-1))
   if seqnum<=prev[2]:raise ValueError(f'Unsorted shape {sid}')
   previous[sid]=(lat,lon,seqnum)
   for delta in (lat-prev[0],lon-prev[1]):
    v=(delta<<1) if delta>=0 else ((-delta<<1)-1)
    while v>=32:chars[sid].append(chr((32|(v&31))+63));v>>=5
    chars[sid].append(chr(v+63))
   length[sid]+=1
 encoded={sid:''.join(characters) for sid,characters in chars.items() if length[sid]>=3}
 direction={}
 for tid,(rid,sid,d,h) in trips.items():direction.setdefault((rid,sid),(d,h))
 catalog_stops={val[0]:[val[1],val[2],val[3]] for val in stops.values()}
 lines=collections.defaultdict(list);served=collections.defaultdict(set)
 for (rid,sid),(sequence,count) in selected.items():
  if sid not in encoded:continue
  short,agency,desc=routes[rid];d,h=direction.get((rid,sid),('',''))
  codes=[stops[k][0] for k in sequence]
  row={'r':rid,'s':sid,'d':d,'a':agency,'n':count,'h':h,'c':codes,'x':encoded[sid],'desc':desc}
  lines[short].append(row)
  for code in set(codes):served[code].add(short)
 meta={'schema':2,'source':'GTFS משרד התחבורה','source_date':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'),'lines':sorted(lines),'stops':catalog_stops,'served':{c:sorted(v) for c,v in served.items()}}
 line_dir=out/'line';line_dir.mkdir(exist_ok=True)
 def dump(file,v):file.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 dump(out/'catalog.json',meta)
 for short,items in lines.items():dump(line_dir/f'{short}.json',items)
 import hashlib
 sha=hashlib.sha256(src.read_bytes()).hexdigest()[:16]
 dump(out/'version.json',{'version':sha,'source':'GTFS משרד התחבורה','generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'lines':len(lines),'routes':sum(map(len,lines.values()))})
 print('OK',len(lines),'lines',sum(map(len,lines.values())),'routes',len(meta['stops']),'stops','source sha',sha)