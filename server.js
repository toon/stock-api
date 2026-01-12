const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

// --- CONFIGURAÇÃO YAHOO FINANCE ---
let yahooFinance;
const yfModule = require('yahoo-finance2');

if (yfModule.default) {
    if (typeof yfModule.default === 'function') {
        yahooFinance = new yfModule.default();
    } else {
        yahooFinance = yfModule.default;
    }
} else {
    yahooFinance = yfModule;
}

const app = express();
const port = 3001;

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const yahooConfig = { fetchOptions: { headers: { 'User-Agent': userAgent } } };

app.use(cors());

// --- 1. MAPEAMENTO DE TÍTULOS (ADICIONE NOVOS AQUI) ---
// Basta adicionar uma nova linha com o Ticker desejado e a URL correspondente
const TESOURO_URLS = {
    'SELIC2029': 'https://taxas-tesouro.com/resgatar/tesouro-selic-2029/',
    'IPCA2035': 'https://taxas-tesouro.com/resgatar/tesouro-ipca+-2035/'
};

// --- 2. FUNÇÃO GENÉRICA DE SCRAPING ---
async function getTesouroData(ticker, url) {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': userAgent }
        });

        const $ = cheerio.load(data);

        // Caminho baseado no seu importxml:
        // /html/body/div/div[1]/div/div[2]/main/div/div/div[1]/div[4]/div[2]/span
        // Como o site usa o mesmo template para ambos, o caminho é o mesmo.
        let element = $('main')
            .children('div').first()     // div
            .children('div').first()     // div
            .children('div').eq(0)       // div[1]
            .children('div').eq(3)       // div[4]
            .children('div').eq(1)       // div[2]
            .find('span');               // span

        let priceText = element.text();

        // Fallback de segurança se o seletor exato falhar
        if (!priceText) {
             priceText = $('div:contains("R$")').last().text();
        }

        // Limpeza de string (R$ 1.000,00 -> 1000.00)
        let cleanString = priceText.replace(/[^\d.,]/g, '').trim();
        
        if (cleanString.includes(',') && cleanString.includes('.')) {
            cleanString = cleanString.replace(/\./g, '').replace(',', '.');
        } else if (cleanString.includes(',')) {
            cleanString = cleanString.replace(',', '.');
        }

        const price = parseFloat(cleanString);

        if (isNaN(price)) {
            return { ticker, error: 'Erro de conversão', price: 0 };
        }

        return {
            ticker: ticker,
            price: price,
            changePercent: 0,
            open: price,
            high: price,
            low: price,
            close: price,
            regularMarketTime: new Date()
        };

    } catch (error) {
        console.error(`Erro ao ler ${ticker}:`, error.message);
        return { ticker, error: 'Falha na leitura', price: 0 };
    }
}

// --- ROTAS ---

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  // Verifica se o símbolo está no nosso mapa do Tesouro
  if (TESOURO_URLS[symbol]) {
      const url = TESOURO_URLS[symbol];
      const data = await getTesouroData(symbol, url);
      return res.json(data);
  }

  // Se não for Tesouro, tenta Yahoo
  try {
    const quote = await yahooFinance.quote(symbol, {}, yahooConfig);
    res.json({
      ticker: symbol,
      price: quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent,
      open: quote.regularMarketOpen,      
      high: quote.regularMarketDayHigh,   
      low: quote.regularMarketDayLow,     
      close: quote.regularMarketPreviousClose, 
      regularMarketTime: quote.regularMarketTime, 
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao recuperar cotação' });
  }
});

app.get('/api/quotes', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Nenhum símbolo fornecido' });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase());
  
  // Separa o que é Tesouro (Custom) do que é Yahoo
  const tesouroTickers = tickers.filter(t => TESOURO_URLS[t]);
  const yahooTickers = tickers.filter(t => !TESOURO_URLS[t]);

  const results = [];

  // 1. Processa Tesouro em paralelo (Promise.all)
  if (tesouroTickers.length > 0) {
      const tesouroPromises = tesouroTickers.map(t => getTesouroData(t, TESOURO_URLS[t]));
      const tesouroResults = await Promise.all(tesouroPromises);
      results.push(...tesouroResults);
  }

  // 2. Processa Yahoo em lote
  if (yahooTickers.length > 0) {
      try {
          const quotes = await yahooFinance.quote(yahooTickers, {}, yahooConfig);
          const formattedYahoo = quotes.map(quote => ({
              ticker: quote.symbol,
              price: quote.regularMarketPrice,
              changePercent: quote.regularMarketChangePercent,
              open: quote.regularMarketOpen,
              high: quote.regularMarketDayHigh,
              low: quote.regularMarketDayLow,
              close: quote.regularMarketPreviousClose,
              regularMarketTime: quote.regularMarketTime,
          }));
          results.push(...formattedYahoo);
      } catch (err) { console.error("Erro Yahoo Batch:", err.message); }
  }
    
  res.json(results);
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log('Títulos do Tesouro suportados:', Object.keys(TESOURO_URLS).join(', '));
});


// const express = require('express');
// const cors = require('cors');

// // 1. IMPORTAÇÃO INTELIGENTE (Resolve o problema do Node 22)
// // Tenta importar de todas as formas possíveis e garante que temos uma instância válida
// let yahooFinance;
// const yfModule = require('yahoo-finance2');

// if (yfModule.default) {
//     // Se for uma Classe (função), instanciamos. Se for objeto, usamos direto.
//     if (typeof yfModule.default === 'function') {
//         yahooFinance = new yfModule.default();
//     } else {
//         yahooFinance = yfModule.default;
//     }
// } else {
//     // Fallback para versões antigas ou imports diretos
//     yahooFinance = yfModule;
// }

// const app = express();
// const port = 3001;

// // 2. CONFIGURAÇÃO ANTI-BLOQUEIO
// // Mantemos o User-Agent aqui para passar em cada chamada
// const yahooConfig = {
//   fetchOptions: {
//     headers: {
//       'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
//     }
//   }
// };

// app.use(cors());

// // Rota para obter a cotação de uma ação
// app.get('/api/quote/:symbol', async (req, res) => {
//   const symbol = req.params.symbol;
//   try {
//     // 3. Passamos {}, yahooConfig
//     const quote = await yahooFinance.quote(symbol, {}, yahooConfig);
    
//     res.json({
//       ticker: symbol,
//       price: quote.regularMarketPrice,
//       changePercent: quote.regularMarketChangePercent,
//       open: quote.regularMarketOpen,      
//       high: quote.regularMarketDayHigh,   
//       low: quote.regularMarketDayLow,     
//       close: quote.regularMarketPreviousClose, 
//       regularMarketTime: quote.regularMarketTime, 
//     });
//   } catch (error) {
//     console.error(`Erro ao recuperar cotação de ${symbol}:`, error.message);
//     res.status(500).json({ error: 'Erro ao recuperar cotação' });
//   }
// });

// // Rota para obter cotações de múltiplos símbolos
// app.get('/api/quotes', async (req, res) => {
//   const { symbols } = req.query;
  
//   if (!symbols) {
//     return res.status(400).json({ error: 'Nenhum símbolo fornecido' });
//   }

//   const tickers = symbols.split(',');

//   try {
//     // 4. Chamada em lote com config
//     const quotes = await yahooFinance.quote(tickers, {}, yahooConfig);
    
//     const stockData = quotes
//       .filter(quote => {
//         if (quote) return true;
//         console.warn(`Cotação não encontrada para um dos tickers.`);
//         return false;
//       })
//       .map(quote => ({
//         ticker: quote.symbol,
//         price: quote.regularMarketPrice,
//         changePercent: quote.regularMarketChangePercent,
//         open: quote.regularMarketOpen,
//         high: quote.regularMarketDayHigh,
//         low: quote.regularMarketDayLow,
//         close: quote.regularMarketPreviousClose,
//         regularMarketTime: quote.regularMarketTime,
//       }));
      
//     res.json(stockData);
//   } catch (error) {
//     console.error('Erro ao recuperar cotações (Lista):', error.message);
    
//     if (error.message.includes('invalid json') || error.message.includes('Too Many Requests')) {
//         return res.status(429).json({ error: 'O Yahoo bloqueou as requisições temporariamente. Tente novamente em instantes.' });
//     }

//     res.status(500).json({ error: 'Erro ao recuperar cotações' });
//   }
// });

// app.listen(port, () => {
//   console.log(`Servidor rodando na porta ${port}`);
//   console.log(`Yahoo Finance Library status: ${yahooFinance ? 'Carregada' : 'Falha'}`);
// });

// // const express = require('express');
// // const cors = require('cors');
// // const yahooFinance = require('yahoo-finance2').default;
// // const app = express();
// // const port = 3001;

// // // Middleware CORS
// // app.use(cors());

// // // Rota para obter a cotação de uma ação
// // app.get('/api/quote/:symbol', async (req, res) => {
// //   const symbol = req.params.symbol;
// //   try {
// //     const quote = await yahooFinance.quote(symbol);
// //     res.json({
// //       ticker: symbol,
// //       price: quote.regularMarketPrice,
// //       changePercent: quote.regularMarketChangePercent,
// //       open: quote.regularMarketOpen,      // Preço de abertura
// //       high: quote.regularMarketDayHigh,   // Maior preço do dia
// //       low: quote.regularMarketDayLow,     // Menor preço do dia
// //       close: quote.regularMarketPreviousClose, // Preço de fechamento anterior
// //       regularMarketTime: quote.regularMarketTime, // Datatime da cotação

// //     });
// //   } catch (error) {
// //     console.error('Erro ao recuperar cotação:', error);
// //     res.status(500).json({ error: 'Erro ao recuperar cotação' });
// //   }
// // });

// // // Rota para obter cotações de múltiplos símbolos
// // app.get('/api/quotes', async (req, res) => {
// //   const { symbols } = req.query;
// //   const tickers = symbols.split(',');

// //   try {
// //     // 1. Faz uma única chamada para a API com todos os tickers, que é mais eficiente.
// //     const quotes = await yahooFinance.quote(tickers);
    
// //     // 2. Filtra os resultados para remover tickers que não foram encontrados (retornam como undefined).
// //     const stockData = quotes
// //       .filter(quote => {
// //         if (quote) return true;
// //         // Opcional: log para saber qual ticker falhou.
// //         // A biblioteca já retorna o ticker no objeto, então não precisamos do 'tickers[index]'.
// //         console.warn(`Cotação não encontrada para um dos tickers.`);
// //         return false;
// //       })
// //       .map(quote => ({
// //         // 3. Mapeia os dados para o formato desejado, usando o 'symbol' do próprio objeto de cotação.
// //         ticker: quote.symbol,
// //         price: quote.regularMarketPrice,
// //         changePercent: quote.regularMarketChangePercent,
// //         open: quote.regularMarketOpen,
// //         high: quote.regularMarketDayHigh,
// //         low: quote.regularMarketDayLow,
// //         close: quote.regularMarketPreviousClose,
// //         regularMarketTime: quote.regularMarketTime,
// //       }));
      
// //     res.json(stockData);
// //   } catch (error) {
// //     console.error('Erro ao recuperar cotações:', error);
// //     res.status(500).json({ error: 'Erro ao recuperar cotações' });
// //   }
// // });

// // app.listen(port, () => {
// //   console.log(`Servidor rodando na porta ${port}`);
// // });
