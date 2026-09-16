"""Um segundo jogador de mentira, para testar uma sala sem precisar de outra pessoa.

    py testes/parceiro.py entrar WQEB4N
    py testes/parceiro.py pronto WQEB4N
    py testes/parceiro.py apostar WQEB4N 500
    py testes/parceiro.py jogar WQEB4N PARAR
    py testes/parceiro.py estado WQEB4N
    py testes/parceiro.py auto WQEB4N 500     # aposta e joga sozinho até a partida acabar

Ele usa um id fixo, então é sempre o mesmo "João" voltando à sala.
"""

import json
import sys
import time
import urllib.error
import urllib.request

from servidor import CHAVE_PUBLICA, URL   # mesmo endereço e chave pública do teste

JOGADOR = {'id': 'parceiro-de-teste', 'nome': 'João (teste)', 'avatar': '🂱'}
SEGREDO = 'segredo-do-parceiro-de-teste'


def chamar(acao, **dados):
    corpo = json.dumps({'acao': acao, 'jogador': JOGADOR, 'segredo': SEGREDO, **dados}).encode()
    req = urllib.request.Request(URL, data=corpo, method='POST', headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {CHAVE_PUBLICA}',
        'apikey': CHAVE_PUBLICA,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


def resumir(r):
    if 'erro' in r:
        return f"ERRO {r['erro']['motivo']}: {r['erro']['mensagem']}"
    v = r['visao']
    quem = {j['id']: j['nome'] for j in v['jogadores']}
    linhas = [f"sala {v['codigo']} · {v['status']} · rodada {v['rodada']}"]
    if v['vezDe']:
        linhas.append(f"  vez de: {quem.get(v['vezDe'], v['vezDe'])}")
    for j in v['jogadores']:
        maos = ' | '.join(
            ' '.join(c['valor'] + c['naipe'] for c in m['cartas']) + f" ({m['valor']})"
            for m in j['maos']
        )
        linhas.append(f"  {j['nome']}: {j['fichas']} fichas {maos}")
    d = v['dealer']
    mostra = ' '.join(c['valor'] + c['naipe'] for c in d['cartas'])
    linhas.append(f"  dealer: {mostra}{' + escondida' if d['escondidas'] else ''}")
    return '\n'.join(linhas)


def auto(codigo, valor):
    """Joga sozinho: aposta o valor pedido e sempre para, até a partida acabar."""
    for _ in range(200):
        r = chamar('estado', codigo=codigo)
        if 'erro' in r:
            print(resumir(r))
            return
        v = r['visao']
        eu = next((j for j in v['jogadores'] if j['id'] == JOGADOR['id']), None)
        if v['status'] == 'APOSTAS' and eu and not eu['apostaPendente'] and eu['fichas'] >= valor:
            print('apostando', valor)
            chamar('apostar', codigo=codigo, valor=valor)
        elif v['status'] == 'TURNO_JOGADORES' and v['vezDe'] == JOGADOR['id']:
            print('minha vez: parando')
            chamar('agir', codigo=codigo, jogada='PARAR')
        elif v['status'] == 'PARTIDA_FINALIZADA':
            print(resumir(r))
            print('campeão:', ', '.join(c['nome'] for c in v['campeoes']))
            return
        time.sleep(1.5)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    comando, codigo = sys.argv[1], sys.argv[2].upper()
    extra = sys.argv[3] if len(sys.argv) > 3 else None

    if comando == 'entrar':
        print(resumir(chamar('entrar', codigo=codigo)))
    elif comando == 'pronto':
        print(resumir(chamar('pronto', codigo=codigo, valor=True)))
    elif comando == 'apostar':
        print(resumir(chamar('apostar', codigo=codigo, valor=int(extra or 500))))
    elif comando == 'jogar':
        print(resumir(chamar('agir', codigo=codigo, jogada=(extra or 'PARAR').upper())))
    elif comando == 'estado':
        print(resumir(chamar('estado', codigo=codigo)))
    elif comando == 'sair':
        print(resumir(chamar('sair', codigo=codigo)))
    elif comando == 'auto':
        auto(codigo, int(extra or 500))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
