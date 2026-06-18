# Reposição de estoque para GitHub Pages

Esta é a versão estática do sistema. Ela não usa backend, banco de dados, Python ou FastAPI, porque o GitHub Pages só hospeda arquivos estáticos.

O processamento acontece no navegador do usuário. Os arquivos enviados não são transferidos para servidor.

## Fluxo da tela

O sistema trabalha em 5 passos:

1. `Tecido`: upload do estoque de tecido ou malha disponível.
2. `Site`: upload do estoque atual do produto no site e escolha do modelo em `Nome Estoque`.
3. `Meta`: preenchimento manual da meta por tamanho.
4. `Bloqueadas`: upload ou digitação das cores que não podem ser cortadas.
5. `Gerar`: conferência e download da planilha final.

## Meta por tamanho

A meta não é mais enviada por arquivo. Ela é digitada na própria tela, em bolhas circulares por tamanho.

Tamanhos adultos disponíveis:

```text
P, M, G, GG, G1, G2, G3
```

Tamanhos infantis disponíveis:

```text
2, 4, 6, 8, 10, 12, 14, 16 anos
```

Digite quantidade apenas nos tamanhos que fazem parte do produto. Tamanhos vazios ficam fora do cálculo.

## Arquivos aceitos

Uploads aceitos:

```text
PDF, XLS, XLSX, XLSM, CSV e PNG
```

Para PNG, o sistema usa OCR no navegador para tentar reconhecer o texto da imagem. Funciona melhor com print ou foto nítida de tabela, com cabeçalhos visíveis como `Cor`, `Tamanho`, `Estoque` ou `Quantidade`.

Foto torta, borrada, com sombra ou sem cabeçalho pode gerar leitura incorreta. Quando possível, prefira `CSV` ou `XLSX`.

## Entrada: estoque de tecido

Formato recomendado:

| Cor | Quantidade |
| --- | --- |
| Azul Marinho | 20 |
| Off White | 12 |

Se a coluna `Quantidade` não existir, toda cor listada será considerada disponível.

## Entrada: estoque do site

O sistema procura os modelos na coluna `Nome Estoque`. Depois do upload, ele abre uma busca: digite parte do nome do modelo e clique no resultado desejado. Também é possível apertar `Enter` para escolher o primeiro resultado filtrado.

Colunas usadas:

| Nome Estoque | Cor | Tamanho | Qtd.Virtual |
| --- | --- | --- | --- |
| TSHIRT BORDADA CAVALOS NAS MANGAS | Off White 8006 | P | 29 |
| TSHIRT BORDADA CAVALOS NAS MANGAS | Off White 8006 | XG | 19 |

Importante:

- A coluna `Qtd.Real` é ignorada.
- A coluna usada no cálculo é sempre `Qtd.Virtual`.
- `XG` é tratado como `G1`.

Outras colunas, como código, categoria, preço ou endereço de estoque, podem existir no arquivo, mas não entram no cálculo.

## Entrada: cores bloqueadas

Pode ser arquivo ou texto digitado na tela:

| Cor |
| --- |
| Verde Militar |
| Rosa Seco |

Esse passo é opcional.

## Regra

Para cada cor que existe no site, possui tecido disponível e não está bloqueada:

```text
reposicao = max(meta_por_tamanho - qtd_virtual_do_site, 0)
```

A reposição considera somente cores que já existem no estoque do site para o modelo escolhido. Depois disso, o sistema mantém na aba `Reposição Final` apenas as cores que também possuem tecido disponível e não estão bloqueadas. Cores que existem no tecido, mas não existem no site para aquele modelo, não entram na reposição.

## Saída

O arquivo baixado é uma planilha `.xlsx` com as abas:

| Aba | Conteúdo |
| --- | --- |
| `Reposição Final` | Resultado principal em grade: Modelo, Cor, Estoque por tamanho, Meta por tamanho, Repor por tamanho e Total Repor. |
| `Resumo` | Totais principais e regras aplicadas. |
| `Agrupado por Grade` | Agrupa cores que possuem a mesma distribuição de reposição. |
| `Excluídas já cortadas` | Cores bloqueadas, com estoque e falta calculada. |
| `Sem tecido disponível` | Cores do site com falta, mas sem tecido disponível. |
| `Cores em estoque` | Lista de cores do tecido e chave de comparação usada. |
| `Critérios` | Modelo, meta, arquivos usados e regras de cálculo. |

## Como publicar

1. Crie um repositório no GitHub.
2. Envie estes arquivos para a raiz do repositório:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `.nojekyll`
3. No GitHub, abra `Settings > Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Escolha a branch `main` e a pasta `/root`.
6. Salve e aguarde o link do GitHub Pages.
