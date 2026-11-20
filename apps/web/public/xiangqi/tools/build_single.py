from pathlib import Path
import base64,json,re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
css=(root/'css/style.css').read_text(encoding='utf-8')
html=re.sub(r'<link rel="stylesheet" href="css/style.css(?:\?[^"]*)?">',lambda _: '<style>\n'+css+'\n</style>',html)
pieces={p.stem:'data:image/svg+xml;base64,'+base64.b64encode(p.read_bytes()).decode('ascii') for p in (root/'img/pieces').glob('*.svg')}
def safe(text):return re.sub(r'</script',r'<\/script',text,flags=re.I)
worker=(root/'js/engine.js').read_text(encoding='utf-8')+'\n'+(root/'js/ai.js').read_text(encoding='utf-8')+'\n'+(root/'js/ai-worker.js').read_text(encoding='utf-8').replace("importScripts('engine.js', 'ai.js');",'')
worker_setup='try { window.__XQ_WORKER_URL__=URL.createObjectURL(new Blob(['+json.dumps(worker,ensure_ascii=False)+'],{type:"text/javascript"})); window.addEventListener("unload",function(){URL.revokeObjectURL(window.__XQ_WORKER_URL__);}); } catch(err) {}'
html=html.replace('<script src="js/engine.js"></script>','<script>'+safe(worker_setup)+'</script>\n<script>'+safe((root/'js/engine.js').read_text(encoding='utf-8'))+'</script>')
for name in ['notation','geom','ai','app']:
    code=(root/f'js/{name}.js').read_text(encoding='utf-8')
    if name=='app':code=code.replace("function pieceSVGFileName(p) { return 'img/pieces/' + p + '.svg'; }",'var pieceData='+json.dumps(pieces,separators=(',',':'))+';\n  function pieceSVGFileName(p) { return pieceData[p]; }')
    html=html.replace(f'<script src="js/{name}.js"></script>','<script>\n'+safe(code)+'\n</script>')
target=root/'中国象棋-直接打开.html'
target.write_text(html,encoding='utf-8')
assert not re.search(r'<script[^>]+src=',html)
assert '<link rel="stylesheet"' not in html
print('Built standalone HTML:',target.stat().st_size,'bytes')
