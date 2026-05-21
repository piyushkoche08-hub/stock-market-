import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import cors from 'cors';
import { marketService } from './services/marketService';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// REST Endpoints
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query || query.length < 1) {
            return res.json([]);
        }
        const results = await marketService.searchSymbols(query);
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/market-summary', async (req, res) => {
    try {
        const summary = await marketService.getMarketSummary();
        res.json(summary);
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ error: 'Summary failed' });
    }
});

// WebSocket Handling
wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');
    let subscribedSymbols: string[] = [];

    ws.on('message', (message: WebSocket.Data) => {
        try {
            const data = JSON.parse(message.toString());

            
            if (data.type === 'subscribe') {
                const symbols = data.symbols as string[];
                subscribedSymbols = [...new Set([...subscribedSymbols, ...symbols])];
                marketService.subscribeClient(ws, subscribedSymbols);
            } else if (data.type === 'unsubscribe') {
                const symbols = data.symbols as string[];
                subscribedSymbols = subscribedSymbols.filter(s => !symbols.includes(s));
                marketService.updateClientSubscriptions(ws, subscribedSymbols);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        marketService.removeClient(ws);
    });
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    console.log(`Global Market Server running on port ${PORT}`);
    marketService.initialize();
});
