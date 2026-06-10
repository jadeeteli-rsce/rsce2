const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

let websiteContent = '';
const CACHE_FILE = path.join(__dirname, 'website-cache.txt');

const RSCE_URLS = [
  'https://www.rsce.es/',
  'https://www.rsce.es/quienes-somos/',
  'https://www.rsce.es/organigrama/',
  'https://www.rsce.es/socios-abonados/',
  'https://www.rsce.es/eventos-rsce/',
  'https://www.rsce.es/razas-espanolas/',
  'https://www.rsce.es/morfologia/',
  'https://www.rsce.es/agility/',
  'https://www.rsce.es/igp/',
  'https://www.rsce.es/obediencia/',
  'https://www.rsce.es/busqueda-y-rescate/',
  'https://www.rsce.es/rally-obediencia/',
  'https://www.rsce.es/grooming/',
  'https://www.rsce.es/salud-y-bienestar-rsce/',
  'https://www.rsce.es/criadores/',
  'https://www.rsce.es/criadores-premium/',
  'https://www.rsce.es/servicios-rsce/',
  'https://www.rsce.es/tramites-rsc/',
  'https://www.rsce.es/afijos/',
  'https://www.rsce.es/displasia/',
  'https://www.rsce.es/certificados-de-pedigree/',
  'https://www.rsce.es/tarifas/',
  'https://www.rsce.es/contacto-rsce/',
  'https://www.rsce.es/reglamentos_rsce/',
  'https://www.rsce.es/area-de-formaciones/',
  'https://www.rsce.es/noticias-rsce/',
  'https://www.rsce.es/jueces-de-la-rsce/',
  'https://www.rsce.es/faq/',
];

async function scrapeWebsite() {
  console.log('Iniciando extraccion del sitio web de la RSCE...');
  let allContent = '';
  for (const url of RSCE_URLS) {
    try {
      console.log('Extrayendo: ' + url);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const $ = cheerio.load(response.data);
      const title = $('title').text();
      const mainContent = $('main').text() || $('body').text();
      const description = $('meta[name="description"]').attr('content');
      allContent += '\n\n--- Pagina: ' + title + ' ---\n';
      allContent += 'Descripcion: ' + description + '\n';
      allContent += mainContent.substring(0, 15000);
    } catch (error) {
      console.error('Error al extraer ' + url + ': ' + error.message);
    }
  }
  websiteContent = allContent;
  console.log('Longitud del contenido extraido: ' + websiteContent.length + ' caracteres');
  return websiteContent;
}

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    websiteContent = fs.readFileSync(CACHE_FILE, 'utf-8');
    console.log('Cache cargado: ' + websiteContent.length + ' caracteres');
  } else {
    console.log('No hay cache, esperando primer scrape...');
  }
}

async function scrapeAndCache() {
  await scrapeWebsite();
  fs.writeFileSync(CACHE_FILE, websiteContent, 'utf-8');
  console.log('Cache guardado en website-cache.txt');
}

loadCache();
scrapeAndCache().catch(err => console.error('Error en scrape inicial:', err));
setInterval(scrapeAndCache, 24 * 60 * 60 * 1000);

app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage || userMessage.trim() === '') {
    return res.json({ reply: 'Por favor, escribe una pregunta!', confidence: 'none' });
  }
  if (!websiteContent) {
    return res.json({
      reply: 'Todavia estoy cargando la informacion. Por favor, intentalo de nuevo en un momento.',
      confidence: 'low'
    });
  }
  try {
    let reply = (await model.generateContent('Eres un asistente virtual de la RSCE (Real Sociedad Canina de Espana).\nResponde SIEMPRE en espanol.\nBasandote UNICAMENTE en el contenido del sitio web proporcionado, responde de forma precisa y detallada.\nSi la informacion no esta disponible, sugiere contactar con info@rsce.es\n\nContenido del sitio web:\n' + websiteContent + '\n\nPregunta del usuario: ' + userMessage)).response.text();
    reply = reply.replace(/\*\*(.*?)\*\*/g, '$1');
    reply = reply.replace(/\*(.*?)\*/g, '$1');
    reply = reply.replace(/#{1,6}\s/g, '');
    res.json({ reply, confidence: 'high', source: 'basado-en-web' });
  } catch (error) {
    console.error('Error al llamar a Gemini:', error.message);
    res.json({
      reply: 'Ha ocurrido un error. Por favor, contactanos en info@rsce.es',
      confidence: 'low',
      error: error.message
    });
  }
});

app.post('/api/rescrape', async (req, res) => {
  try {
    await scrapeAndCache();
    res.json({ message: 'Contenido del sitio web actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'activo',
    contenidoCargado: websiteContent.length > 0,
    tamanoContenido: websiteContent.length,
    proveedorIA: 'Google Gemini (gemini-2.5-flash)'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('Chatbot RSCE ejecutandose en el puerto ' + PORT);
  console.log('Proveedor de IA: Google Gemini (gemini-2.5-flash)');
  console.log('Abre http://localhost:' + PORT + ' en tu navegador');
});
