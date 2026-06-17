# Reposicao de Estoque

Programa em HTML, CSS e JavaScript para calcular reposicao de estoque por modelo, cor e tamanho.

## Como rodar no GitHub Pages

1. Crie um repositorio no GitHub.
2. Envie estes arquivos para a raiz do repositorio:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
   - `CODIGO.md`
3. No GitHub, entre em `Settings > Pages`.
4. Em `Build and deployment`, escolha:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Salve e aguarde o GitHub gerar o link.

O GitHub Pages vai abrir automaticamente o arquivo `index.html`.

## Arquivos aceitos

- `.csv`
- `.tsv`
- `.txt`
- `.xlsx`
- `.xlsm`

Para ler Excel no navegador, o app usa a biblioteca SheetJS via CDN. Se o Excel nao carregar, envie os dados em CSV.

## Regras ja configuradas

- Grades ideais de T-shirt Tradicional, T-shirt Max, Camiseta Over e Cropped Max.
- Malha Max e Malha Select consolidadas como `Malha Max/Select`.
- Azul Marinho normalizado como Azul Dark Blue.
- Cores com tecido, mas ausentes no site do modelo, ficam fora da reposicao.
- Estoque negativo entra no calculo.
- XG e G1 podem ser agrupados como XG/G1 quando configurado.

## Privacidade

Os arquivos enviados nao vao para servidor. O calculo acontece no navegador.
