"""Servidor de desenvolvimento do BlackJack Club.

O `http.server` padrão manda Last-Modified e o navegador passa a reusar módulos
ES do cache mesmo depois de recarregar a página — o que já fez teste rodar contra código velho sem avisar. Aqui todo arquivo sai com
no-store, então o que roda é sempre o que está no disco.

Escuta em todas as interfaces para dar pra abrir no celular pela rede local.
É um servidor de arquivos estáticos sem autenticação: qualquer um na mesma rede
enxerga a pasta do projeto enquanto ele estiver de pé.
"""

import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SemCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, formato, *args):
        if '404' in (formato % args):
            super().log_message(formato, *args)


def ip_da_rede():
    """Endereço que o celular deve usar. Não abre conexão de verdade: só
    pergunta ao sistema qual interface ele usaria para sair."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except OSError:
        return None


if __name__ == '__main__':
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    raiz = sys.argv[2] if len(sys.argv) > 2 else '.'
    servidor = ThreadingHTTPServer(('0.0.0.0', porta), partial(SemCache, directory=raiz))

    print(f'BlackJack Club servindo {raiz} (sem cache)')
    print(f'  neste PC:  http://localhost:{porta}')
    rede = ip_da_rede()
    if rede:
        print(f'  no celular: http://{rede}:{porta}   (mesma rede Wi-Fi)')
    print('Ctrl+C para parar.')
    servidor.serve_forever()
