# Tema partilhado

A "moldura" comum ao FC Intel, ao Footstop, ao Hidden Eleven e ao Guess The Kit, num só ficheiro
(`jogo/public/css/tema.css`) em que só muda a cor de destaque.

## O que os quatro jogos têm em comum

| Elemento | Como é |
|---|---|
| Fundo | relvado escuro `#06140d`, brilho radial `#134a2c`, riscas verticais de 80/160 px, linha do meio-campo e círculo central |
| Painéis | verde-escuro translúcido (`#0c2016cc`), borda branca a 10%, raio 14 px, desfoque de 6 px |
| Tipografia | Anton (títulos, códigos, relógios, placar) e Inter (texto); rótulos pequenos em maiúsculas espaçadas |
| Título | duas palavras: a primeira branca, a segunda em gradiente da cor de destaque com brilho |
| Campos | fundo `#0000004d`, raio 12 px, anel de foco de 3 px na cor de destaque |
| Botões | principal em gradiente claro → escuro com sombra colorida; fantasma; contorno; mini |
| Salas | código de 4 letras sem I nem O, `/sala/ABCD`, "Copiar link", coroa do anfitrião, ponto de cor por jogador |
| Placar e final | tabela com a linha "eu" realçada, pódio 2-1-3 com o 1.º lugar na cor de destaque |
| Como jogar | `<dialog>` nativo com a lista de regras e o botão "Percebi" |
| Avisos | toasts em baixo ao centro; aviso de ligação vermelho em cima |
| Cabeça | `theme-color` = cor de destaque; Open Graph com imagem 1200×630 (gerada de `scripts/og.html`) |

Há duas gerações. O FC Intel e o Footstop (React) usam Google Fonts, `motion` e confetti, e não têm Open Graph. O
Hidden Eleven e o Guess The Kit (HTML/CSS/JS simples) têm fontes próprias, `<dialog>`, o título em duas cores, o
`theme-color` na cor de destaque e Open Graph. O tema segue a segunda geração, porque o Scout Report é HTML/CSS/JS
simples.

**O que mudou em relação aos outros:**
- **"Como jogar" com passos numerados "01.", "02.", …** (contador `decimal-leading-zero`). Os outros jogos usam a
  numeração normal; podem passar a esta trocando o `.regras` pelo deste ficheiro.
- **A cor de destaque está só no `:root`.** Nos outros jogos há 11–12 valores da cor escritos à mão fora do `:root`
  (`#f9731655`, `#3b82f64d`…). Aqui as transparências saem de `color-mix()`:
  `--destaque-suave` (18%), `--destaque-borda` (40%), `--destaque-brilho` (33%), `--destaque-claro`.

## Tokens

```css
--destaque: #8b5cf6;        /* roxo: títulos, bordas, anéis, gradiente do botão */
--destaque-2: #9670ea;      /* violeta: texto pequeno em destaque, estados secundários */
--destaque-escuro: #6d28d9; /* fundo do gradiente do botão principal */
--destaque-tinta: #4c1d95;  /* reservado para texto sobre fundos claros */
```

Para usar o tema noutro jogo: copiar `tema.css` e as fontes (Anton, Inter), mudar estes quatro valores, o
`theme-color` e a cor do `og.html`, e trocar na paleta dos jogadores a cor que se confunda com o destaque (o Guess
The Kit tirou o laranja, o Scout Report tira o violeta `#A78BFA` e põe o verde-água `#14B8A6`).

## Contrastes

`npm run contraste` (em `jogo/`) lê os tokens dos dois CSS e falha se algum par ficar abaixo do mínimo WCAG (4,5:1
para texto normal, 3:1 para texto grande e elementos de interface).

| Par | Contraste | Uso |
|---|---|---|
| roxo `#8b5cf6` sobre o fundo | 4,45:1 | só títulos, números grandes, bordas e anéis (≥ 3:1) |
| violeta `#9670ea` sobre o fundo | 5,21:1 | texto pequeno em destaque |
| violeta `#9670ea` sobre um painel | 4,70:1 | o mesmo, dentro dos painéis |
| branco sobre o gradiente do botão | 4,23–7,10:1 | botão principal (texto a 800) |
| tinta `#1f2a44` sobre o papel `#fbf8ef` | 13,43:1 | dados à máquina nas fichas |
| CONFIRMADO `#15803d` / DESCARTADO `#b91c1c` / SEM REGISTO `#6b7280` | 4,72 / 6,09 / 4,55:1 | carimbos no papel |
| IDENTIFICADO `#6d28d9` | 6,69:1 | carimbo grande, Joker, palpite |
| SÓ PARA OS TEUS OLHOS `#991b1b` sobre a cartolina | 5,44:1 | carimbo do dossier (o vermelho normal dava 4,23:1) |

O roxo pedido (`#8b5cf6`) é mais escuro do que o azul do Hidden Eleven (5,1:1) e o laranja do Guess The Kit
(6,7:1), por isso o texto pequeno em destaque usa sempre o `#9670ea`. O branco sobre o `#9670ea` só dá 3,6:1, por
isso o violeta nunca leva texto branco por cima.

## A identidade do Scout Report (fora do tema)

`jogo/public/css/relatorio.css`:
- papel creme com grão (ruído SVG embutido);
- Courier Prime para os dados à máquina e Caveat para as notas à mão;
- carimbos com tinta gasta (máscara de ruído) e a animação de carimbar.

As fichas dos adversários têm o mesmo formato do dossier: foto (silhueta enquanto é desconhecido), nome
("[Jogador desconhecido]") e os mesmos campos, com **????** no que falta e preenchidos à medida que se confirma. Por
ordem:
1. carreira, estatísticas e prémios;
2. as notas à margem (perguntas livres);
3. as **informações descartadas**.

O rodapé, com os "sim", o clube e o palpite, está sempre à vista. O dono é um papelinho preso com um pionés da cor
dele. O IDENTIFICADO traz a foto do jogador (Wikimedia Commons, com autor e licença).

A **Ronda Joker** abre com um anúncio animado (a carta a rodar e o título) e passa a uma ficha técnica em quadrícula:
sujeito, dados conhecidos, pergunta, tempo, lance, lances dos outros e pontuação.

`jogo/public/css/app.css` tem a disposição do jogo, e **a página nunca desliza**: só desliza o interior de cada coluna.
- **Cabeçalho:** marca; "Volta 3 de 8 · A tua vez → Ana" com a barra do tempo e o relógio; Classificação e
  Acontecimentos, que descem por cima do jogo e sobem ao clicar fora; o menu com a sala, o som, o "Como jogar" e
  "Sair".
- **Computador:** perguntas à esquerda, à altura da janela; o meu dossier; as fichas abertas; e à direita a pilha das
  minimizadas, umas por cima das outras. Cabem tantas fichas quantas a largura deixar; ao abrir uma da pilha, a que foi
  aberta há mais tempo passa para lá.
- **Telemóvel:** cada coluna ocupa o ecrã e passa-se de lado, com um navegador em baixo (Perguntar, O meu, Ana, …).

## Ver o mockup

```bash
py -3.12 -m http.server 8790 --bind 127.0.0.1 --directory jogo/public
```

Abre `http://127.0.0.1:8790/mockup.html`. A barra de cima troca entre Início, Jogo, Ronda Joker, Revelação e Como
jogar.

Parâmetros para abrir um estado direto (usados nas capturas):
- `?vista=inicio|jogo|joker|revelacao`
- `?como`
- `?popup=placar|feed|menu`
- `?abrir=rui`
- `?congelar=1500` (para as animações nesse instante)

As capturas estão em `docs/capturas/`.
