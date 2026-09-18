"""Teste de ponta a ponta do servidor das salas.

Fala com a Edge Function publicada exatamente como o navegador fala: dois
jogadores de mentira criam uma sala, apostam e jogam uma partida inteira.

Existe porque os testes do motor rodam em memória e não provam nada sobre a
parte que pode quebrar em produção: identidade, trava de concorrência, prazo
contado pelo relógio do servidor e o que a resposta deixa vazar.

    py testes/servidor.py
"""

import json
import sys
import urllib.error
import urllib.request

URL = 'https://zwltwqvddvacbgpswsac.supabase.co/functions/v1/sala'
CHAVE_PUBLICA = (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bHR3cXZkZHZhY2JncHN3c2FjIiwicm9sZSI6ImFub24i'
    'LCJpYXQiOjE3ODk1ODQ0ODgsImV4cCI6MjEwNTE2MDQ4OH0.'
    'HGOoFrtY5uT75SSuTgtPHf0Q3XsmM9HmrrinjWBdSvE'
)

falhas = []
passou = 0


def chamar(corpo):
    dados = json.dumps(corpo).encode('utf-8')
    req = urllib.request.Request(URL, data=dados, method='POST', headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {CHAVE_PUBLICA}',
        'apikey': CHAVE_PUBLICA,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode('utf-8'))


def checar(condicao, descricao, detalhe=''):
    global passou
    if condicao:
        passou += 1
        print(f'  PASSOU  {descricao}')
    else:
        falhas.append(f'{descricao} {detalhe}')
        print(f'  FALHOU  {descricao} {detalhe}')


MAYK = {'jogador': {'id': 'teste-mayk', 'nome': 'Mayk', 'avatar': '🂡'}, 'segredo': 'segredo-mayk'}
JOAO = {'jogador': {'id': 'teste-joao', 'nome': 'João', 'avatar': '🂱'}, 'segredo': 'segredo-joao'}


def main():
    print('Servidor das salas —', URL)

    # ---------------------------------------------------------- criar sala
    r = chamar({**MAYK, 'acao': 'criar', 'nome': 'Mesa de teste', 'config': {
        'fichasIniciais': 10000, 'apostaMin': 500, 'apostaMax': 5000,
        'limiteRodadas': 2, 'maxJogadores': 4, 'tempoAposta': 60, 'tempoTurno': 60,
    }})
    checar('visao' in r, 'A sala é criada', r.get('erro', ''))
    if 'visao' not in r:
        return encerrar()
    codigo = r['visao']['codigo']
    print(f'  sala {codigo}')
    checar(len(codigo) == 6, 'O código tem 6 caracteres')
    checar(r['visao']['config']['fichasIniciais'] == 10000, 'As fichas iniciais são as do ADM')
    checar(r['visao']['souHost'] is True, 'Quem criou é o ADM')

    # ------------------------------------------------------------- entrar
    r = chamar({**JOAO, 'acao': 'entrar', 'codigo': codigo})
    checar('visao' in r, 'O convidado entra pelo código', r.get('erro', ''))
    checar(len(r['visao']['jogadores']) == 2, 'A sala fica com dois jogadores')
    checar(r['visao']['souHost'] is False, 'O convidado não é ADM')

    # Segredo errado não pode passar por cima de quem já está na sala.
    r = chamar({'jogador': JOAO['jogador'], 'segredo': 'chute', 'acao': 'estado', 'codigo': codigo})
    checar(r.get('erro', {}).get('motivo') == 'identidade',
           'Segredo errado é recusado', r)

    # Quem não entrou não age.
    r = chamar({'jogador': {'id': 'intruso', 'nome': 'Intruso'}, 'segredo': 'x',
                'acao': 'apostar', 'codigo': codigo, 'valor': 500})
    checar(r.get('erro', {}).get('motivo') == 'sem-assento', 'Estranho não aposta', r)

    # Só o ADM inicia.
    r = chamar({**JOAO, 'acao': 'iniciar', 'codigo': codigo})
    checar(r.get('erro', {}).get('motivo') == 'sem-permissao', 'Só o ADM começa a partida', r)

    # ------------------------------------------------------------ começar
    r = chamar({**MAYK, 'acao': 'iniciar', 'codigo': codigo})
    checar(r['visao']['status'] == 'APOSTAS', 'A partida abre na fase de apostas', r)
    checar(r['visao']['prazo'] is not None, 'A fase de apostas tem prazo')

    # Aposta fora dos limites.
    r = chamar({**MAYK, 'acao': 'apostar', 'codigo': codigo, 'valor': 10})
    checar(r.get('erro', {}).get('motivo') == 'aposta', 'Aposta abaixo da mínima é recusada', r)
    r = chamar({**MAYK, 'acao': 'apostar', 'codigo': codigo, 'valor': 999999})
    checar(r.get('erro', {}).get('motivo') == 'aposta', 'Aposta acima da máxima é recusada', r)

    # Apostas válidas.
    r = chamar({**MAYK, 'acao': 'apostar', 'codigo': codigo, 'valor': 1000})
    checar(r['visao']['status'] == 'APOSTAS', 'Com um só apostando, a rodada espera')
    r = chamar({**MAYK, 'acao': 'apostar', 'codigo': codigo, 'valor': 1000})
    checar(r.get('erro', {}).get('motivo') == 'ja-apostou', 'Ninguém aposta duas vezes', r)

    r = chamar({**JOAO, 'acao': 'apostar', 'codigo': codigo, 'valor': 1000})
    visao = r['visao']
    checar(visao['status'] == 'TURNO_JOGADORES', 'Com todos apostando, distribui', r)

    # --------------------------------------------------- o que dá para ver
    checar(len(visao['dealer']['cartas']) == 1, 'Só a carta aberta do dealer aparece')
    checar(visao['dealer']['escondidas'] == 1, 'A outra fica escondida')
    texto = json.dumps(visao)
    checar('"shoe"' not in texto and '"indice"' not in texto, 'O shoe não vai para o navegador')
    checar(visao['cartasNoShoe'] < 312, 'Mas a contagem de cartas vem')
    eu = [j for j in visao['jogadores'] if j['souEu']][0]
    outro = [j for j in visao['jogadores'] if not j['souEu']][0]
    checar(len(eu['maos'][0]['cartas']) == 2, 'Recebi duas cartas')
    checar(len(outro['maos'][0]['cartas']) == 2, 'E vejo as duas do outro (§54)')

    # ------------------------------------------------------ um por vez
    vez = visao['vezDe']
    fora = JOAO if vez == MAYK['jogador']['id'] else MAYK
    r = chamar({**fora, 'acao': 'agir', 'codigo': codigo, 'jogada': 'PARAR'})
    checar(r.get('erro', {}).get('motivo') == 'fora-da-vez', 'Quem não é da vez não joga', r)

    # Joga a partida inteira, sempre parando, até acabar.
    rodadas = 0
    for _ in range(80):
        atual = MAYK if visao['vezDe'] == MAYK['jogador']['id'] else JOAO
        if visao['status'] == 'TURNO_JOGADORES':
            r = chamar({**atual, 'acao': 'agir', 'codigo': codigo, 'jogada': 'PARAR'})
        elif visao['status'] == 'RESULTADO':
            rodadas += 1
            r = chamar({**MAYK, 'acao': 'tique', 'codigo': codigo})
        elif visao['status'] == 'APOSTAS':
            chamar({**MAYK, 'acao': 'apostar', 'codigo': codigo, 'valor': 500})
            r = chamar({**JOAO, 'acao': 'apostar', 'codigo': codigo, 'valor': 500})
        else:
            break
        if 'visao' not in r:
            checar(False, 'A partida segue sem erro', r)
            break
        visao = r['visao']
        if visao['status'] == 'PARTIDA_FINALIZADA':
            break

    checar(visao['status'] == 'PARTIDA_FINALIZADA', 'A partida termina no limite de rodadas', visao['status'])
    checar(visao['rodada'] == 2, 'Jogou as duas rodadas combinadas', visao['rodada'])
    checar(len(visao['dealer']['cartas']) >= 2, 'No fim, a carta escondida aparece')
    checar(len(visao['campeoes']) >= 1, 'A partida aponta campeão')
    checar(all(j['fichas'] >= 0 for j in visao['jogadores']), 'Ninguém fica com ficha negativa')
    soma = sum(j['fichas'] for j in visao['jogadores'])
    print(f'  fichas no fim: {soma} (começaram com 20000)')

    # Sala fechada não aceita mais jogada.
    r = chamar({**MAYK, 'acao': 'agir', 'codigo': codigo, 'jogada': 'PEDIR'})
    checar(r.get('erro', {}).get('motivo') == 'fase', 'Partida encerrada não aceita jogada', r)

    # A chave pública não pode ler as tabelas: é o que impede alguém de abrir o
    # console do navegador e ver a carta escondida do dealer antes da hora.
    for tabela in ('sala', 'sala_jogador'):
        req = urllib.request.Request(
            f'https://zwltwqvddvacbgpswsac.supabase.co/rest/v1/{tabela}?select=*',
            headers={'apikey': CHAVE_PUBLICA, 'Authorization': f'Bearer {CHAVE_PUBLICA}'})
        try:
            with urllib.request.urlopen(req, timeout=20) as resposta:
                linhas = json.loads(resposta.read().decode())
            checar(linhas == [], f'A tabela {tabela} não entrega nada para a chave pública', linhas)
        except urllib.error.HTTPError as e:
            checar(e.code in (401, 403, 404), f'A tabela {tabela} barra a chave pública', e.code)

    # ------------------------------------------------ sala aberta com senha
    r = chamar({**MAYK, 'acao': 'criar', 'nome': 'Mesa trancada', 'senha': 'truco123',
                'config': {'publica': True, 'fichasIniciais': 10000, 'apostaMin': 500, 'apostaMax': 5000}})
    trancada = r['visao']['codigo']
    checar(r['visao']['temSenha'] is True, 'A sala nasce com senha')
    checar('truco123' not in json.dumps(r), 'A senha não volta na resposta')

    lista = chamar({'acao': 'publicas'}).get('salas', [])
    linha = next((s for s in lista if s['codigo'] == trancada), None)
    checar(linha is not None and linha['tem_senha'] is True, 'A lista pública mostra o cadeado', linha)
    checar(linha is not None and 'senha' not in {k for k in linha if k != 'tem_senha'},
           'A lista não traz a senha', linha)

    r = chamar({**JOAO, 'acao': 'entrar', 'codigo': trancada})
    checar(r.get('erro', {}).get('motivo') == 'senha', 'Sem senha não entra', r)
    r = chamar({**JOAO, 'acao': 'entrar', 'codigo': trancada, 'senha': 'chute'})
    checar(r.get('erro', {}).get('motivo') == 'senha', 'Senha errada não entra', r)
    r = chamar({**JOAO, 'acao': 'entrar', 'codigo': trancada, 'senha': 'truco123'})
    checar('visao' in r, 'Senha certa entra', r.get('erro'))
    r = chamar({**JOAO, 'acao': 'entrar', 'codigo': trancada})
    checar('visao' in r, 'Quem já entrou volta sem senha', r.get('erro'))

    # O teste não pode deixar sala de mentira na lista pública do site de verdade.
    chamar({**JOAO, 'acao': 'sair', 'codigo': trancada})
    chamar({**MAYK, 'acao': 'sair', 'codigo': trancada})
    lista = chamar({'acao': 'publicas'}).get('salas', [])
    checar(all(s['codigo'] != trancada for s in lista), 'A sala do teste some da lista ao esvaziar')

    # ---------------------------------------------------------- crupiê humano
    r = chamar({**MAYK, 'acao': 'criar', 'nome': 'Mesa com crupiê', 'config': {
        'crupieHumano': True, 'fichasIniciais': 10000, 'apostaMin': 500, 'apostaMax': 5000,
        'limiteRodadas': 10, 'tempoAposta': 60, 'tempoTurno': 60}})
    mesa = r['visao']['codigo']
    chamar({**JOAO, 'acao': 'entrar', 'codigo': mesa})
    r = chamar({**MAYK, 'acao': 'crupie', 'codigo': mesa, 'valor': True})
    checar(r.get('visao', {}).get('crupieId') == MAYK['jogador']['id'], 'Mayk assume o crupiê', r.get('erro'))
    r = chamar({**JOAO, 'acao': 'crupie', 'codigo': mesa, 'valor': True})
    checar(r.get('erro', {}).get('motivo') == 'crupie-ocupado', 'Só cabe um crupiê', r)

    chamar({**MAYK, 'acao': 'iniciar', 'codigo': mesa})
    r = chamar({**MAYK, 'acao': 'apostar', 'codigo': mesa, 'valor': 500})
    checar(r.get('erro', {}).get('motivo') == 'crupie', 'O crupiê não aposta', r)

    # Joga até cair na vez do crupiê (uma rodada pode fechar antes, por Blackjack).
    import time
    chegou = False
    for _ in range(4):
        r = chamar({**JOAO, 'acao': 'apostar', 'codigo': mesa, 'valor': 500})
        v = r.get('visao') or chamar({**JOAO, 'acao': 'estado', 'codigo': mesa})['visao']
        if v['status'] == 'TURNO_JOGADORES':
            v = chamar({**JOAO, 'acao': 'agir', 'codigo': mesa, 'jogada': 'PARAR'})['visao']
        if v['status'] == 'TURNO_DEALER' and v['vezDe'] == MAYK['jogador']['id']:
            chegou = True
            break
        time.sleep(6.5)                     # pausa do resultado, e tenta outra rodada
        chamar({**JOAO, 'acao': 'tique', 'codigo': mesa})
    checar(chegou, 'Depois do jogador, a vez é do crupiê')
    if chegou:
        checar(len(v['dealer']['cartas']) >= 2, 'A carta escondida virou para a vez do crupiê')
        r = chamar({**JOAO, 'acao': 'agir', 'codigo': mesa, 'jogada': 'PEDIR'})
        checar(r.get('erro', {}).get('motivo') == 'fora-da-vez', 'Jogador não mexe no dealer', r)
        r = chamar({**MAYK, 'acao': 'agir', 'codigo': mesa, 'jogada': 'PARAR'})
        v = r.get('visao', {})
        checar(v.get('status') == 'RESULTADO', 'O crupiê para quando quer', r.get('erro'))
        crupie = next(j for j in v['jogadores'] if j['id'] == MAYK['jogador']['id'])
        checar(crupie['fichas'] == 10000, 'Banca da casa: o crupiê não ganha nem perde', crupie['fichas'])
        checar(all(l['id'] != MAYK['jogador']['id'] for l in v['ranking']), 'O crupiê fica fora do ranking')

    chamar({**JOAO, 'acao': 'sair', 'codigo': mesa})
    chamar({**MAYK, 'acao': 'sair', 'codigo': mesa})

    # Sala que não existe.
    r = chamar({**MAYK, 'acao': 'estado', 'codigo': 'ZZZZZZ'})
    checar(r.get('erro', {}).get('motivo') == 'sem-sala', 'Código inexistente dá erro claro', r)

    encerrar()


def encerrar():
    print()
    if falhas:
        print(f'{len(falhas)} falha(s) de {passou + len(falhas)}:')
        for f in falhas:
            print(' -', f)
        sys.exit(1)
    print(f'{passou} verificações passaram.')


if __name__ == '__main__':
    main()
