from scout.fontes import wikipedia as wp

CAIXA_NOVA = """{{Infobox football biography
| name = Cristiano Ronaldo
| full_name = Cristiano Ronaldo dos Santos Aveiro
| position = [[Forward (association football)|Forward]]
| youthclubs1 = [[C.F. Andorinha|Andorinha]]
| clubs1 = [[Sporting CP B]] | years1 = 2002 | caps1 = 2 | goals1 = 0
| clubs2 = [[Sporting CP]] | years2 = 2002–2003 | caps2 = 25 | goals2 = 3
| clubs3 = [[Manchester United F.C.|Manchester United]] | years3 = 2003–2009 | caps3 = 196 | goals3 = 84
| clubs4 = [[Al Nassr FC|Al Nassr]] | years4 = 2023– | caps4 = 90 | goals4 = 80
| national_team1 = [[Portugal national under-21 football team|Portugal U21]] | national_years1 = 2002–2003 | national_caps1 = 10 | national_goals1 = 3
| national_team2 = [[Portugal national football team|Portugal]] | national_years2 = 2003– | national_caps2 = 226 | national_goals2 = 143
}}"""

# Formato antigo (nationalteam1/nationalcaps1) e caixa dentro de outra caixa, como no Rui Costa.
CAIXA_ANTIGA = """{{Infobox officeholder
| name = Rui Costa
| module = {{Infobox football biography | embed = yes
| clubs1 = [[S.L. Benfica|Benfica]] | years1 = 1990–1994 | caps1 = 78 | goals1 = 13
| clubs2 = → [[AD Fafe|Fafe]] (loan) | years2 = 1990–1991 | caps2 = 38 | goals2 = 6
| nationalteam1 = [[Portugal national football team|Portugal]] | nationalyears1 = 1993–2004 | nationalcaps1 = 94 | nationalgoals1 = 26
| managerclubs1 = [[S.L. Benfica|Benfica]] (caretaker) | manageryears1 = 2021
}}
}}"""


def test_caixa_formato_novo():
    caixa = wp.caixa_futebol(CAIXA_NOVA)
    car = wp.carreira(caixa)
    assert [c["titulo"] for c in car["clubes"]] == ["Sporting CP B", "Sporting CP", "Manchester United F.C.", "Al Nassr FC"]
    assert car["clubes"][1]["inicio"] == 2002 and car["clubes"][1]["fim"] == 2003
    assert car["clubes"][3]["aberto"] and car["clubes"][3]["fim"] is None
    assert car["clubes"][2]["jogos_liga"] == 196
    assert [s["senior"] for s in car["selecoes"]] == [False, True]
    assert car["selecoes"][1]["jogos"] == 226
    assert wp.dados_caixa(caixa)["nome_completo"] == "Cristiano Ronaldo dos Santos Aveiro"


def test_caixa_antiga_dentro_de_outra():
    caixa = wp.caixa_futebol(CAIXA_ANTIGA)
    assert caixa is not None
    car = wp.carreira(caixa)
    assert car["clubes"][1]["emprestimo"] and car["clubes"][1]["nome"] == "Fafe"
    assert car["selecoes"][0]["jogos"] == 94 and car["selecoes"][0]["golos"] == 26
    assert car["treinador"][0]["interino"] and car["treinador"][0]["nome"] == "Benfica"


HONOURS = """== Career ==
texto
== Honours ==
=== Player ===
'''Benfica'''
* [[Primeira Liga]]: [[1993–94 Primeira Liga|1993–94]]<ref>x 2019</ref>
* [[Supertaça Cândido de Oliveira]] runner-up: 1991
'''AC Milan'''
* [[UEFA Champions League]]: [[2002–03 UEFA Champions League|2002–03]]; runner-up: [[2004–05 UEFA Champions League|2004–05]]
'''Portugal U20'''
* [[FIFA World Youth Championship]]: 1991
'''Ukraine'''
* [[UEFA European Championship]]: 2016
'''Individual'''
* [[Ballon d'Or]]: 1996 (26th place), 2000 (24th place)
* [[European Golden Shoe]]: 2008, 2011
* [[FIFA World Player of the Year]]
** 7th place ([[1999 FIFA World Player of the Year|1999]])
** 3rd place (2004)
* UEFA Champions League top scorer: [[2015–16 UEFA Champions League|2015–16]]
=== Manager ===
'''Real Madrid'''
* [[La Liga]]: 2016–17
* [[UEFA Champions League]]: 2015–16, 2016–17, 2017–18
'''Individual'''
* [[The Best FIFA Football Coach]]: 2017
=== Records ===
==== As a manager ====
* First manager to reach three consecutive finals since [[Marcello Lippi]]: 2016, 2017, 2018
== References ==
"""


def test_titulos():
    linhas = wp.titulos(HONOURS)
    por = {(l["contexto"], l["texto"].split(":")[0]): l for l in linhas}
    liga = por[("jogador", "Primeira Liga")]
    assert liga["anos"] == [1993] and liga["tipo"] == "clube" and not liga["vice"]   # a referência não conta
    assert por[("jogador", "Supertaça Cândido de Oliveira runner-up")]["vice"]
    ucl = por[("jogador", "UEFA Champions League")]
    assert ucl["anos"] == [2002] and ucl["n"] == 1                                   # o "runner-up" depois do ";" sai
    assert por[("jogador", "FIFA World Youth Championship")]["tipo"] == "jovem"
    assert por[("jogador", "UEFA European Championship")]["tipo"] != "jovem"
    bola = por[("jogador", "Ballon d'Or")]
    assert bola["vice"] and bola["anos"] == []                                      # lugares na votação
    assert por[("jogador", "European Golden Shoe")]["n"] == 2
    fifa = por[("jogador", "FIFA World Player of the Year")]
    assert fifa["vice"] and fifa["anos"] == []                                      # só lugares, nas sub-linhas
    assert por[("jogador", "UEFA Champions League top scorer")]["tipo"] == "individual"
    treino = por[("treinador", "UEFA Champions League")]
    assert treino["n"] == 3 and treino["tipo"] == "clube"
    assert por[("treinador", "The Best FIFA Football Coach")]["tipo"] == "individual"
    assert not any("Lippi" in l["texto"] for l in linhas)                          # "Records" não são títulos


PLANTEL = """{{Fs start}}
{{Fs player|no=7|nat=POR|pos=FW|name=[[Cristiano Ronaldo]]}}
{{Fs player|no=8|nat=POR|pos=MF|name=[[João Pinto (footballer, born 1971)|João Pinto]]}}
{{Fs player|no=21|nat=POR|pos=DF|name=[[João Pinto (footballer, born 1961)|João Pinto]]}}
{{Fs end}}"""


def test_numeros_no_plantel():
    assert wp.numeros_no_plantel(PLANTEL, {"cristiano ronaldo"}) == {7}
    assert wp.numeros_no_plantel(PLANTEL, {"joao pinto"}) == set()     # as duas ligações apontam para homónimos
    fb = "{{fb si player |bg=y |p=[[Lionel Messi]] |eu=y |nb=ARG |n=10 |pos=FW}}"
    assert wp.numeros_no_plantel(fb, {"lionel messi"}) == {10}
    homonimo = {"joao pinto footballer born 1971"}
    assert wp.numeros_no_plantel(PLANTEL, homonimo, so_ligacao=True) == {8}


TABELA_PLANTEL = """==Squad statistics==
{| class="wikitable" style="text-align:center"
|-
!rowspan="2" valign="bottom"|No.
!rowspan="2" valign="bottom"|Pos.
!rowspan="2"|Name
!colspan="2"|League
|-
|align="left"|5||align="left"|DF||align="left"|{{flagicon|ENG}} [[Rio Ferdinand]]
|37||3
|-
|align="left"|7||align="left"|MF||align="left"|{{flagicon|POR}} [[Cristiano Ronaldo]]
|24(9)||9
|}
{| class="wikitable"
! Round !! Date !! Scorers
|-
| 12 || 5 May || [[Cristiano Ronaldo|Ronaldo]] 69'
|}"""


def test_numeros_em_tabelas():
    # A tabela dos jogos (1.ª coluna = jornada) não conta.
    assert wp.numeros_no_plantel(TABELA_PLANTEL, {"cristiano ronaldo"}) == {7}


ESTATISTICAS = """== Career statistics ==
=== Club ===
{| class="wikitable" style="text-align: center"
|+ Appearances and goals by club, season and competition
|-
!rowspan="2"|Club!!rowspan="2"|Season!!colspan="3"|League!!colspan="2"|Total
|-
!Division!!Apps!!Goals!!Apps!!Goals
|-
|rowspan="3"|[[AS Cannes|Cannes]]||[[1988–89 French Division 1|1988–89]]||[[Ligue 1|Division 1]]||2||0||2||0
|-
|[[1989–90 French Division 1|1989–90]]
|Division 1||0||0||0||0
|-
!colspan="2"|Total!!2!!0!!2!!0
|-
|rowspan="2"|[[CR Vasco da Gama|Vasco da Gama]]
|[[1992 Campeonato Brasileiro Série A|1992]]
|rowspan="2"|[[Campeonato Brasileiro Série A|Série A]]
|0||0||2||1
|-
|[[1993 Campeonato Brasileiro Série A|1993]]
|2||0||23||9
|}
=== International ===
"""


def test_ligas_por_epoca():
    linhas = wp.ligas_por_epoca(ESTATISTICAS)
    assert [(l["clube_nome"], l["epoca"], l["liga_titulo"]) for l in linhas] == [
        ("Cannes", 1988, "Ligue 1"), ("Cannes", 1989, "Ligue 1"),          # 2.ª linha: só o texto "Division 1"
        ("Vasco da Gama", 1992, "Campeonato Brasileiro Série A"),          # rowspan da coluna da liga
        ("Vasco da Gama", 1993, "Campeonato Brasileiro Série A")]


def test_titulos_epoca():
    assert wp.titulos_epoca("S.L. Benfica", 1999, 2000) == ["1999–2000 S.L. Benfica season", "2000–01 S.L. Benfica season"]


def test_limpo_sem_legendas_de_imagens():
    assert wp.limpo("[[File:X.jpg|thumb|X playing in 2005]]He made his [[debut]] at 17.") == "He made his debut at 17."
