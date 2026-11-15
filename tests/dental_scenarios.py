"""Live synthetic dental routing checks; requires the local configured server."""
import json
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
CASES=[
 ('Chinese toothache','我的左上方后牙从昨天开始疼，旁边牙龈也肿了。',True,'upper','left'),
 ('Spanish toothache','Me duele una muela de abajo a la derecha al beber agua fría.',True,'lower','right'),
 ('Negative dental','My left knee hurts. I have no tooth pain or gum symptoms.',False,None,None),
 ('Vague dental','My tooth hurts but I cannot tell which one.',True,None,None),
 ('Mixed symptoms','My upper right back tooth hurts and my left knee aches.',True,'upper','right'),
 ('Wisdom tooth','My lower left wisdom tooth hurts.',True,'lower','left'),
]
def run(case):
 name,text,involved,jaw,side=case
 request=Request('http://localhost:8080/api/interpret',data=json.dumps({'messages':[{'role':'user','content':text}]}).encode(),headers={'Content-Type':'application/json'})
 with urlopen(request,timeout=70) as response:data=json.load(response)
 dental=data['dental']
 assert dental['involved']==involved,(name,dental)
 if jaw:assert any(x['jaw']==jaw and x['side']==side for x in dental['locations']),(name,dental)
 if name=='Vague dental':assert not any(x['tooth'] for x in dental['locations'])
 if name=='Mixed symptoms':assert any(x['region']=='knee' and x['side']=='left' for x in data['regions'])
 if name=='Wisdom tooth':assert any(x['area']=='wisdom' or x['tooth']%10==8 for x in dental['locations'])
 print('PASS',name,json.dumps(dental))
if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(run,CASES))
