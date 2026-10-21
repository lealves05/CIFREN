// Serviços externos FICTÍCIOS para gravar as aulas sem sair da máquina (porta 4521):
//  - /v1/messages: "Anthropic" falsa — responde conforme o agente (documentos, conciliação, insights, assistente);
//  - /whatsapp/...: "API oficial do WhatsApp" falsa — aceita o envio e devolve um id de mensagem.
// Uso: node fake-externos.mjs   (encerre pelo PID que você iniciou)
import http from 'node:http';
const PORT = Number(process.env.REC_FAKES_PORT || 4521);
const sent = [];
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
// respostas da IA por agente (o prompt de sistema diz qual agente está chamando)
function ai(j) {
  const sys = j.system || '';
  const user = JSON.stringify(j.messages || '');
  if (sys.includes('Agente de Documentos')) {
    return 'Dados lidos: {"doc_type":"boleto","supplier_name":"Papelaria Lápis de Cor Ltda","supplier_document":"12345678000195","number":"4587","issue_date":"2026-10-15","total":389.9,"due_dates":[{"due_date":"2026-11-05","amount":389.9}],"barcode":"34191790010104351004791020150008191230000038990","pix_key":null,"paid_at":null,"description":"Material de escritório","confidence":0.93}';
  }
  if (sys.includes('Agente de Conciliação')) return '{"category_name":"Tarifas bancárias","counterparty_name":"Banco Exemplo","confidence":0.86,"reason":"Débito com o texto TARIFA PACOTE"}';
  if (sys.includes('Agente de Insights')) return '{"items":[{"level":"atencao","title":"Contas a pagar concentradas no dia 10","detail":"Quatro contas vencem no mesmo dia. Vale negociar outra data com um dos fornecedores."},{"level":"info","title":"Recebimentos em dia","detail":"Nenhum cliente em atraso neste mês."}]}';
  if (/saldo|caixa/i.test(user)) return 'O saldo das contas hoje é de R$ 18.420,00. Nos próximos 7 dias entram R$ 6.200,00 e saem R$ 4.870,00, então o caixa deve fechar a semana positivo.';
  if (/atras|vencid/i.test(user)) return 'Há 2 contas a receber em atraso, somando R$ 1.350,00. A maior é da Padaria Pão Quente, de R$ 950,00, vencida há 6 dias.';
  return 'Neste mês, as maiores despesas foram Aluguel (R$ 3.500,00), Fornecedores (R$ 2.980,00) e Energia elétrica (R$ 640,00).';
}
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = req.url.split('?')[0];
    if (u === '/__reset') { sent.length = 0; return json(res, 200, { ok: true }); }
    if (u === '/__sent') return json(res, 200, sent);
    if (u === '/v1/messages') {
      let j = {}; try { j = JSON.parse(body); } catch { /* corpo inválido */ }
      return json(res, 200, { content: [{ type: 'text', text: ai(j) }], usage: { input_tokens: 120, output_tokens: 60 } });
    }
    if (u.startsWith('/whatsapp')) {
      sent.push({ at: Date.now(), body });
      return json(res, 200, { messaging_product: 'whatsapp', messages: [{ id: `wamid.TREINAMENTO${sent.length}` }] });
    }
    json(res, 404, { error: 'não encontrado' });
  });
}).listen(PORT, '127.0.0.1');
