"""Local Say Well server. Run: OPENAI_API_KEY=... python3 server.py
(or OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=qwen2.5:7b for a local model)."""
import json
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import URLError
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent

def load_local_env():
    """Load supported local settings without overriding shell configuration."""
    env_file = ROOT / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text().splitlines():
        name, separator, value = line.strip().partition('=')
        if separator and name in {'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'PORT'}:
            os.environ.setdefault(name, value.strip().strip('\"\''))

from interpretation import FIELDS, REGIONS, PROMPT, SCHEMA, TRANSLATION_PROMPT, TRANSLATION_SCHEMA, validate_result


OPENAI_URL = 'https://api.openai.com/v1'


def ai_base_url():
    # OPENAI_BASE_URL points at any OpenAI-compatible server, e.g. a local
    # Ollama model at http://localhost:11434/v1. Unset means OpenAI.
    return (os.environ.get('OPENAI_BASE_URL') or OPENAI_URL).rstrip('/')


def ai_configured():
    return bool(os.environ.get('OPENAI_API_KEY') or os.environ.get('OPENAI_BASE_URL'))


def model_request(key, messages, schema, name):
    base = ai_base_url()
    payload = {'model': os.environ.get('OPENAI_MODEL', 'gpt-4.1'),
               'temperature': 0.2,
               'response_format': {'type': 'json_schema', 'json_schema': {
                   'name': name, 'strict': True, 'schema': schema}},
               'messages': messages}
    if base == OPENAI_URL:
        payload['store'] = False
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer '+key
    return Request(base+'/chat/completions', data=json.dumps(payload).encode(), headers=headers)


def model_json(key, messages, schema, name):
    request = model_request(key, messages, schema, name)
    # Local models on a laptop are slower than the hosted API.
    timeout = 55 if ai_base_url() == OPENAI_URL else 180
    with urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    return json.loads(result['choices'][0]['message']['content'])


def interpret(key, messages):
    # Isolate literal translation from conversation/summary generation so helper
    # questions and corrected history cannot leak into the original translation.
    latest = next(m['content'] for m in reversed(messages) if m['role'] == 'user')
    with ThreadPoolExecutor(max_workers=2) as pool:
        translation = pool.submit(model_json, key,
                                  [{'role':'system','content':TRANSLATION_PROMPT},
                                   {'role':'user','content':latest}],
                                  TRANSLATION_SCHEMA, 'original_translation')
        result = model_json(key, [{'role':'system','content':PROMPT}]+messages,
                            SCHEMA, 'symptom_interpretation')
        translated = translation.result()
        # English needs no translation: preserve it verbatim instead of allowing
        # a translation model to paraphrase or accidentally switch languages.
        result['translation'] = latest if translated['source_language'].lower() in {'en', 'eng', 'english'} else translated['translation']
    return validate_result(result)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/'body-painter'),**kwargs)
    def log_message(self,*args):
        pass  # Do not log symptom text or request data.
    def send_json(self,status,data):
        body=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.path=='/api/config':
            return self.send_json(200,{'ai':ai_configured()})
        if self.path.startswith('/api/'):
            return self.send_json(404,{'error':'Not found'})
        return super().do_GET()
    def do_POST(self):
        if self.path!='/api/interpret':
            return self.send_json(404,{'error':'Not found'})
        # Browser calls must be same origin. Bind locally, with no CORS allowance.
        # Behind an HTTPS proxy (Replit, Render) the page origin is https:// and the
        # public host may arrive as X-Forwarded-Host.
        origin=self.headers.get('Origin')
        hosts={h for h in (self.headers.get('Host',''),self.headers.get('X-Forwarded-Host','').split(',')[0].strip()) if h}
        if origin and origin not in {f'{scheme}://{h}' for h in hosts for scheme in ('http','https')}:
            return self.send_json(403,{'error':'Origin not allowed'})
        key=os.environ.get('OPENAI_API_KEY','')
        if not ai_configured():
            return self.send_json(503,{'error':'AI interpretation is not configured. Use the manual flow.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=64000: raise ValueError('Invalid request size')
            data=json.loads(self.rfile.read(length))
            messages=data.get('messages')
            if not isinstance(messages,list) or not 1<=len(messages)<=30: raise ValueError('Invalid conversation')
            for message in messages:
                if not isinstance(message,dict) or message.get('role') not in ('user','assistant') or not isinstance(message.get('content'),str) or not 0<len(message['content'])<=4000:
                    raise ValueError('Invalid message')
            clean_messages=[{'role':m['role'],'content':m['content']} for m in messages]
            return self.send_json(200,interpret(key,clean_messages))
        except (ValueError,TypeError,AttributeError):
            return self.send_json(400,{'error':'The request or interpretation was incomplete. Please try again or enter details manually.'})
        except (URLError,TimeoutError,KeyError,IndexError,StopIteration):
            return self.send_json(502,{'error':'The interpretation service is unavailable. Please retry or continue manually.'})

if __name__=='__main__':
    load_local_env()
    port=int(os.environ.get('PORT','8080'))
    # Local by default; hosting platforms set HOST=0.0.0.0 to accept outside traffic.
    host=os.environ.get('HOST','127.0.0.1')
    print(f'Say Well: http://localhost:{port} (AI {"off" if not ai_configured() else "on via "+ai_base_url()})')
    ThreadingHTTPServer((host,port),Handler).serve_forever()
