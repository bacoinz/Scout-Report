# Scout Report

O "Quem é Quem" do futebol, multijogador e em tempo real, para jogar com amigos (partilha o link no Discord e
conversa por voz no Discord). Cada um tem um jogador secreto; à vez, faz-se uma pergunta estruturada, uma pergunta
livre ou um palpite, e cada resposta fica carimbada no relatório de olheiro desse jogador.

O projeto tem três partes:

1. **`pipeline/`** (Python, corre no teu computador): constrói a base de jogadores a partir da Wikidata, da
   Wikipédia, do zerozero e do transfermarkt-datasets, e exporta-a para o Cloudflare D1.
2. **`jogo/`** (Cloudflare Workers + Durable Objects + D1): salas, voltas, perguntas, fichas e pontuação. Em jogo não
   corre IA nenhuma.
3. **Desafio do Dia** (no mesmo Worker): um jogador mistério por dia, igual para toda a gente.

`partilhado/` tem as regras e as listas comuns às duas partes (perguntas, países, casos de teste dos nomes).

## Estado

- [x] Passo 1 — tema partilhado e mockup do relatório de olheiro (`docs/tema-partilhado.md`, `docs/capturas/`)
- [ ] Passo 2 — pipeline com uma amostra de 30 jogadores e relatório de qualidade
- [ ] Passo 3 — lista dos míticos e processamento completo
- [ ] Passo 4 — jogo: salas, rotação, perguntas, fichas, pontuação, palpites
- [ ] Passo 5 — Volta Joker
- [ ] Passo 6 — Desafio do Dia
- [ ] Passo 7 — exportação para o D1 e deploy

## Ver o mockup

```bash
cd jogo
npm install
npm run assets        # copia as fontes (Anton, Inter, Courier Prime, Caveat) para public/fontes
npm run contraste     # verifica os contrastes dos tokens do tema
cd ..
py -3.12 -m http.server 8790 --bind 127.0.0.1 --directory jogo/public
```

Abre `http://127.0.0.1:8790/mockup.html`.

## Créditos

Fontes: Anton, Inter, Courier Prime e Caveat (SIL OFL), via Fontsource. As licenças estão em `jogo/public/LICENCAS.txt`.
