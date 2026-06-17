# Codigo do Programa

Este projeto roda em HTML no GitHub Pages.

## Arquivo principal

O arquivo que abre o programa e deve ficar na raiz do repositorio e:

```text
index.html
```

O GitHub Pages procura esse arquivo automaticamente.

## Estrutura do projeto

```text
reposicao-estoque-html-github/
├── index.html
├── styles.css
├── app.js
├── README.md
└── CODIGO.md
```

## O que cada arquivo faz

### `index.html`

Monta a tela do programa:

- upload de estoque atual
- upload de cadastro do site
- upload de estoque de tecido
- tela de regras
- tela de resultado
- botao para exportar CSV

Tambem carrega:

```html
<link rel="stylesheet" href="styles.css" />
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="app.js"></script>
```

### `styles.css`

Controla o visual do sistema:

- layout
- botoes
- tabelas
- abas
- paineis
- responsividade para tela menor

### `app.js`

Contem a programacao do sistema:

- leitura de arquivos CSV e Excel
- deteccao automatica de colunas
- cadastro das grades ideais
- aliases de cor
- equivalencia de base de tecido
- calculo da reposicao
- filtro de resultado
- download do CSV final
- salvamento das regras no navegador com `localStorage`

## Regra principal do calculo

Para cada modelo, cor e tamanho:

```text
reposicao = grade ideal - estoque atual
```

Quando o resultado for menor que zero, a reposicao fica `0`.

O estoque negativo entra no calculo quando a opcao estiver marcada.

## Publicar no GitHub

Suba todos os arquivos para a raiz do repositorio.

Depois ative o GitHub Pages em:

```text
Settings > Pages > Deploy from a branch > main > /root
```

Quando o GitHub terminar a publicacao, o programa vai abrir pelo link do Pages.
