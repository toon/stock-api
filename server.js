const express = require('express');
const cors = require('cors');
const yahooFinance = require('yahoo-finance2').default;
const app = express();
const port = 3001;

// Middleware CORS
app.use(cors());

// Rota para obter a cotação de uma ação
app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  try {
    const quote = await yahooFinance.quote(symbol);
    res.json({
      ticker: symbol,
      price: quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent,
      open: quote.regularMarketOpen,      // Preço de abertura
      high: quote.regularMarketDayHigh,   // Maior preço do dia
      low: quote.regularMarketDayLow,     // Menor preço do dia

    });
  } catch (error) {
    console.error('Erro ao recuperar cotação:', error);
    res.status(500).json({ error: 'Erro ao recuperar cotação' });
  }
});

// Rota para obter cotações de múltiplos símbolos
app.get('/api/quotes', async (req, res) => {
  const { symbols } = req.query;
  const tickers = symbols.split(',');

  try {
    const quotes = await Promise.all(tickers.map(symbol => yahooFinance.quote(symbol)));
    const stockData = quotes.map((quote, index) => ({
      ticker: tickers[index],
      price: quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent,
      open: quote.regularMarketOpen,      // Preço de abertura
      high: quote.regularMarketDayHigh,   // Maior preço do dia
      low: quote.regularMarketDayLow,     // Menor preço do dia
    }));
    res.json(stockData);
  } catch (error) {
    console.error('Erro ao recuperar cotações:', error);
    res.status(500).json({ error: 'Erro ao recuperar cotações' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
