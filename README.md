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
- [x] Passo 2 — pipeline com uma amostra de 30 jogadores e relatório de qualidade
- [x] Passo 3 — lista dos míticos e processamento completo (865 jogadores)
- [ ] Passo 4 — jogo: salas, rotação, perguntas, fichas, pontuação, palpites
- [ ] Passo 5 — Ronda Joker
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

## Pipeline

Python 3.12, a partir de `pipeline/`:

```bash
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m scout tm descarregar      # uma vez: transfermarkt-datasets (CC0, ~180 MB) → .cache/tm/
.venv/Scripts/python -m scout tm preparar         # → .cache/tm/tm.sqlite
.venv/Scripts/python -m scout paises              # → partilhado/paises.json
.venv/Scripts/python -m scout sementes            # quem entra na base → dados/candidatos.json
.venv/Scripts/python -m scout recolher --candidatos  # todos (6–7 h na 1.ª vez; retoma onde parou) → dados/jogadores/
.venv/Scripts/python -m scout premios             # volta a aplicar dados/competicoes.json aos títulos
.venv/Scripts/python -m scout validar
.venv/Scripts/python -m scout relatorio           # → saida/qualidade.md
.venv/Scripts/python -m pytest
```

- **Fontes:**
  - Wikipédia inglesa: caixa de informação, títulos, plantéis das épocas e das fases finais;
  - Wikidata: ids, nascimento, cidadania, local de nascimento, foto, ligas dos clubes;
  - zerozero: jogos, golos e assistências de cada época, em todas as competições;
  - transfermarkt-datasets: pé, altura, posição, ligas e números a partir de 2012.
- **Cache:** tudo o que vem da rede fica em `pipeline/.cache/`. Correr outra vez não pede nada à rede, e `--fresco`
  ignora a cache. Há um pedido de cada vez, e o zerozero só leva um a cada 2–3 s.
- **Sem IA:** o pipeline só lê fontes estruturadas (caixas, tabelas, Wikidata, zerozero, transfermarkt-datasets).
- **Correções à mão:** ficam em `pipeline/dados/ajustes.json`, `pipeline/dados/competicoes.json` e
  `pipeline/dados/clubes.json`. Os ajustes aplicam-se por cima das fontes em cada recolha.

## Créditos

Fontes: Anton, Inter, Courier Prime e Caveat (SIL OFL), via Fontsource. As licenças estão em `jogo/public/LICENCAS.txt`.
