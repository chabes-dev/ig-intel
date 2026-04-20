# IG Intel

Ferramenta de análise de conteúdo do Instagram via Apify.

## Deploy em 5 passos

### 1. Suba no GitHub
- Crie um repositório novo em github.com (pode ser privado)
- Faça upload dos arquivos desta pasta

### 2. Conecte no Vercel
- Acesse vercel.com e faça login com sua conta GitHub
- Clique em "Add New Project"
- Selecione o repositório ig-intel
- Clique em "Deploy" — sem configurações extras necessárias

### 3. Acesse a ferramenta
- O Vercel vai gerar uma URL tipo: `ig-intel-xyz.vercel.app`
- Abra no browser, insira seu Apify token uma vez
- O token fica salvo permanentemente no localStorage

## Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse em http://localhost:5173

## Stack
- React 18
- Vite
- Apify Instagram Scraper API
