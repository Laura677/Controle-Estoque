const http = require('http');
const fs = require('fs');
const path = require('path');

const arquivo = path.join(__dirname, 'data', 'db.json');
let banco = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

function erro(mensagem, status = 400) {
  const e = new Error(mensagem);
  e.status = status;
  throw e;
}

function obrigatorios(dados, campos) {
  for (const campo of campos) {
    if (dados[campo] === undefined || dados[campo] === null || String(dados[campo]).trim() === '') {
      erro('Preencha o campo: ' + campo);
    }
  }
}

async function lerDados(req) {
  let corpo = '';
  for await (const parte of req) corpo += parte;
  try {
    const dados = JSON.parse(corpo);
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error();
    return dados;
  } catch {
    erro('JSON inválido.');
  }
}

function validarFornecedor(dados, id) {
  obrigatorios(dados, ['razaoSocial', 'nomeFantasia', 'cnpj', 'telefone', 'email', 'endereco']);
  const cnpj = String(dados.cnpj).replace(/[.\/-]/g, '');
  if (!/^\d{14}$/.test(cnpj)) erro('Informe um CNPJ com 14 dígitos.');
  if (banco.fornecedores.some(f => f.cnpj === cnpj && f.id !== id)) erro('CNPJ já cadastrado.', 409);
  return { razaoSocial: dados.razaoSocial.trim(), nomeFantasia: dados.nomeFantasia.trim(), cnpj, telefone: dados.telefone.trim(), email: dados.email.trim(), endereco: dados.endereco.trim() };
}

function validarProduto(dados, id) {
  obrigatorios(dados, ['nome', 'codigo', 'categoria', 'descricao', 'preco', 'quantidade', 'fornecedorId']);
  if (typeof dados.preco !== 'number' || !Number.isFinite(dados.preco) || dados.preco < 0) erro('Preço deve ser um número não negativo.');
  if (!Number.isInteger(dados.quantidade) || dados.quantidade < 0) erro('Quantidade deve ser um inteiro não negativo.');
  if (banco.produtos.some(p => p.codigo === dados.codigo.trim() && p.id !== id)) erro('Código já cadastrado.', 409);
  if (!banco.fornecedores.some(f => f.id === dados.fornecedorId)) erro('Fornecedor não encontrado.');
  return { nome: dados.nome.trim(), codigo: dados.codigo.trim(), categoria: dados.categoria.trim(), descricao: dados.descricao.trim(), preco: dados.preco, quantidade: dados.quantidade, fornecedorId: dados.fornecedorId };
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:3000');
    const partes = url.pathname.split('/').filter(Boolean);

    if (partes[0] === 'api' && partes[1] === 'cnpj' && partes.length === 3) {
      if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não permitido.' });
      if (!/^\d{14}$/.test(partes[2])) return responder(res, 400, { erro: 'Informe 14 dígitos no CNPJ.' });
      try {
        const resposta = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + partes[2]);
        if (!resposta.ok) return responder(res, 502, { erro: 'CNPJ não encontrado ou consulta indisponível. Preencha manualmente.' });
        const dados = await resposta.json();
        if (!dados || !dados.razao_social) throw new Error();
        return responder(res, 200, dados);
      } catch {
        return responder(res, 502, { erro: 'Falha na consulta. Preencha os dados manualmente.' });
      }
    }

    if (partes[0] === 'api') {
      const tipo = partes[1];
      const id = partes[2] ? Number(partes[2]) : null;
      if (!['produtos', 'fornecedores'].includes(tipo) || partes.length > 3 || (partes[2] && (!Number.isInteger(id) || id < 1))) {
        return responder(res, 404, { erro: 'Rota não encontrada.' });
      }
      const registro = banco[tipo].find(item => item.id === id);
      if (id !== null && !registro) return responder(res, 404, { erro: 'Registro não encontrado.' });

      if (req.method === 'GET') {
        if (id !== null) return responder(res, 200, registro);
        let lista = banco[tipo];
        
        return responder(res, 200, lista);
      }

      if (req.method === 'DELETE' && id !== null) {
        if (tipo === 'fornecedores' && banco.produtos.some(p => p.fornecedorId === id)) erro('Fornecedor possui produtos vinculados.', 409);
        const novoBanco = { ...banco, [tipo]: banco[tipo].filter(item => item.id !== id) };
        fs.writeFileSync(arquivo, JSON.stringify(novoBanco, null, 2));
        banco = novoBanco;
        return responder(res, 200, { mensagem: 'Registro excluído.' });
      }

      if ((req.method === 'POST' && id === null) || (req.method === 'PUT' && id !== null)) {
        const dados = await lerDados(req);
        if (id !== null && !banco[tipo].some(item => item.id === id)) return responder(res, 404, { erro: 'Registro não encontrado.' });
        const validado = tipo === 'produtos' ? validarProduto(dados, id) : validarFornecedor(dados, id);
        const contador = tipo === 'produtos' ? 'proximoProduto' : 'proximoFornecedor';
        const novo = { id: id === null ? banco[contador] : id, ...validado };
        const novoBanco = { ...banco };
        if (id === null) {
          novoBanco[tipo] = [...banco[tipo], novo];
          novoBanco[contador]++;
        } else {
          novoBanco[tipo] = banco[tipo].map(item => item.id === id ? novo : item);
        }
        fs.writeFileSync(arquivo, JSON.stringify(novoBanco, null, 2));
        banco = novoBanco;
        return responder(res, id === null ? 201 : 200, novo);
      }
      return responder(res, 405, { erro: 'Método não permitido nesta rota.' });
    }

    const paginas = { '/': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/script.js': ['script.js', 'text/javascript'] };
    const pagina = paginas[url.pathname];
    if (!pagina) return responder(res, 404, { erro: 'Página não encontrada.' });
    if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não permitido.' });
    const conteudo = fs.readFileSync(path.join(__dirname, 'public', pagina[0]));
    res.writeHead(200, { 'Content-Type': pagina[1] + '; charset=utf-8' });
    res.end(conteudo);
  } catch (e) {
    responder(res, e.status || 500, { erro: e.status ? e.message : 'Não foi possível concluir a operação.' });
  }
});

servidor.listen(3000, () => console.log('Acesse http://localhost:3000'));
