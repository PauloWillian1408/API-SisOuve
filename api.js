// Instalações necessárias no terminal: npm install express pg cors
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware para permitir que o React Native acesse a API
app.use(cors());
app.use(express.json());

// Configuração da conexão com o Banco de Dados PostgreSQL
const pool = new Pool({
  user: 'usuario',
  host: 'localhost',
  database: 'sisouve_db',
  password: 'senha',
  port: 5432,
});

// 1. ROTA PARA CRIAR MANIFESTAÇÃO
app.post('/manifestacoes', async (req, res) => {
  const { tipo, categoria, relato, manifestante_nome } = req.body;

  // Validação simples dos dados de entrada
  if (!tipo || !relato) {
    return res.status(400).json({ error: 'Tipo e relato são obrigatórios.' });
  }

  // Lógica para gerar um número de protocolo único
  const numeroProtocolo = `OUV${Date.now()}`;

  try {
    const queryText = `
      INSERT INTO manifestacoes (protocolo, tipo, categoria, relato, status, criado_em)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    
    // Status inicial padrão definido no fluxo da Ouvidoria
    const statusInicial = 'Pendente'; 
    
    const values = [numeroProtocolo, tipo, categoria || 'Geral', relato, statusInicial];
    const resultado = await pool.query(queryText, values);

    // TODO: Futuramente, disparar aqui o serviço de e-mail ou a triagem por IA

    // Retorna para o React Native o protocolo gerado com sucesso
    return res.status(201).json({
      mensagem: 'Manifestação registrada com sucesso!',
      protocolo: numeroProtocolo,
      dados: resultado.rows[0]
    });

  } catch (error) {
    console.error('Erro ao salvar manifestação:', error);
    return res.status(500).json({ error: 'Erro interno no servidor ao processar demanda.' });
  }
});

// 2. ROTA PARA CONSULTAR PROTOCOLO
app.get('/manifestacoes/:protocolo', async (req, res) => {
  const { protocolo } = req.params;

  try {
    const queryText = 'SELECT * FROM manifestacoes WHERE protocolo = $1;';
    const resultado = await pool.query(queryText, [protocolo]);

    // Se não encontrar o protocolo digitado pelo cidadão
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Protocolo não encontrado.' });
    }

    // Retorna os dados completos (status, resposta do órgão, etc.) para o app
    return res.json(resultado.rows[0]);

  } catch (error) {
    console.error('Erro ao buscar protocolo:', error);
    return res.status(500).json({ error: 'Erro interno no servidor ao buscar dados.' });
  }
});

// Inicializando o servidor da API
app.listen(PORT, () => {
  console.log(`API do SisOuve rodando com sucesso na porta ${PORT}`);
});