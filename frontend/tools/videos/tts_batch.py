"""Narração (voz feminina pt-BR, Kokoro pf_dora) para out/texts.json → out/tts/<id>.wav + durations.json (cache por conteúdo).
Cada fala pode trazer `speed` (aulas no padrão novo usam 0,92; sem `speed` vale 1,0, como nas aulas antigas)."""
import sys, json, os, hashlib, re, soundfile as sf
from kokoro_onnx import Kokoro
items = json.load(open('out/texts.json', encoding='utf-8'))
out = 'out/tts'; os.makedirs(out, exist_ok=True)
cache = 'cache'; os.makedirs(cache, exist_ok=True)
# pronúncia: siglas e nomes
FIX = [(r'developers\.facebook\.com', 'dévelopers ponto feisbuque ponto com'), (r'business\.facebook\.com', 'bíznes ponto feisbuque ponto com'),
       (r'rusten\.lorler\.com\.br', 'rústen ponto lorler ponto com ponto bê érre'), (r'\bFacebook\b', 'Feisbuque'), (r'\bGraph\b', 'Gráf'),
       (r'\bWABA\b', 'uába'), (r'\bID\b', 'í dê'), (r'\bPIN\b', 'pín'), (r'\bSMS\b', 'ésse ême ésse'), (r'\bEAA\b', 'é á á'),
       (r'\bwebhook\b', 'uébruque'), (r'\bWebhook\b', 'Uébruque'), (r'\bPOST\b', 'pôst'), (r'\bGET\b', 'guét'), (r'\bManager\b', 'Mânager'),
       (r'\bcallback\b', 'cólbaque'), (r'\bsubscribed apps\b', 'sabscráibd épis'), (r'\bmessages\b', 'mécidjes'), (r'\bregister\b', 'rédjister'),
       (r'\bNFS-e\b', 'nota fiscal de serviço'), (r'\bNF-e\b', 'nota fiscal eletrônica'), (r'\bNFe\b', 'ene éfe é'), (r'\bXML\b', 'xis ême éle'),
       (r'\bpfx\b', 'pê éfe xis'), (r'\bp12\b', 'pê doze'), (r'\bA1\b', 'á um'), (r'\bISS\b', 'í ésse ésse'), (r'\bCNAE\b', 'cê ene á é'),
       (r'\bDPS\b', 'dê pê ésse'), (r'\bIBGE\b', 'í bê gê é'), (r'\bMEI\b', 'mêi'), (r'\bSIEG\b', 'Sígui'), (r'\bFocus\b', 'Fócus'),
       (r'\bRUSTEN\b', 'Rústen'), (r'\bCIFREN\b', 'Cífren'), (r'\bLORLER\b', 'Lórler'), (r'\bDRE\b', 'dê érre é'), (r'\bTED\b', 'tê é dê'), (r'\bDOC\b', 'dóqui'), (r'\bIA\b', 'í á'), (r'\bExcel\b', 'Écsel'), (r'cifren\.lorler\.com\.br', 'cífren ponto lórler ponto com ponto bê érre'), (r'\bPDV\b', 'pê dê vê'), (r'\bSEFAZ\b', 'Sefáz'), (r'\bCSOSN\b', 'cê ésse ó ésse ene'), (r'\bICMS\b', 'í cê ême ésse'), (r'\bFiscal\b', 'Fiscal'), (r'\bNFC-e\b', 'nota fiscal de consumidor'), (r'\bCSC\b', 'cê ésse cê'), (r'\bNCM\b', 'ene cê ême'), (r'\bPIX\b', 'pics'), (r'\bCPF\b', 'cê pê éfe'), (r'\bCNPJ\b', 'cê ene pê jota'), (r'\bCSV\b', 'cê ésse vê'),
       (r'\bOFX\b', 'ó éfe xis'), (r'\bPDF\b', 'pê dê éfe'), (r'\bLGPD\b', 'éle gê pê dê'), (r'\bQR\b', 'quiú ár'), (r'\bRG\b', 'érre gê'), (r'\bCNH\b', 'cê ene agá'),
       (r'\bAPI\b', 'a pê í'), (r'\bCRM\b', 'cê érre ême'), (r'\bRCF\b', 'érre cê éfe'), (r'\bWhatsApp\b', 'uótsápi'), (r'\bControl\b', 'Contról'), (r'\bK\b', 'cá'),
       (r'\bOAuth2\b', 'ó áuti dois'), (r'\bOAuth\b', 'ó áuti'), (r'\bhttps\b', 'agá tê tê pê ésse'), (r'\bURL\b', 'u érre éle'), (r'\bJSON\b', 'djêisson'),
       (r'\bClient ID\b', 'cláienti ái dí'), (r'\bClient Secret\b', 'cláienti síkret'), (r'\bsecret\b', 'síkret'), (r'\btoken\b', 'tôquen'), (r'\bBearer\b', 'bérer')]
k = None
dpath = os.path.join(out, 'durations.json')
durs = json.load(open(dpath)) if os.path.exists(dpath) else {}  # soma às durações das aulas já preparadas
for it in items:
    text = it['text'].strip()
    for a, b in FIX: text = re.sub(a, b, text)
    speed = float(it.get('speed', 1.0))
    h = hashlib.sha1(f"pf_dora|{speed}|{text}".encode()).hexdigest()[:16]
    cp = os.path.join(cache, h + '.wav')
    if not os.path.exists(cp):
        if k is None:
            d = os.environ.get('KOKORO_DIR', '/home/claude/promo/models')
            k = Kokoro(os.path.join(d, 'kokoro-v1.0.onnx'), os.path.join(d, 'voices-v1.0.bin'))
        s, sr = k.create(text, voice='pf_dora', speed=speed, lang='pt-br')
        sf.write(cp, s, sr)
    info = sf.info(cp)
    dst = os.path.join(out, it['id'] + '.wav')
    if os.path.lexists(dst): os.remove(dst)
    os.symlink(os.path.abspath(cp), dst)
    durs[it['id']] = info.frames / info.samplerate
json.dump(durs, open(dpath, 'w'), indent=1)
print(f"{len(items)} falas, {sum(durs.values()):.1f}s")
