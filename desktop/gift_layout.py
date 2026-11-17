"""Validate a gift-board export against the bundled public gift catalog."""
ACTIONS=('incense','temple','tree','fruit','lamp','lantern','bell','grand')
RANGES={'width':(14,34,23),'top':(5,65,20),'font':(8,18,11),'icon':(16,48,28),'gap':(0,10,4)}
def normalize(data,game,catalog):
 if not isinstance(data,dict) or type(data.get('version')) is not int or data.get('version')!=1 or data.get('game')!=game:raise ValueError('ไฟล์จัดหน้าต้องเป็นเกมเดียวกับเกมที่เปิดอยู่')
 slots=data.get('slots')
 if not isinstance(slots,list) or len(slots)!=8 or not all(isinstance(k,str) for k in slots) or len(set(slots))!=8:raise ValueError('เลือกของขวัญให้ครบ 8 ช่องและไม่ซ้ำกัน')
 indexed={g['key']:g for g in catalog['gifts']}
 if any(k not in indexed for k in slots):raise ValueError('มีของขวัญที่ไม่อยู่ในคลังของรุ่นนี้')
 layout=data.get('layout',{})
 if not isinstance(layout,dict) or layout.get('position','split') not in ('split','left','right','bottom'):raise ValueError('ตำแหน่งแถบไม่ถูกต้อง')
 clean={'position':layout.get('position','split')}
 for key,(low,high,default) in RANGES.items():
  value=layout.get(key,default)
  if isinstance(value,bool) or not isinstance(value,(int,float)) or not low<=value<=high:raise ValueError('ขนาดหรือตำแหน่งแถบเกินช่วงที่กำหนด')
  clean[key]=round(value,1)
 selected=[indexed[k] for k in slots]
 for i,g in enumerate(selected):
  for other in selected[:i]:
   if (not g['id'] or not other['id']) and g['name'].casefold()==other['name'].casefold():raise ValueError('ชื่อของขวัญซ้ำกับรายการที่จับคู่ตามชื่อ เลือกรายการอื่นแทน')
 bindings=[{'action':action,'gift':str(indexed[key]['id'] or indexed[key]['name'])} for action,key in zip(ACTIONS,slots)]
 names=[b['gift'].strip().casefold() for b in bindings]
 if any(not name or len(name)>100 for name in names) or len(set(names))!=8:raise ValueError('ชื่อของขวัญซ้ำกันหรือยาวเกินไป เลือกรายการอื่นแทน')
 return {'version':1,'game':game,'slots':slots,'layout':clean},bindings
