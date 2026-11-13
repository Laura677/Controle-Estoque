const formFornecedor = document.getElementById('form-fornecedor');
const formProduto = document.getElementById('form-produto');
let fornecedores = [];
let produtos = [];

function mensagem(texto) {
  document.getElementById('mensagem').textContent = texto;
}

async function api(url, metodo = 'GET', dados) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: dados ? JSON.stringify(dados) : undefined
  });
  const resultado = await resposta.json();
  if (!resposta.ok) throw new Error(resultado.erro);
  return resultado;
}

// textContent apresenta os dados dos formulários como texto na tabela.
function celula(linha, texto) {
  const coluna = document.createElement('td');
  coluna.textContent = texto;
  linha.appendChild(coluna);
  return coluna;
}

function botoes(linha, tipo, id) {
  const coluna = celula(linha, '');
  for (const acao of ['Consultar', 'Editar', 'Excluir']) {
    const botao = document.createElement('button');
    botao.textContent = acao;
    botao.onclick = () => executar(tipo, id, acao);
    coluna.appendChild(botao);
  }
}

async function carregar() {
  fornecedores = await api('/api/fornecedores');
  produtos = await api('/api/produtos');
  const lista = document.getElementById('fornecedores');
  lista.replaceChildren();
  formProduto.elements.fornecedorId.replaceChildren(new Option('Selecione', ''));
  for (const f of fornecedores) {
    const linha = document.createElement('tr');
    celula(linha, f.nomeFantasia + ' / ' + f.razaoSocial);
    celula(linha, f.cnpj);
    celula(linha, f.telefone + ' / ' + f.email);
    celula(linha, f.endereco);
    botoes(linha, 'fornecedores', f.id);
    lista.appendChild(linha);
    formProduto.elements.fornecedorId.add(new Option(f.nomeFantasia, f.id));
  }
  const filtro = document.getElementById('categoria');
  const selecionada = filtro.value;
  filtro.replaceChildren(new Option('Todas', ''));
  for (const categoria of new Set(produtos.map(p => p.categoria))) filtro.add(new Option(categoria, categoria));
  filtro.value = selecionada;
  listarProdutos();
}

function listarProdutos() {
  const lista = document.getElementById('produtos');
  lista.replaceChildren();
  const pesquisa = document.getElementById('pesquisa').value.toLowerCase();
  const categoria = document.getElementById('categoria').value;
  const total = produtos.reduce((soma, p) => soma + p.preco * p.quantidade, 0);
  document.getElementById('valor-total').textContent = 'Valor total do estoque: R$ ' + total.toFixed(2);
  for (const p of produtos) {
    if (!p.nome.toLowerCase().includes(pesquisa) || (categoria && p.categoria !== categoria)) continue;
    const linha = document.createElement('tr');
    if (p.quantidade < 5) linha.className = 'baixo';
    celula(linha, p.nome);
    celula(linha, p.codigo);
    celula(linha, p.categoria);
    celula(linha, 'R$ ' + p.preco.toFixed(2));
    celula(linha, p.quantidade + (p.quantidade < 5 ? ' — Estoque baixo' : ''));
    celula(linha, fornecedores.find(f => f.id === p.fornecedorId)?.nomeFantasia);
    botoes(linha, 'produtos', p.id);
    lista.appendChild(linha);
  }
}

async function executar(tipo, id, acao) {
  try {
    if (acao === 'Excluir') {
      if (!confirm('Confirma a exclusão deste registro?')) return;
      await api('/api/' + tipo + '/' + id, 'DELETE');
      mensagem('Registro excluído.');
      await carregar();
      return;
    }
    const registro = await api('/api/' + tipo + '/' + id);
    if (acao === 'Consultar') {
      document.getElementById('detalhes').textContent = JSON.stringify(registro, null, 2);
    } else {
      const form = tipo === 'produtos' ? formProduto : formFornecedor;
      for (const campo in registro) form.elements[campo].value = registro[campo];
      form.scrollIntoView();
    }
  } catch (e) { mensagem(e.message); }
}

async function salvar(evento, tipo, form) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(form));
  const id = dados.id;
  delete dados.id;
  if (tipo === 'produtos') {
    dados.preco = Number(dados.preco);
    dados.quantidade = Number(dados.quantidade);
    dados.fornecedorId = Number(dados.fornecedorId);
  }
  try {
    await api('/api/' + tipo + (id ? '/' + id : ''), id ? 'PUT' : 'POST', dados);
    form.reset();
    mensagem('Registro salvo.');
    await carregar();
  } catch (e) { mensagem(e.message); }
}

formFornecedor.onsubmit = e => salvar(e, 'fornecedores', formFornecedor);
formProduto.onsubmit = e => salvar(e, 'produtos', formProduto);
document.getElementById('pesquisa').oninput = listarProdutos;
document.getElementById('categoria').onchange = listarProdutos;
document.getElementById('consultar-cnpj').onclick = async () => {
  const aviso = document.getElementById('consulta');
  const cnpj = formFornecedor.elements.cnpj.value.replace(/[.\/-]/g, '').trim();
  aviso.textContent = 'Consultando…';
  try {
    const dados = await api('/api/cnpj/' + encodeURIComponent(cnpj));
    formFornecedor.elements.razaoSocial.value = dados.razao_social || '';
    formFornecedor.elements.nomeFantasia.value = dados.nome_fantasia || '';
    formFornecedor.elements.telefone.value = dados.ddd_telefone_1 || '';
    formFornecedor.elements.email.value = dados.email || '';
    formFornecedor.elements.endereco.value = [dados.logradouro, dados.numero, dados.complemento, dados.bairro, dados.municipio, dados.uf, dados.cep].filter(Boolean).join(', ');
    aviso.textContent = 'Situação: ' + (dados.descricao_situacao_cadastral || 'Não informada') + '. Município: ' + (dados.municipio || '') + '. Estado: ' + (dados.uf || '') + '. Confira e complete os dados.';
  } catch (e) { aviso.textContent = e.message; }
};
carregar().catch(e => mensagem(e.message));
